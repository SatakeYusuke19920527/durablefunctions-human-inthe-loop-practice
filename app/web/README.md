# DurableFunctions HITL — Web フロントエンド（Next.js）

Azure Durable Functions の **Human-in-the-loop（人間参加型承認）** フローを
ブラウザで可視化・操作する Web アプリです。
`../../server`（Azure Functions）をバックエンドとして利用します。

- **フレームワーク**: Next.js 16（App Router）+ TypeScript
- **スタイル**: Tailwind CSS v4 + shadcn/ui
- **役割**: 「開始 → 承認/拒否 → 処理 → 完了」の流れをボックスと矢印で可視化

---

## 🏗️ アーキテクチャ

```
┌────────────────────── ブラウザ (Client Component) ──────────────────────┐
│  app/page.tsx                                                           │
│   ・DurableFunctions Start / 承認 / 拒否 ボタン                          │
│   ・FlowDiagram（①開始→②承認待ち→③承認/拒否→④処理→⑤完了）             │
│   ・1.5秒ごとに /api/status をポーリングして現在ステージを更新           │
└───────────┬────────────────────────────────────────────────────────────┘
            │ fetch（同一オリジン）
            ▼
┌────────────────── Next.js サーバー (Route Handlers) ────────────────────┐
│  app/api/start   → POST   /api/start                                    │
│  app/api/approve → POST   /api/approve                                  │
│  app/api/status  → GET    /api/status?instanceId=...                    │
│         （lib/durable.ts が func のエンドポイントへ中継）                 │
└───────────┬────────────────────────────────────────────────────────────┘
            │ サーバー間 fetch（CORS 不要）
            ▼
┌────────────────── Azure Functions (../../server, :7071) ────────────────┐
│  httpStart / sendApproval / approvalOrchestrator / processApproval      │
│                     ＝ Durable Functions（状態は Azure Storage に永続化）│
└─────────────────────────────────────────────────────────────────────────┘
```

### なぜ Next.js の API ルートを挟むのか（重要）

ブラウザから直接 func(7071) を叩くと **CORS** の設定が必要になり、URL 組み立ても複雑です。
そこで **Next.js のルートハンドラ（サーバー側）** が func へ中継します。

- ブラウザは **同一オリジンの `/api/*`** だけを呼ぶ → CORS 不要・実装がシンプル
- func の URL やクエリ（`?taskHub=...&code=...`）はサーバー側 `lib/durable.ts` に隠蔽
- バックエンドの向き先は環境変数 `FUNCTIONS_BASE_URL` で切り替え可能

---

## 📁 ディレクトリ構成

```
app/web/
├── app/
│   ├── page.tsx              # メイン画面（操作 / フロー図 / ステータス）
│   ├── layout.tsx
│   ├── globals.css
│   └── api/                  # ← func へのプロキシ（サーバー側）
│       ├── start/route.ts    # POST: オーケストレーション開始
│       ├── approve/route.ts  # POST: 承認/拒否イベント送信
│       └── status/route.ts   # GET:  ステータス取得
├── components/
│   ├── FlowDiagram.tsx       # ①〜⑤のボックス+矢印。現在ステージをハイライト
│   └── ui/                   # shadcn/ui（button / card / badge）
├── lib/
│   ├── durable.ts            # func と通信するヘルパー（start/approve/getStatus）
│   ├── stages.ts             # フロー各ステージの定義・型
│   └── utils.ts              # cn() など
├── .env.local                # FUNCTIONS_BASE_URL=http://localhost:7071
└── next.config.ts            # output:"standalone"（Desktop 本番 spawn 用）
```

---

## 🔄 画面上のステージと状態の対応

ブラウザは `/api/status` の `runtimeStatus` を見て、現在どのステージかを判定します。

| 画面のステージ | 判定条件 | 意味 |
|----------------|----------|------|
| ① 開始 | 開始直後（`Running` 前） | `httpStart` 実行 |
| ② 承認待ち | `runtimeStatus === "Running"` かつ未送信 | `waitForExternalEvent` で待機中 |
| ③ 承認 / 拒否 | 承認/拒否ボタン送信済み | `raiseEvent` 済み（選択を色分け） |
| ④ 処理 | 送信後〜完了前 | `processApproval` 実行中 |
| ⑤ 完了 | `Completed` / `Failed` / `Terminated` | 承認=緑 / 拒否=赤 で結果表示 |

---

## 🚀 起動手順

### 前提：バックエンドを先に起動

```bash
# 1) Azurite（ストレージエミュレータ）
azurite --silent --location ./__azurite__

# 2) Azure Functions（Durable）
cd ../../server/durablefunctions && npm start        # http://localhost:7071
```

### Web を起動

```bash
npm install        # 初回のみ
npm run dev        # http://localhost:3000
```

ブラウザで http://localhost:3000 を開き、「DurableFunctions Start」→「承認 / 拒否」を操作します。

---

## ⚙️ 環境変数

| 変数 | 既定値 | 用途 |
|------|--------|------|
| `FUNCTIONS_BASE_URL` | `http://localhost:7071` | Azure Functions バックエンドの URL |

`.env.local` で設定します。

---

## 🖥️ Desktop（Electron）との関係

`../desktop`（Electron）は、この Web アプリを **そのまま表示するシェル** です。
UI・API ルートを流用するため、この `app/web` を変更すると Desktop 側にも反映されます。
本番モードで Electron が standalone サーバーを spawn できるよう、
`next.config.ts` に `output: "standalone"` を設定しています。

---

## 🔗 関連

- バックエンド実装・Durable Functions の詳細 → [`../../README.md`](../../README.md)
- Human-in-the-loop の全機能解説 → [`../../DF-Human-in-the-loop.md`](../../DF-Human-in-the-loop.md)
- デスクトップ版 → [`../desktop/README.md`](../desktop/README.md)
