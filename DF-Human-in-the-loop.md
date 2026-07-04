# Durable Functions Human-in-the-loop 完全ガイド

このドキュメントは、Azure Durable Functions における **Human-in-the-loop（人間参加型）**
パターンの機能を、初学者にもわかるように **すべて** 網羅的に解説します。
コード例は本リポジトリと同じ **TypeScript + Azure Functions v4 プログラミングモデル**
（`durable-functions` v3）に統一しています。

---

## 目次

1. [Human-in-the-loop とは](#1-human-in-the-loop-とは)
2. [基本の構成要素](#2-基本の構成要素)
3. [外部イベントの待機と送信（コア機能）](#3-外部イベントの待機と送信コア機能)
4. [タイムアウトとエスカレーション（Durable Timer）](#4-タイムアウトとエスカレーションdurable-timer)
5. [複数イベント・複数承認者の扱い](#5-複数イベント複数承認者の扱い)
6. [人間へ承認を依頼する経路（通知）](#6-人間へ承認を依頼する経路通知)
7. [インスタンスの管理操作（状態確認・中断・終了）](#7-インスタンスの管理操作状態確認中断終了)
8. [進捗の可視化（customStatus）](#8-進捗の可視化customstatus)
9. [繰り返し承認と長時間ワークフロー（Eternal Orchestration）](#9-繰り返し承認と長時間ワークフローeternal-orchestration)
10. [オーケストレーターの制約（決定性・リプレイ）](#10-オーケストレーターの制約決定性リプレイ)
11. [エラー処理とタイムアウト設計](#11-エラー処理とタイムアウト設計)
12. [セキュリティ（承認エンドポイントの保護）](#12-セキュリティ承認エンドポイントの保護)
13. [永続化の仕組み（ストレージ）](#13-永続化の仕組みストレージ)
14. [実運用パターン集](#14-実運用パターン集)
15. [ベストプラクティス チェックリスト](#15-ベストプラクティス-チェックリスト)
16. [API クイックリファレンス](#16-api-クイックリファレンス)

---

## 1. Human-in-the-loop とは

**Human-in-the-loop** は、自動化された処理の途中に「人間の判断・操作」を挟むパターンです。
代表例:

- **承認ワークフロー**: 経費申請・稟議・デプロイ承認
- **エスカレーション**: 一定時間内に承認が無ければ上司へ自動転送
- **二要素確認**: 送金・削除など重要操作の人手による最終確認
- **データ修正**: AI/OCR の結果を人間がレビューして訂正

### なぜ Durable Functions が向いているのか

人間の応答は **数秒〜数日** と待ち時間が読めません。通常の関数（数分でタイムアウト）
では待てませんが、Durable Functions は **オーケストレーションの状態をストレージに永続化**
し、待機中はメモリやコンピューティングを消費しません（サーバーレスでコスト効率が良い）。
人間の操作（イベント）が届いた時だけ復元して処理を続行します。

```
[開始] → [人間の操作を待機（数時間〜数日）] → [操作受信] → [後続処理] → [完了]
              ↑ この間リソースをほぼ消費しない（状態はストレージに保存）
```

---

## 2. 基本の構成要素

Human-in-the-loop は 3 種類の関数と「外部イベント」で構成されます。

| 要素 | 役割 | 主な API |
|------|------|----------|
| **Orchestrator（オーケストレーター）** | ワークフロー全体の流れを定義。人間の操作を待つ中心 | `waitForExternalEvent`, `callActivity`, `createTimer` |
| **Activity（アクティビティ）** | 実際の副作用（DB更新・メール送信など）を行う単発処理 | — |
| **Client（クライアント）** | 外部からオーケストレーションを開始・操作する入口（多くは HTTP） | `startNew`, `raiseEvent`, `getStatus`, `terminate` |
| **External Event（外部イベント）** | 人間の操作をオーケストレーターへ届けるシグナル | `raiseEvent` ⇄ `waitForExternalEvent` |

### 最小コード（本リポジトリの構成）

```ts
// オーケストレーター：承認を待って結果を処理する
const approvalOrchestrator: OrchestrationHandler = function* (context) {
  const event = yield context.df.waitForExternalEvent("Approval"); // ← 人間の操作を待つ
  const result = yield context.df.callActivity("processApproval", event);
  return { approved: event.approved, message: result };
};
df.app.orchestration("approvalOrchestrator", approvalOrchestrator);
```

```ts
// クライアント（承認送信）：待機中のオーケストレーターへイベントを送る
df.app.client.http("sendApproval", {
  route: "approve/{instanceId}",
  methods: ["POST"],
  handler: async (request, client, context) => {
    const instanceId = request.params.instanceId;
    const { approved } = await request.json();
    await client.raiseEvent(instanceId, "Approval", { approved }); // ← 待機を解除
    return { status: 202, jsonBody: { instanceId, approved } };
  },
});
```

---

## 3. 外部イベントの待機と送信（コア機能）

Human-in-the-loop の心臓部です。

### 3.1 `waitForExternalEvent`（待つ側）

オーケストレーター内で、指定した名前のイベントが届くまで **中断して待機** します。

```ts
// 型を指定して待機（推奨）
const event: { approved: boolean } = yield context.df.waitForExternalEvent("Approval");
```

- **イベント名で待つ**: `"Approval"` という名前が一致するイベントだけを受け取ります。
- **待機は無期限**: 何もしなければイベントが来るまで永遠に待ちます（→ タイムアウトは §4）。
- **早く届いても大丈夫**: `waitForExternalEvent` を実行する前にイベントが届いた場合、
  イベントは **バッファ** され、待機開始時に即座に受け取れます（取りこぼしなし）。
- **戻り値**: `raiseEvent` の第3引数で渡したデータ（JSON シリアライズ可能な任意の値）。

### 3.2 `raiseEvent`（送る側）

クライアント（Durable Client）から、待機中のオーケストレーターへイベントを送ります。

```ts
await client.raiseEvent(instanceId, "Approval", { approved: true });
//                       ↑対象      ↑イベント名  ↑データ（waitForExternalEventの戻り値になる）
```

- **イベント名を一致させる**: 送信側の `"Approval"` と待機側の `"Approval"` が一致して初めて解除。
- **fire-and-forget**: `raiseEvent` は「イベントをキューに入れた」時点で返ります。
  オーケストレーターの処理完了を待つわけではありません。
- **対象が存在しない/待っていない場合**: イベントはバッファされ、後で対応する
  `waitForExternalEvent` が実行されたときに消費されます。

### 3.3 HTTP 管理 API から直接送る

クライアント関数を書かなくても、`startNew` のレスポンスに含まれる
**`sendEventPostUri`** を使えば、組み込みの管理 API から直接イベントを送れます。

```bash
# {eventName} を実際のイベント名に置換して POST
curl -X POST "http://localhost:7071/runtime/webhooks/durabletask/instances/<id>/raiseEvent/Approval" \
  -H "Content-Type: application/json" -d '{"approved": true}'
```

> 本リポジトリでは学習しやすいよう、あえて専用の `sendApproval` 関数を用意しています。
> 実運用ではどちらの方式でも構いません。

---

## 4. タイムアウトとエスカレーション（Durable Timer）

「人間が一定時間内に応答しなかったら自動でエスカレーション/タイムアウトする」——
Human-in-the-loop で最も重要な発展パターンです。**Durable Timer** を使います。

### 4.1 Durable Timer（`createTimer`）

指定した時刻に発火する、**永続的なタイマー** です。`setTimeout` と違い、
プロセスが落ちても復元され、長時間（日単位）でも安全に待てます。

```ts
// 現在時刻から72時間後に発火するタイマー
const deadline = new Date(context.df.currentUtcDateTime.getTime() + 72 * 60 * 60 * 1000);
yield context.df.createTimer(deadline);
```

> **必ず `context.df.currentUtcDateTime` を使う**。`new Date()` や `Date.now()` は
> リプレイのたびに値が変わり決定性を壊します（§10 参照）。

### 4.2 タイムアウト付き承認（イベント vs タイマーの競争）

「承認イベント」と「タイマー」を **同時に待ち、先に来た方を採用** します。
`df.Task.any` を使います。

```ts
const approvalOrchestrator: OrchestrationHandler = function* (context) {
  const deadline = new Date(context.df.currentUtcDateTime.getTime() + 72 * 60 * 60 * 1000);

  const timeoutTask = context.df.createTimer(deadline);              // タイマー
  const approvalTask = context.df.waitForExternalEvent("Approval");  // 承認イベント

  // どちらか早い方が完了するまで待つ
  const winner = yield context.df.Task.any([approvalTask, timeoutTask]);

  if (winner === approvalTask) {
    // 期限内に承認/拒否が届いた
    timeoutTask.cancel(); // ★重要：使わないタイマーは必ずキャンセル（放置すると完了しない）
    const event = approvalTask.result;
    return yield context.df.callActivity("processApproval", event);
  } else {
    // 時間切れ → 自動エスカレーション or 却下
    return yield context.df.callActivity("escalate", { reason: "timeout" });
  }
};
```

**ポイント:**
- `df.Task.any([...])` は「最初に完了したタスク」を返します。
- 承認が先に来たら **`timeoutTask.cancel()` を必ず呼ぶ**。呼ばないとオーケストレーションが
  タイマー完了を待ち続け、いつまでも `Completed` になりません。
- 逆にタイマーが先に発火したら、承認待ちは放置してOK（オーケストレーションが終われば消える）。

### 4.3 タイマーのキャンセルと再利用

- `createTimer` の戻り値（`TimerTask`）には `.cancel()` があります。
- `.isCancelled` でキャンセル済みか確認できます。
- リマインド（例：24時間ごとに催促メール）を送りたい場合は、ループで
  短いタイマーを複数回 `createTimer` します（§9 の continueAsNew と組み合わせも可）。

---

## 5. 複数イベント・複数承認者の扱い

### 5.1 全員の承認を待つ（`Task.all`）

複数の承認者 **全員** の承認が揃うまで待つ多段承認。

```ts
const approvals = ["managerApproval", "financeApproval", "ceoApproval"].map(
  (name) => context.df.waitForExternalEvent(name)
);
const results = yield context.df.Task.all(approvals); // 3人全員そろうまで待つ
// results は各イベントのデータ配列
```

### 5.2 誰か一人でOK（`Task.any`）

複数承認者の **いずれか一人** が承認すれば進むパターン。

```ts
const approvals = ["approverA", "approverB"].map((n) => context.df.waitForExternalEvent(n));
const winner = yield context.df.Task.any(approvals); // 最初の一人で解除
```

### 5.3 同名イベントを複数回受け取る

同じイベント名を複数回受け取りたい場合は、その都度 `waitForExternalEvent` を
呼び直します（ループなど）。1回の `waitForExternalEvent` は1回のイベントを消費します。

```ts
// 3件の承認を順に受け取る例
const votes = [];
for (let i = 0; i < 3; i++) {
  const vote = yield context.df.waitForExternalEvent("Vote");
  votes.push(vote);
}
```

---

## 6. 人間へ承認を依頼する経路（通知）

「承認して」と人間に **知らせる** 部分は、Durable Functions の外側（メール/チャット等）です。
一般的な流れ:

```
① httpStart で開始 → instanceId を発行
② Activity で通知を送信（承認リンク付き）
      例：メール本文に  https://<app>/api/approve/<instanceId>?code=<key>
③ 人間がリンクをクリック / ボタン押下 → sendApproval（raiseEvent）が呼ばれる
④ オーケストレーターの待機が解除される
```

通知に使える Activity の例:

- **メール**: Azure Communication Services / SendGrid
- **チャット**: Teams / Slack の Incoming Webhook（Approve/Reject ボタン）
- **SMS**: Azure Communication Services
- **プッシュ通知**: 任意のサービス

承認リンクには **instanceId** と（本番では）**関数キーやトークン** を埋め込み、
クリック時に `raiseEvent` される URL を渡すのが定石です。

---

## 7. インスタンスの管理操作（状態確認・中断・終了）

Durable Client / HTTP 管理 API で、実行中インスタンスを操作できます。

### 7.1 状態の取得（`getStatus`）

```ts
const status = await client.getStatus(instanceId);
// status.runtimeStatus, status.output, status.customStatus, status.input ...
```

HTTP なら `statusQueryGetUri`（`createCheckStatusResponse` が返す URL 群の1つ）に GET。

**runtimeStatus の値:**

| 値 | 意味 |
|----|------|
| `Pending` | 作成されたが未開始 |
| `Running` | 実行中（イベント待機中もこれ） |
| `Completed` | 正常完了（`output` に結果） |
| `Failed` | 例外で失敗 |
| `Terminated` | 外部から強制終了された |
| `Suspended` | 一時停止中 |
| `ContinuedAsNew` | continueAsNew で新インスタンスへ引き継ぎ（内部的） |

### 7.2 終了（`terminate`）

承認待ちを外部から打ち切りたい場合。

```ts
await client.terminate(instanceId, "ユーザーによるキャンセル");
```

HTTP: `terminatePostUri` に POST。

### 7.3 一時停止 / 再開（Suspend / Resume）

長期待機を一時停止・再開できます（HTTP 管理 API）。

```bash
curl -X POST ".../instances/<id>/suspend?reason=maintenance"
curl -X POST ".../instances/<id>/resume?reason=resume"
```

### 7.4 履歴のパージ

完了済みインスタンスの履歴を削除してストレージを節約。

```ts
await client.purgeInstanceHistory(instanceId);
```

### 7.5 完了待ち応答（同期的に待たせる）

短時間で終わる想定なら、指定時間だけ待って完了なら結果を、未完了なら状態 URL を返す
ハイブリッド応答が使えます。

```ts
return client.waitForCompletionOrCreateCheckStatusResponse(request, instanceId, {
  timeoutInMilliseconds: 8000,
  retryIntervalInMilliseconds: 1000,
});
```

---

## 8. 進捗の可視化（customStatus）

オーケストレーターは `setCustomStatus` で **任意の進捗情報** を公開できます。
承認フローの現在フェーズをクライアントに見せたい時に便利です。

```ts
context.df.setCustomStatus({ phase: "waiting_for_approval", since: context.df.currentUtcDateTime });
const event = yield context.df.waitForExternalEvent("Approval");
context.df.setCustomStatus({ phase: "processing" });
```

`getStatus` / `statusQueryGetUri` の応答の `customStatus` に反映されます。
ポーリングする UI 側で「承認待ちです」等を表示できます。

---

## 9. 繰り返し承認と長時間ワークフロー（Eternal Orchestration）

「定期的に承認を求め続ける」「終わりのない監視ループ」などは
**`continueAsNew`** で実装します。履歴が無限に伸びるのを防ぎ、状態を引き継いで
オーケストレーションを“作り直し”ます。

```ts
const recurringApproval: OrchestrationHandler = function* (context) {
  const state = context.df.getInput() ?? { round: 0 };

  // 承認 or 24時間タイムアウト
  const deadline = new Date(context.df.currentUtcDateTime.getTime() + 24 * 3600 * 1000);
  const timer = context.df.createTimer(deadline);
  const approval = context.df.waitForExternalEvent("Approval");
  const winner = yield context.df.Task.any([approval, timer]);

  if (winner === approval) {
    timer.cancel();
    yield context.df.callActivity("recordApproval", approval.result);
  } else {
    yield context.df.callActivity("sendReminder", { round: state.round });
  }

  // 履歴をリセットして次のラウンドへ（無限に続けられる）
  context.df.continueAsNew({ round: state.round + 1 });
};
```

**注意:** `continueAsNew` を呼ぶ前に、進行中のタスク（未キャンセルのタイマー等）が
無いようにします。呼び出し後のコードは実行されません。

---

## 10. オーケストレーターの制約（決定性・リプレイ）

Human-in-the-loop のバグの多くは、この制約違反から生まれます。**必ず理解してください。**

### リプレイとは

オーケストレーターは `yield`（`waitForExternalEvent` / `callActivity` / `createTimer`）
で中断・再開するたびに、**関数を最初から再実行** して状態を復元します。
過去に完了した `yield` は履歴から即座に結果が返り、未完了の箇所まで進みます。

→ デバッグ時にオーケストレーターのブレークポイントが **複数回** 止まるのは正常です。

### オーケストレーターでやってはいけないこと（非決定的な操作）

| ❌ 禁止 | ✅ 代替 |
|--------|--------|
| `new Date()` / `Date.now()` | `context.df.currentUtcDateTime` |
| `Math.random()` / UUID 生成 | Activity 内で行う、または `context.df.newGuid()` |
| DB/HTTP など I/O を直接実行 | **Activity** 内で実行する |
| 環境変数・グローバル変数への依存 | 入力や Activity 経由で渡す |
| `setTimeout` などの非同期待機 | `context.df.createTimer` |

**理由:** リプレイのたびに同じ結果を返さないと、状態復元が壊れます。
副作用や非決定的な処理は **必ず Activity に閉じ込め** ます。

---

## 11. エラー処理とタイムアウト設計

### 11.1 承認処理の例外

Activity が例外を投げると、オーケストレーターの `yield callActivity(...)` が
throw します。`try/catch` で捕捉できます。

```ts
try {
  yield context.df.callActivity("processApproval", event);
} catch (e) {
  yield context.df.callActivity("handleFailure", { error: String(e) });
}
```

### 11.2 リトライ付き Activity 呼び出し

一時的な失敗を自動再試行。

```ts
import * as df from "durable-functions";
const options = new df.RetryOptions(5000 /*初回待機ms*/, 3 /*最大試行*/);
yield context.df.callActivityWithRetry("processApproval", options, event);
```

### 11.3 「拒否」は失敗ではない

本リポジトリのように、拒否（`approved:false`）は **正常な結果の1つ** として
`Completed` で返すのが基本です。拒否時に後続をスキップしたいなら、
オーケストレーター内で `approved` を見て分岐します。

```ts
const event = yield context.df.waitForExternalEvent("Approval");
if (!event.approved) {
  return { approved: false, message: "却下されました" }; // 後続 Activity を呼ばず終了
}
yield context.df.callActivity("deploy", event); // 承認時のみ実行
```

---

## 12. セキュリティ（承認エンドポイントの保護）

承認 URL は「誰でも叩ける」と危険です。本番では必ず保護します。

- **関数キー**: `authLevel: "function"` にし、URL に `?code=<key>` を付与。
- **Easy Auth（App Service 認証）**: Entra ID などでユーザー認証を強制。
- **署名付きトークン**: 承認リンクに短命の署名トークンを埋め込み、`sendApproval` 側で検証。
- **承認者の本人確認**: `raiseEvent` のデータに「誰が承認したか」を含め、Activity で記録・検証。
- **instanceId の推測防止**: instanceId は十分ランダム。加えてトークンで二重に保護。

本リポジトリは学習用に `authLevel: "anonymous"` ですが、**本番では変更必須** です。

---

## 13. 永続化の仕組み（ストレージ）

Durable Functions は状態を **Azure Storage**（既定プロバイダー）に保存します。

- **Instances / History テーブル**: 各インスタンスの状態とイベント履歴。
- **Control Queues**: オーケストレーターの処理待ちメッセージ（partitionCount 個）。
- **Work Item Queue**: Activity の実行待ちメッセージ。
- **Lease（Blob/Table）**: 複数ワーカー間でパーティション所有権を調停。

これにより、**待機中はリソースを消費せず、いつでも状態を復元** できます。

> **ローカル開発（Azurite）の注意**: ストレージエミュレータ Azurite が必要です。
> DurableTask 拡張の既定 `useTablePartitionManagement` が Azurite と相性問題を起こす場合、
> `host.json` で `false`（Blob リース方式）にすると安定します（本リポジトリで採用）。
> また `AzureWebJobsSecretStorageType: "files"` でシークレットをローカルファイルに保存すると
> 起動時の Blob 書き込みエラーを回避できます。

他プロバイダー（**Netherite** / **MSSQL**）もあり、スループットや運用要件で選択できます。

---

## 14. 実運用パターン集

### 14.1 単純承認（本リポジトリ）
開始 → 承認/拒否を1回待つ → 結果処理 → 完了。

### 14.2 タイムアウト付き承認
承認 vs タイマーの `Task.any`。期限切れで自動却下やエスカレーション（§4.2）。

### 14.3 多段承認
`Task.all` で全員、`Task.any` で誰か一人（§5）。

### 14.4 催促付き承認
ループで短いタイマー→リマインド送信、最終期限で `Task.any` により打ち切り。

### 14.5 段階的エスカレーション
「担当者→24h→マネージャ→24h→部長」のように、タイムアウトごとに宛先を上げる。

```ts
const approvers = ["staff", "manager", "director"];
for (const approver of approvers) {
  yield context.df.callActivity("requestApproval", { approver });
  const deadline = new Date(context.df.currentUtcDateTime.getTime() + 24 * 3600 * 1000);
  const timer = context.df.createTimer(deadline);
  const approval = context.df.waitForExternalEvent("Approval");
  const winner = yield context.df.Task.any([approval, timer]);
  if (winner === approval) {
    timer.cancel();
    return { approvedBy: approver, event: approval.result };
  }
  // タイムアウト → 次の承認者へエスカレーション
}
return { approved: false, reason: "全員タイムアウト" };
```

---

## 15. ベストプラクティス チェックリスト

- [ ] 待機は必ず **タイムアウト**（`createTimer` + `Task.any`）と組み合わせる。
- [ ] 承認が来たら **未使用タイマーを `cancel()`** する。
- [ ] オーケストレーター内で **非決定的処理を書かない**（時刻・乱数・I/O は Activity へ）。
- [ ] 時刻は **`context.df.currentUtcDateTime`** を使う。
- [ ] 副作用（メール送信・DB更新）は **Activity** に閉じ込める。
- [ ] 承認エンドポイントを **認証・トークンで保護** する。
- [ ] `customStatus` で **待機中である旨** をクライアントに公開する。
- [ ] 長期・繰り返しは **`continueAsNew`** で履歴肥大を防ぐ。
- [ ] 「拒否」を **失敗ではなく結果** として扱い、必要なら分岐で後続をスキップ。
- [ ] 本番デプロイ前に **`authLevel` を anonymous 以外** に変更。

---

## 16. API クイックリファレンス

### オーケストレーター内（`context.df`）

| API | 用途 |
|-----|------|
| `waitForExternalEvent(name)` | 外部イベント（人間の操作）を待機 |
| `callActivity(name, input)` | Activity を呼ぶ（副作用はここで） |
| `callActivityWithRetry(name, retryOptions, input)` | リトライ付き Activity 呼び出し |
| `createTimer(deadline)` | Durable Timer（タイムアウト/遅延） |
| `Task.any([...])` | 最初に完了したタスクを採用（イベント vs タイマー等） |
| `Task.all([...])` | すべて完了するまで待つ（多段承認等） |
| `currentUtcDateTime` | 決定性のある現在時刻 |
| `setCustomStatus(obj)` | 進捗情報を公開 |
| `getInput()` | オーケストレーションへの入力を取得 |
| `continueAsNew(input)` | 履歴をリセットして継続（長時間/繰り返し） |
| `newGuid()` | 決定性のある GUID 生成 |

### クライアント（Durable Client）

| API | 用途 |
|-----|------|
| `startNew(orchestratorName, options?)` | オーケストレーションを開始 |
| `raiseEvent(instanceId, eventName, data)` | 外部イベントを送信（待機を解除） |
| `getStatus(instanceId)` | 状態・出力・customStatus を取得 |
| `terminate(instanceId, reason)` | 強制終了 |
| `purgeInstanceHistory(instanceId)` | 履歴を削除 |
| `createCheckStatusResponse(request, instanceId)` | 状態確認 URL 群を返す |
| `waitForCompletionOrCreateCheckStatusResponse(...)` | 一定時間待って結果 or 状態 URL |

### HTTP 管理 API（`createCheckStatusResponse` の返す URL）

| URI | 用途 |
|-----|------|
| `statusQueryGetUri` | 状態取得（GET） |
| `sendEventPostUri` | イベント送信（POST、`{eventName}` を置換） |
| `terminatePostUri` | 終了（POST） |
| `suspendPostUri` / `resumePostUri` | 一時停止 / 再開 |
| `purgeHistoryDeleteUri` | 履歴削除（DELETE） |

---

## 関連

- 本リポジトリの実装と実行手順は [README.md](./README.md) を参照。
- 公式ドキュメント: [Human interaction in Durable Functions](https://learn.microsoft.com/azure/azure-functions/durable/durable-functions-phone-verification)
- パターン概要: [Durable Functions patterns](https://learn.microsoft.com/azure/azure-functions/durable/durable-functions-overview#patterns)
