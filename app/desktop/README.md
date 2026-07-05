# Desktop アプリ（Electron・薄いシェル方式）

`app/web`（Next.js の Durable Functions & Microsoft Agent Framework 可視化 UI）を
**Electron でデスクトップアプリ化**したものです。

## アーキテクチャ（薄いシェル / Thin Shell）

Electron は **「デプロイ済み Web を表示するだけのシェル」** です。
UI もサーバーロジック（API ルート）も、Azure Container Apps 上で動く `app/web` を
そのまま読み込みます。デスクトップ側にはビジネスロジックを持ちません。

```
┌──────────── Electron (app/desktop) ────────────┐
│  main process            Renderer (Chromium)   │
│  ┌────────────┐ loadURL  ┌───────────────────┐ │
│  │ ウィンドウ  │ ───────▶ │  デプロイ済み Web   │ │
│  │ 生成のみ    │          │  (Container Apps)  │ │
│  └────────────┘          └─────────┬─────────┘ │
└──────────────────────────────────┼────────────┘
                                    │ fetch /api/*
                                    ▼
     Azure Container Apps: app/web (Next.js)
                                    │ proxy（サーバー間 fetch）
                                    ▼
     Azure Functions（Durable Functions / Agent Framework）
                                    ▼
                       Azure OpenAI (gpt-5-mini)
```

### モード別の動作

| モード | Renderer が読み込む URL |
|--------|-------------------------|
| **開発** (`npm run dev`) | `http://localhost:3000`（`app/web` の `next dev`） |
| **本番** (`npm run start:prod`) | デプロイ済み Web URL（Azure Container Apps） |

既定の本番 URL は `electron/main.ts` の `DEFAULT_WEB_URL`。
環境変数 `WEB_URL` で上書きできます。

### この方式の利点

- **超軽量**: バックエンドや standalone 出力を同梱しない。ウィンドウを開くだけ。
- **更新が Web デプロイだけで完結**: アプリを配り直さなくても、Web を再デプロイすれば
  デスクトップの内容も最新になる。
- **セキュリティ**: `contextIsolation: true` / `nodeIntegration: false`。
  外部リンクは `shell.openExternal` で既定ブラウザに開く。

## 開発モードで起動

ローカルの `app/web` を dev サーバーで表示します（ホットリロード有効）。

```bash
cd app/desktop
npm install     # 初回のみ
npm run dev     # app/web の next dev(:3000) + Electron を同時起動
```

> ローカル UI がローカル func バックエンドを叩く場合は、別途
> `cd server/durablefunctions && npm start`（:7071）や
> Python Agent（:7072）、Azurite を起動してください。

## 本番モードで確認（デプロイ済み Web を表示）

```bash
cd app/desktop
npm run start:prod                 # 既定のデプロイ URL を読み込む
# 別の環境を見る場合:
WEB_URL="https://<your-web>" npm run start:prod
```

## 配布用パッケージング

```bash
cd app/desktop
npm run dist    # electron-builder で各OS向けにパッケージング
```

- 薄いシェルなので同梱物は `dist/`（コンパイル済み main/preload）のみで軽量。
- 生成物は `release/` に出力されます。
- 実運用配布ではコード署名／公証（macOS notarization、Windows 署名）を別途推奨。
- 配布は **GitHub Releases** などにアップロードするのが手軽です。

## スクリプト一覧

| スクリプト | 内容 |
|-----------|------|
| `npm run dev` | `app/web` の dev(:3000) + Electron を同時起動（開発） |
| `npm run compile` | Electron 用 TypeScript を `dist/` へコンパイル |
| `npm run build` | `dist/` をクリーンして Electron をコンパイル |
| `npm run start:prod` | 本番モードで Electron 起動（デプロイ済み Web を表示） |
| `npm run dist` | electron-builder でパッケージング |

## 環境変数

| 変数 | 既定値 | 用途 |
|------|--------|------|
| `DEV_URL` | `http://localhost:3000` | 開発時に読み込む URL |
| `WEB_URL` | デプロイ済み Container Apps URL | 本番時に読み込む Web URL |
| `NODE_ENV` | — | `production` で本番モード（`WEB_URL` を読み込む） |

## ディレクトリ構成

```
app/desktop/
├── package.json
├── tsconfig.json
├── electron/
│   ├── main.ts        # ウィンドウ生成 / dev:localhost / prod:デプロイURL
│   └── preload.ts     # 最小・セキュアな preload
└── dist/              # コンパイル出力（自動生成）
```
