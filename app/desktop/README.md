# DurableFunctions HITL — Desktop アプリ（Electron）

既存の `app/web`（Next.js + Tailwind + shadcn の Human-in-the-loop 画面）を
**Electron でデスクトップアプリ化**したものです。UI・ロジックは `app/web` を流用しています。

## アーキテクチャ

Electron は **「Next.js アプリ（`app/web`）を表示するシェル」** です。
UI もサーバーロジック（API ルート）も `app/web` をそのまま流用します。

```
┌──────────────────── Electron (app/desktop) ────────────────────┐
│                                                                 │
│  main process (Node)              Renderer (Chromium)           │
│  ┌────────────────┐   loadURL     ┌───────────────────────┐     │
│  │ ・ウィンドウ生成 │ ───────────▶ │  = app/web の画面      │     │
│  │ ・prod時はNextを │              │  （React / shadcn UI） │     │
│  │   spawn         │              └───────────┬───────────┘     │
│  └───────┬─────────┘                          │ fetch /api/*    │
│          │(本番のみ) spawn                     │                 │
└──────────┼────────────────────────────────────┼─────────────────┘
           ▼                                     ▼
   Next.js server (app/web) ◀───────────────────┘
           │  Route Handlers (/api/start, /api/approve, /api/status)
           │  proxy（サーバー間 fetch・CORS 不要）
           ▼
   Azure Functions (../../server, :7071)  ──▶  Durable Functions
           （httpStart / sendApproval / approvalOrchestrator / processApproval）
```

### モード別の動作

| モード | Renderer が読み込む URL | Next.js サーバー |
|--------|-------------------------|------------------|
| **開発** (`npm run dev`) | `http://localhost:3000` | `app/web` の `next dev`（別プロセス、ホットリロード有効） |
| **本番** (`npm run start:prod`) | `http://127.0.0.1:34567`（既定） | main が `.next/standalone/server.js` を **spawn**し、ポート待機後にロード |

### ポイント

- **UI もロジックも流用**: `app/web` を1行も書き換えず、その画面と API ルートを再利用。
- **Electron は表示に専念**: 業務ロジックは Next.js 側（さらに func 側）にあり、
  Electron main は「ウィンドウ生成」「本番時のサーバー spawn」「ポート待機」だけを担う。
- **セキュリティ**: `contextIsolation: true` / `nodeIntegration: false`。
  外部リンクは `shell.openExternal` で既定ブラウザに開く。
- **バックエンドは別プロセス**: func / Azurite は Desktop の管理外（別途起動）。

## 前提：バックエンドは別途起動

Desktop アプリは **UI のみ** です。Azure Functions（Durable）と Azurite は
**別途起動**しておく必要があります（このリポジトリの `server/` と Azurite）。

```bash
# 1) Azurite（ストレージエミュレータ）
azurite --silent --location ./__azurite__

# 2) バックエンド（Azure Functions）
cd server && npm start        # http://localhost:7071
```

## 開発モードで起動

```bash
cd app/desktop
npm install          # 初回のみ（Electron 等を取得）
npm run dev
```

`npm run dev` は以下を同時に行います:

1. `app/web` の `next dev`（:3000）を起動
2. `:3000` の待受を待って Electron を起動し、ウィンドウに画面を表示

→ ウィンドウ内で「DurableFunctions Start」→「承認 / 拒否」を操作できます。

## 本番モードで確認

```bash
cd app/desktop
npm run build        # app/web を standalone ビルド + Electron を tsc コンパイル
npm run start:prod   # Electron が standalone サーバーを spawn して表示
```

## スクリプト一覧

| スクリプト | 内容 |
|-----------|------|
| `npm run dev` | web(dev) + Electron を同時起動（開発） |
| `npm run compile` | Electron 用 TypeScript を `dist/` へコンパイル |
| `npm run build` | `app/web` を standalone ビルド + Electron コンパイル |
| `npm run start:prod` | 本番モードで Electron 起動（standalone サーバーを spawn） |
| `npm run dist` | electron-builder でパッケージング（雛形） |

## 環境変数

| 変数 | 既定値 | 用途 |
|------|--------|------|
| `DEV_URL` | `http://localhost:3000` | 開発時に読み込む URL |
| `PROD_PORT` | `34567` | 本番 standalone サーバーのポート |
| `FUNCTIONS_BASE_URL` | `http://localhost:7071` | Functions バックエンドの URL |

## ディレクトリ構成

```
app/desktop/
├── package.json
├── tsconfig.json
├── electron/
│   ├── main.ts        # ウィンドウ生成 / dev:loadURL / prod:standalone spawn
│   └── preload.ts     # 最小・セキュアな preload
└── dist/              # コンパイル出力（自動生成）
```

## 補足・発展

- **バックエンドの同梱起動**: 現状は別途起動が前提です。将来的に Electron の main から
  func / Azurite を spawn して統合起動する拡張が可能です。
- **配布（electron-builder）**: `npm run dist` は雛形です。standalone 出力（`.next/standalone`・
  `.next/static`・`public`）の同梱最適化やコード署名は別途対応が必要です。
