# Durable Functions — Function chaining 完全ガイド

このドキュメントは、Azure Durable Functions の **Function chaining（関数チェーン）**
パターンを、使いどころ・実装・注意点まで詳しく解説します。
コード例は本リポジトリの `server/src/functions/function-chaining/` の実装に対応しています。

---

## 目次

1. [Function chaining とは](#1-function-chaining-とは)
2. [なぜ Durable Functions を使うのか](#2-なぜ-durable-functions-を使うのか)
3. [使いどころ（ユースケース）](#3-使いどころユースケース)
4. [本リポジトリの実装](#4-本リポジトリの実装)
5. [動作確認（curl）](#5-動作確認curl)
6. [実装のポイント](#6-実装のポイント)
7. [エラー処理とリトライ](#7-エラー処理とリトライ)
8. [他パターンとの違い](#8-他パターンとの違い)
9. [ベストプラクティス](#9-ベストプラクティス)

---

## 1. Function chaining とは

**Function chaining** は、複数の Activity（処理）を **決まった順序で1つずつ実行**し、
**前のステップの出力を次のステップの入力に渡していく**、最も基本的なパターンです。

```
[入力] → ① Activity A → ② Activity B → ③ Activity C → [出力]
             │              │              │
             └─ 出力を──────▶┘  出力を──────▶┘
```

たとえば「申請 → 検証 → 登録 → 通知」のように、
**順番に依存関係がある一連の処理**を1つのワークフローとして表現します。

---

## 2. なぜ Durable Functions を使うのか

単純に関数を順番に呼ぶだけなら、普通のコードでも書けます。
しかし、次のような要件があると Durable Functions が力を発揮します。

| 課題 | 通常の実装 | Durable Functions |
|------|-----------|-------------------|
| 途中でクラッシュしたら？ | 最初からやり直し | **中断地点から再開**（状態を永続化） |
| ステップが長時間かかる | 関数タイムアウト | 各ステップ間で待機してもコスト最小 |
| 進捗を可視化したい | 自前で管理 | `customStatus` や履歴で追跡可能 |
| リトライしたい | 自前で実装 | `callActivityWithRetry` で宣言的に |
| 各処理をスケールさせたい | 手動 | Activity ごとに独立スケール |

**ポイント**: オーケストレーターは「流れ（オーケストレーション）」だけを記述し、
実際の処理（副作用）は Activity に閉じ込めます。各 `yield` の時点で状態が保存されるため、
どこで落ちても続きから復元されます。

---

## 3. 使いどころ（ユースケース）

Function chaining は「**順序が決まっていて、前の結果を次に使う**」処理全般に向きます。

- **申請・登録フロー**: 入力検証 → 重複チェック → DB登録 → 確認メール送信
- **データ処理パイプライン**: 取得 → 変換 → 集計 → 保存
- **ETL / データ加工**: 抽出(Extract) → 変換(Transform) → ロード(Load)
- **注文処理**: 在庫確認 → 決済 → 出荷指示 → 通知
- **生成AIパイプライン**: プロンプト整形 → LLM 呼び出し → 後処理 → 保存
- **画像/動画処理**: アップロード → 変換 → サムネイル生成 → 配信登録
- **デプロイ手順**: ビルド → テスト → デプロイ → ヘルスチェック

> **向かないケース**: ステップ間に順序依存がなく**並列にできる**処理は
> Fan-out/Fan-in（並列 & 集約）の方が高速です。承認など**人間の介入**が入るなら
> Human interaction を使います。

---

## 4. 本リポジトリの実装

`server/src/functions/function-chaining/` に、最小の「申請 → 検証 → 登録 → 通知」を実装しています。

```
function-chaining/
├── chainingHttpStart.ts       # HTTP: POST /api/chaining/start で開始
├── chainingOrchestrator.ts    # オーケストレーター（3つの Activity を順番に呼ぶ）
├── validateApplication.ts     # ① 検証 Activity
├── registerApplication.ts     # ② 登録 Activity（recordId を払い出す）
└── notifyApplicant.ts         # ③ 通知 Activity（メッセージを返す）
```

### オーケストレーター（チェーンの本体）

```ts
const chainingOrchestrator: OrchestrationHandler = function* (context) {
  const input = (context.df.getInput() as Application) ?? { name: "名無し" };

  // ① 検証
  context.df.setCustomStatus({ step: 1, label: "検証中" });
  const validated = yield context.df.callActivity("validateApplication", input);

  // ② 登録（①の出力を入力に使う）
  context.df.setCustomStatus({ step: 2, label: "登録中" });
  const registration = yield context.df.callActivity("registerApplication", validated);

  // ③ 通知（②の出力を入力に使う）
  context.df.setCustomStatus({ step: 3, label: "通知中" });
  const message = yield context.df.callActivity("notifyApplicant", registration);

  return { name: registration.name, recordId: registration.recordId, message };
};
```

- `yield context.df.callActivity(名前, 入力)` で Activity を呼び、**完了を待って**次へ進みます。
- 前の戻り値（`validated`, `registration`）を次の入力に渡すのが「チェーン」の要点。
- `setCustomStatus` で現在ステップを公開し、進捗を外部から確認できるようにしています。

### 各 Activity（実際の処理）

| Activity | 入力 | 出力 | 役割 |
|----------|------|------|------|
| `validateApplication` | `{ name }` | `{ name }` | 名前が空でないか検証（空なら例外） |
| `registerApplication` | `{ name }` | `{ name, recordId }` | 一意な `recordId` を払い出し |
| `notifyApplicant` | `{ name, recordId }` | メッセージ文字列 | 受付通知メッセージを生成 |

---

## 5. 動作確認（curl）

前提: Azurite と Functions（`server/`）を起動しておく（README 参照）。

```bash
# チェーンを開始（name は任意）
curl -X POST http://localhost:7071/api/chaining/start \
  -H "Content-Type: application/json" \
  -d '{"name":"佐竹太郎"}'
# → レスポンスの "id"（instanceId）と各種URLを取得

# 状態を確認
curl "http://localhost:7071/runtime/webhooks/durabletask/instances/<id>"
```

完了時の出力例:

```json
{
  "runtimeStatus": "Completed",
  "customStatus": { "step": 3, "label": "通知中" },
  "output": {
    "name": "佐竹太郎",
    "recordId": "REC-MR6HVJDF",
    "message": "佐竹太郎 様の申請（REC-MR6HVJDF）を受け付け、通知を送信しました。"
  }
}
```

`step` が 1→2→3 と進み、最後に3つの Activity の結果が集約されて返ります。

---

## 6. 実装のポイント

### 出力を次の入力へ渡す

チェーンの本質は「前の戻り値を次の引数に渡す」ことです。

```ts
const a = yield context.df.callActivity("stepA", input);
const b = yield context.df.callActivity("stepB", a);   // ← a を渡す
const c = yield context.df.callActivity("stepC", b);   // ← b を渡す
```

### 副作用は必ず Activity に置く

オーケストレーターは**決定的（deterministic）**である必要があります。
DB アクセス・HTTP 呼び出し・時刻取得・乱数などの**非決定的処理は Activity 側**に置きます。
（オーケストレーターはリプレイのたびに再実行されるため、副作用を書くと二重実行や不整合の原因になります。）

### 進捗の可視化

`context.df.setCustomStatus({...})` で現在ステップを公開すると、
`getStatus` / `statusQueryGetUri` の `customStatus` で外部から進捗を取得できます。

---

## 7. エラー処理とリトライ

### try/catch でステップの失敗を捕捉

```ts
try {
  const validated = yield context.df.callActivity("validateApplication", input);
} catch (e) {
  // 検証失敗時の処理（補償・通知など）
  yield context.df.callActivity("notifyFailure", { error: String(e) });
  return { failed: true };
}
```

本実装では `validateApplication` が空名で例外を投げます。その場合、
オーケストレーションは `Failed` になり、`output` にエラー情報が入ります。

### リトライ付き呼び出し

一時的な失敗（ネットワーク断など）を自動再試行できます。

```ts
import * as df from "durable-functions";
const retry = new df.RetryOptions(3000 /*初回待機ms*/, 3 /*最大試行*/);
yield context.df.callActivityWithRetry("registerApplication", retry, validated);
```

---

## 8. 他パターンとの違い

| パターン | 実行順序 | 使いどころ |
|----------|----------|-----------|
| **Function chaining** | 直列（順番に） | 前の結果を次に使う一連の処理 |
| Fan-out / Fan-in | 並列 → 集約 | 独立した処理を同時実行して集約 |
| Async HTTP API | 起動→ポーリング | 長時間処理を非同期に待つ |
| Monitor | 定期ループ | 外部状態を繰り返し確認 |
| Human interaction | イベント待機 | 人間の承認・入力を待つ |
| Aggregator | イベント集約 | 継続的にイベントをまとめる |

Function chaining は最も基本で、他パターンの構成要素にもなります。

---

## 9. ベストプラクティス

- [ ] **順序依存があるものだけ**チェーンにする（並列化できるなら Fan-out を検討）。
- [ ] 副作用は **Activity** に閉じ込め、オーケストレーターは流れの記述に徹する。
- [ ] 各 Activity は **単一責務**・**冪等**に近づける（再実行に強くする）。
- [ ] 時刻・乱数・GUID は `context.df.currentUtcDateTime` / `context.df.newGuid()` を使う。
- [ ] 一時的失敗は `callActivityWithRetry` で宣言的にリトライ。
- [ ] 失敗時の**補償処理**（ロールバック・通知）を `try/catch` で用意。
- [ ] `setCustomStatus` で進捗を公開し、監視・UI 連携をしやすくする。

---

## 関連

- Human-in-the-loop の解説 → [`./DF-Human-in-the-loop.md`](./DF-Human-in-the-loop.md)
- プロジェクト全体 → [`./README.md`](./README.md)
- 公式: [Function chaining パターン](https://learn.microsoft.com/azure/azure-functions/durable/durable-functions-sequence)
