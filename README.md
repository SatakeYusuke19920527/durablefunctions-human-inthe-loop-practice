# Durable Functions Human-in-the-loop 最小サンプル

Azure Durable Functions を使った **Human-in-the-loop（人間による承認）** パターンの、
最もシンプルな実装サンプルです。TypeScript + Azure Functions v4 で実装しています。

「オーケストレーションを開始 → 人間の承認/拒否を待機 → 結果を処理して完了」という、
承認ワークフローの基本形を最小限のコードで体験できます。

---

## 🎯 このサンプルで学べること

- Durable Functions の **外部イベント待機（`waitForExternalEvent`）** による人間の介入パターン
- **オーケストレーター / アクティビティ / HTTP クライアント** の役割分担
- 別プロセス（curl 等）から **`raiseEvent`** でワークフローを進める方法
- Azure Functions **v4**（コードベースでの関数登録）

---

## 🏗️ アーキテクチャ

```
┌──────────────┐   startNew    ┌─────────────────────────┐
│  httpStart   │ ────────────▶ │  approvalOrchestrator   │
│ POST /start  │               │                         │
└──────────────┘               │  waitForExternalEvent   │
                               │      ('Approval')       │  ← ここで人間の
┌──────────────┐   raiseEvent  │           │             │     操作を待機
│ sendApproval │ ────────────▶ │           ▼             │
│POST /approve │  ('Approval') │      callActivity       │
│ /{instanceId}│               │           │             │
└──────────────┘               └───────────┼─────────────┘
                                           ▼
                                 ┌───────────────────┐
                                 │  processApproval  │ (Activity)
                                 │   結果を処理       │
                                 └───────────────────┘
```

| 関数                   | トリガー                                | 役割                                                   |
| ---------------------- | --------------------------------------- | ------------------------------------------------------ |
| `httpStart`            | HTTP (`POST /api/start`)                | オーケストレーションを開始し、状態確認 URL を返す      |
| `approvalOrchestrator` | Orchestration                           | `Approval` イベントを待機し、受信後に Activity を呼ぶ  |
| `sendApproval`         | HTTP (`POST /api/approve/{instanceId}`) | `raiseEvent` で承認/拒否イベントを送信（＝人間の操作） |
| `processApproval`      | Activity                                | 承認結果を受け取り結果メッセージを返す（最小処理）     |

> **なぜ2つの HTTP 関数が必要？**
> オーケストレーターは「開始」した後、承認を「待機」します。
> その待機を解除するのが `sendApproval` からの `raiseEvent` です。
> これにより、人間が任意のタイミングで承認・拒否できる非同期ワークフローが実現します。

---

## 🔄 実行フロー（最初から最後まで）

このサンプルを実行すると、内部では次の順序で処理が進みます。
「開始 → 人間の承認を待機 → 承認 → 再開 → 処理 → 完了」という
Human-in-the-loop の全ライフサイクルです。

```
① httpStart                  クライアントが POST /api/start を実行
   └─ startNew()             オーケストレーションを新規作成（instanceId 発行）
        │
        ▼
② approvalOrchestrator       オーケストレーターが起動
   └─ waitForExternalEvent   "Approval" イベントを待機してここで中断
        │                    ← runtimeStatus = "Running"（＝人間の承認待ち）
        │
   （人間が承認/拒否を判断）
        │
        ▼
③ sendApproval               クライアントが POST /api/approve/{instanceId} を実行
   └─ raiseEvent("Approval") 待機中のオーケストレーターへイベントを送信
        │
        ▼
④ approvalOrchestrator 再開   イベントを受信して処理を再開（リプレイ）
   └─ callActivity           承認結果を Activity に渡す
        │
        ▼
⑤ processApproval            アクティビティが承認結果を処理
   └─ 結果メッセージを返す     例）「承認されました。処理を続行します。」
        │
        ▼
⑥ 完了                        オーケストレーターが結果を return
        └─ runtimeStatus = "Completed" / output に結果が格納される
```

### 各ステップの詳細

| # | 実行主体 | 処理内容 | この時点の状態 |
|---|----------|----------|----------------|
| ① | `httpStart` | `startNew` でオーケストレーションを開始し、`instanceId` と状態確認 URL を返す | `Pending` → `Running` |
| ② | `approvalOrchestrator` | `waitForExternalEvent("Approval")` で待機し、いったん中断する | `Running`（承認待ち） |
| ③ | `sendApproval` | `raiseEvent(instanceId, "Approval", {approved})` でイベントを送信（＝人間の操作） | `Running` |
| ④ | `approvalOrchestrator`（再開） | イベントを受信して**リプレイ**し、`callActivity` でアクティビティを呼ぶ | `Running` |
| ⑤ | `processApproval` | 承認結果（`approved`）を受け取り、結果メッセージを組み立てて返す | `Running` |
| ⑥ | `approvalOrchestrator` | アクティビティの結果を `return` してワークフロー終了 | `Completed` |

> **💡 「リプレイ」とは？**
> Durable Functions のオーケストレーターは、`yield`（`waitForExternalEvent` や
> `callActivity`）で中断・再開するたびに、関数を**最初から再実行**して状態を復元します。
> これを「リプレイ」と呼びます。過去に完了した処理は履歴から結果が返るため再実行されず、
> 未完了の箇所まで進みます。デバッグ時にオーケストレーターのブレークポイントが
> **複数回止まる**のはこの仕組みによるもので、正常な動作です。

### 承認パターンと拒否パターン

送信するイベントの `approved` の値によって、⑤の処理結果が分岐します。
どちらのパターンでも最終的に `runtimeStatus` は `Completed` になります
（「拒否」はワークフローが失敗するのではなく、拒否という結果で正常に完了します）。

**✅ 承認パターン（`{"approved": true}`）**

```
③ sendApproval → raiseEvent("Approval", { approved: true })
        ▼
⑤ processApproval → input.approved === true → 三項演算子の then 側
        ▼
⑥ 完了: runtimeStatus = "Completed"
   output = { "approved": true, "message": "承認されました。処理を続行します。" }
```

**🚫 拒否パターン（`{"approved": false}`）**

```
③ sendApproval → raiseEvent("Approval", { approved: false })
        ▼
⑤ processApproval → input.approved === false → 三項演算子の else 側
        ▼
⑥ 完了: runtimeStatus = "Completed"
   output = { "approved": false, "message": "拒否されました。処理を中止します。" }
```

| パターン | 送信ボディ | `processApproval` の分岐 | 最終 `output.message` | `runtimeStatus` |
|----------|-----------|--------------------------|------------------------|-----------------|
| 承認 | `{"approved": true}`  | then 側 | 承認されました。処理を続行します。 | `Completed` |
| 拒否 | `{"approved": false}` | else 側 | 拒否されました。処理を中止します。 | `Completed` |

> **💡 拒否でも `Completed` になる理由**
> このサンプルでは「拒否」は*エラー*ではなく、承認判断の 1 つの結果として扱っています。
> オーケストレーターは結果を正常に `return` するため `Completed` になります。
> 実運用で拒否時に処理を止めたい場合は、`processApproval` の後で `approved` を見て
> 後続の Activity をスキップする、といった分岐をオーケストレーターに追加します。

---

## 📁 ディレクトリ構成

```
.
├── host.json                    # Functions ホスト設定（拡張バンドル）
├── local.settings.json          # ローカル用の環境変数（ストレージ接続等）
├── package.json                 # 依存関係とスクリプト
├── tsconfig.json                # TypeScript コンパイル設定
├── .funcignore                  # デプロイ時に除外するファイル
├── .gitignore
├── src/
│   └── functions/
│       ├── httpStart.ts             # 開始用 HTTP トリガー
│       ├── sendApproval.ts          # 承認イベント送信用 HTTP トリガー
│       ├── approvalOrchestrator.ts  # オーケストレーター
│       └── processApproval.ts       # アクティビティ
└── dist/                        # tsc のビルド出力（自動生成）
```

---

## 🔧 前提条件

以下のツールが必要です。

| ツール                                                                                              | バージョン | 用途                             |
| --------------------------------------------------------------------------------------------------- | ---------- | -------------------------------- |
| [Node.js](https://nodejs.org/)                                                                      | 18 以上    | ランタイム                       |
| [Azure Functions Core Tools](https://learn.microsoft.com/azure/azure-functions/functions-run-local) | v4         | ローカル実行 (`func`)            |
| [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite)                     | 最新       | ローカルのストレージエミュレータ |
| [Azure CLI](https://learn.microsoft.com/cli/azure/)                                                 | 最新       | Azure へのデプロイ（任意）       |

インストール例（macOS / npm）:

```bash
# Azure Functions Core Tools
npm install -g azure-functions-core-tools@4 --unsafe-perm true

# Azurite
npm install -g azurite
```

> Durable Functions は状態管理に **Azure Storage を必須** とします。
> ローカルでは Azurite でエミュレートします（`local.settings.json` の
> `AzureWebJobsStorage=UseDevelopmentStorage=true`）。

---

## 🚀 ローカルでの実行手順

### 1. 依存関係のインストールと設定

サーバー（Azure Functions）は `server/` にあります。

```bash
cd server
npm install

# ローカル設定ファイルを用意（Git 管理外のため初回に作成）
cp local.settings.json.example local.settings.json

npm run build
```

> `local.settings.json` は `.gitignore` で除外されています。リポジトリを
> クローンした場合は、上記のとおり `local.settings.json.example` をコピーして作成してください。
> このファイルに機密情報は含まれず、ローカルの Azurite 接続設定のみです。

### 2. Azurite（ストレージエミュレータ）を起動

別ターミナルで:

```bash
azurite --silent --location ./__azurite__ --debug ./__azurite__/debug.log
```

### 3. Functions を起動

```bash
npm start
# 内部で clean → build → func start が実行されます
```

起動に成功すると、以下のようなエンドポイントが表示されます。

```
Functions:
    httpStart:      [POST] http://localhost:7071/api/start
    sendApproval:   [POST] http://localhost:7071/api/approve/{instanceId}
```

---

## 🧪 動作確認（curl）

### ステップ 1: オーケストレーションを開始

```bash
curl -X POST http://localhost:7071/api/start
```

レスポンス例（`id` が **instanceId**、各 URL で状態を操作できます）:

```json
{
  "id": "abc123def456...",
  "statusQueryGetUri": "http://localhost:7071/runtime/webhooks/durabletask/instances/abc123...",
  "sendEventPostUri": "...",
  "terminatePostUri": "...",
  "purgeHistoryDeleteUri": "..."
}
```

### ステップ 2: 状態を確認（承認前は待機中）

```bash
curl "http://localhost:7071/runtime/webhooks/durabletask/instances/<instanceId>"
```

`runtimeStatus` は `Running`（イベント待機中）になっています。

### ステップ 3: 承認イベントを送信

`<instanceId>` はステップ1で取得した `id` に置き換えてください。

**承認する場合:**

```bash
curl -X POST "http://localhost:7071/api/approve/<instanceId>" \
  -H "Content-Type: application/json" \
  -d '{"approved": true}'
```

**拒否する場合:**

```bash
curl -X POST "http://localhost:7071/api/approve/<instanceId>" \
  -H "Content-Type: application/json" \
  -d '{"approved": false}'
```

### ステップ 4: 完了結果を確認

```bash
curl "http://localhost:7071/runtime/webhooks/durabletask/instances/<instanceId>"
```

`runtimeStatus` が `Completed` になり、`output` に結果が入ります。

```json
{
  "runtimeStatus": "Completed",
  "output": {
    "approved": true,
    "message": "承認されました。処理を続行します。"
  }
}
```

> 💡 ステップ1のレスポンスに含まれる `statusQueryGetUri` をそのまま使うと、
> instanceId を手で組み立てる必要がなく便利です。

---

## 💻 コード解説

### オーケストレーター（`approvalOrchestrator.ts`）

ワークフローの中心。`waitForExternalEvent` で **人間の操作を待機** します。

```ts
const approvalOrchestrator: OrchestrationHandler = function* (context) {
  // "Approval" イベントが送られてくるまでここで待機（＝人間の承認待ち）
  const approvalEvent = yield context.df.waitForExternalEvent('Approval');

  // 承認結果を Activity で処理
  const result = yield context.df.callActivity(
    'processApproval',
    approvalEvent,
  );

  return { approved: approvalEvent.approved, message: result };
};
```

- ジェネレーター関数（`function*` + `yield`）でワークフローを記述します。
- `yield` した箇所でオーケストレーションは中断・再開され、状態が永続化されます。

### 承認イベントの送信（`sendApproval.ts`）

```ts
await client.raiseEvent(instanceId, 'Approval', { approved });
```

- `raiseEvent(instanceId, イベント名, データ)` で、待機中のオーケストレーターに通知します。
- イベント名 `"Approval"` はオーケストレーター側の `waitForExternalEvent("Approval")` と一致させます。

### v4 モデルでの関数登録

各ファイルの末尾で、コードベースに関数を登録します（`function.json` は不要）。

```ts
df.app.orchestration("approvalOrchestrator", approvalOrchestrator);
df.app.activity("processApproval", { handler: processApproval });
df.app.client.http("httpStart", { route: "start", methods: ["POST"], ... });
```

---

## ☁️ Azure へのデプロイ

### 1. リソースを作成

```bash
# 変数（適宜変更）
RESOURCE_GROUP="rg-durable-hitl"
LOCATION="japaneast"
STORAGE_ACCOUNT="sthitl$RANDOM"
FUNCTION_APP="func-hitl-$RANDOM"

# リソースグループ
az group create --name $RESOURCE_GROUP --location $LOCATION

# ストレージアカウント（Durable Functions に必須）
az storage account create \
  --name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --sku Standard_LRS

# Function App（Consumption プラン / Node 18）
az functionapp create \
  --name $FUNCTION_APP \
  --resource-group $RESOURCE_GROUP \
  --storage-account $STORAGE_ACCOUNT \
  --consumption-plan-location $LOCATION \
  --runtime node \
  --runtime-version 18 \
  --functions-version 4
```

### 2. デプロイ

```bash
npm run build
func azure functionapp publish $FUNCTION_APP
```

### 3. 本番での呼び出し

本番では `authLevel: "anonymous"` でも、Durable の管理 API（状態確認 URL）には
`code` パラメータ（関数キー）が付与されます。開始 URL はデプロイ後に表示されるものを使用してください。

```bash
# 開始
curl -X POST "https://<FUNCTION_APP>.azurewebsites.net/api/start?code=<function-key>"

# 承認
curl -X POST "https://<FUNCTION_APP>.azurewebsites.net/api/approve/<instanceId>?code=<function-key>" \
  -H "Content-Type: application/json" \
  -d '{"approved": true}'
```

---

## 📌 補足・発展

このサンプルはあくまで **最小構成** です。実運用では以下の拡張が考えられます。

- **タイムアウト付き承認**: `context.df.createTimer` と `Task.any` を組み合わせ、
  一定時間で自動エスカレーション/タイムアウトさせる。
- **認証の強化**: `authLevel` を `function`/`admin` にする、または Easy Auth (Entra ID) を利用する。
- **承認 UI**: `sendApproval` を呼ぶ Web フォームやメールリンクを用意する。
- **複数承認者**: 複数の外部イベントを待って多段承認にする。

---

## 🔗 参考リンク

- [Durable Functions の human interaction パターン](https://learn.microsoft.com/azure/azure-functions/durable/durable-functions-overview#human)
- [Durable Functions（JavaScript/TypeScript）](https://learn.microsoft.com/azure/azure-functions/durable/quickstart-js-vscode)
- [Azure Functions v4 プログラミングモデル](https://learn.microsoft.com/azure/azure-functions/functions-node-upgrade-v4)
