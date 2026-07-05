# Durable Functions — Monitor 完全ガイド

このドキュメントは、Azure Durable Functions の **Monitor（監視）**
パターンを、使いどころ・仕組み・実装・注意点まで詳しく解説します。
コード例は本リポジトリの `server/src/functions/monitor/` の実装に対応しています。

---

## 目次

1. [Monitor とは](#1-monitor-とは)
2. [なぜ Durable Functions を使うのか](#2-なぜ-durable-functions-を使うのか)
3. [仕組み（定期確認ループ）](#3-仕組み定期確認ループ)
4. [使いどころ（ユースケース）](#4-使いどころユースケース)
5. [本リポジトリの実装](#5-本リポジトリの実装)
6. [動作確認（curl）](#6-動作確認curl)
7. [実装のポイント](#7-実装のポイント)
8. [応用: 動的間隔・多重監視・通知](#8-応用-動的間隔多重監視通知)
9. [他パターンとの違い](#9-他パターンとの違い)
10. [ベストプラクティス](#10-ベストプラクティス)

---

## 1. Monitor とは

**Monitor** は、**外部の状態を一定間隔で繰り返し確認（ポーリング）し、
条件が満たされたら次のアクションを起こす**パターンです。

```
      ┌───────────────────────────────────┐
      │  監視ループ（期限まで繰り返す）       │
      │                                    │
      ▼                                    │
[状態を確認] ──"まだ"──▶ [Durable Timerで待機] ─┘
      │
   "完了/条件成立"
      │
      ▼
  [アクション実行] → 監視終了
```

「ジョブが終わったら通知する」「支払いが確認できたら出荷する」のように、
**いつ完了するか分からない外部イベントを待ち受ける**用途に使います。

---

## 2. なぜ Durable Functions を使うのか

「定期的に確認し続ける」処理を普通に書くと、常駐プロセスや cron、
状態管理などが必要になり複雑です。

| 課題 | 通常の実装 | Durable Functions |
|------|-----------|-------------------|
| 一定間隔で確認し続ける | 常駐プロセス/cron が必要 | オーケストレーター内のループ + Durable Timer |
| 待機中のコスト | プロセスを起こし続ける | **待機中は休止**（コスト最小） |
| いつ終わるか不明・長時間 | タイムアウト管理が面倒 | **日単位でも安全に待機** |
| 途中でクラッシュ | 監視が止まる | 状態が永続化され**再開** |
| 監視ごとに状態を持ちたい | 自前でDB管理 | インスタンス単位で状態を保持 |

**要点**: `createTimer`（Durable Timer）で待機するため、**待っている間は
コンピューティングを消費しません**。数分〜数日の監視でも低コストで実現できます。

---

## 3. 仕組み（定期確認ループ）

Monitor の骨格は「**期限まで、一定間隔で確認するループ**」です。

```
expiryTime = 現在時刻 + タイムアウト
while (現在時刻 < expiryTime) {
    status = 外部状態を確認（Activity）
    if (status == 完了) {
        アクション実行
        return（監視終了）
    }
    Durable Timer で interval 待機
}
return（タイムアウトで打ち切り）
```

- **期限（expiryTime）** を設けて無限監視を防ぐ。
- 確認は **Activity**（外部API/DBアクセス）に閉じ込める。
- 待機は **Durable Timer**（`createTimer`）で行う。

---

## 4. 使いどころ（ユースケース）

「**外部の完了・変化を待って、それをトリガーに次を動かしたい**」とき。

- **外部ジョブの完了監視**: バッチ/ML学習/レンダリングなどの終了を待って後続処理
- **デプロイ/プロビジョニングの監視**: リソース作成やロールアウト完了を待つ
- **支払い・決済の確認**: 入金が確認できたら出荷・発送を起動
- **審査・承認状態の監視**: 外部審査システムの結果が出るまで待つ
- **ヘルスチェック/SLA監視**: エンドポイントが復旧するまで監視して通知
- **在庫・価格の変化監視**: 条件を満たしたらアラート/発注

> **判断基準**: 「相手がいつ終わるか分からず、こちらから定期的に確認するしかない」
> ときに Monitor。相手から**イベントを送ってもらえる**なら Human interaction
> （外部イベント待機）の方がポーリング不要で効率的です。

---

## 5. 本リポジトリの実装

`server/src/functions/monitor/` に、外部ジョブの完了を定期監視する例を実装しています。

```
monitor/
├── monitorHttpStart.ts      # HTTP: POST /api/monitor/start（202 + 状態URL）
├── monitorOrchestrator.ts   # 定期確認ループ（Durable Timer + タイムアウト）
└── checkJobStatus.ts        # 外部ジョブ状態を確認する Activity
```

### オーケストレーター（監視ループの本体）

```ts
const monitorOrchestrator = function* (context) {
  const { intervalSeconds, timeoutSeconds } = context.df.getInput()
    ?? { intervalSeconds: 3, timeoutSeconds: 30 };
  const intervalMs = intervalSeconds * 1000;

  // 監視の期限
  const expiryTime = new Date(
    context.df.currentUtcDateTime.getTime() + timeoutSeconds * 1000
  );

  let pollCount = 0;
  while (context.df.currentUtcDateTime.getTime() < expiryTime.getTime()) {
    pollCount++;
    const status = yield context.df.callActivity("checkJobStatus", pollCount);
    context.df.setCustomStatus({ phase: "monitoring", pollCount, lastStatus: status });

    if (status === "Completed") {
      return { result: "completed", pollCount, message: `${pollCount} 回目で完了を検知` };
    }
    // 次の確認まで Durable Timer で待機
    const nextCheck = new Date(context.df.currentUtcDateTime.getTime() + intervalMs);
    yield context.df.createTimer(nextCheck);
  }

  // 期限切れ（タイムアウト）
  context.df.setCustomStatus({ phase: "timeout", pollCount });
  return { result: "timeout", pollCount, message: "期限内に完了しませんでした" };
};
```

### Activity（外部状態の確認役）

```ts
const checkJobStatus = (pollCount) => {
  // デモ: 毎回35%の確率で "Completed"（外部ジョブの進行をシミュレート）
  return Math.random() < 0.35 ? "Completed" : "Running";
};
```

実運用ではここで外部APIやDBを叩いて実際の状態を取得します。
乱数などの**非決定的処理は Activity 側**に置くのが鉄則です。

---

## 6. 動作確認（curl）

前提: Azurite と Functions（`server/`）を起動しておく（README 参照）。

```bash
# 監視を開始（2秒間隔、20秒でタイムアウト）
curl -X POST http://localhost:7071/api/monitor/start \
  -H "Content-Type: application/json" \
  -d '{"intervalSeconds":2,"timeoutSeconds":20}'
# → レスポンスの "id"（instanceId）を取得

# 状態をポーリング（customStatus に pollCount / lastStatus）
curl "http://localhost:7071/runtime/webhooks/durabletask/instances/<id>"
```

完了検知時の出力例:

```json
{
  "runtimeStatus": "Completed",
  "customStatus": { "phase": "monitoring", "pollCount": 2, "lastStatus": "Completed" },
  "output": {
    "result": "completed",
    "pollCount": 2,
    "message": "2 回目の確認でジョブ完了を検知しました。"
  }
}
```

期限内に完了しなかった場合は `output.result` が `"timeout"` になります。

---

## 7. 実装のポイント

### 待機は必ず Durable Timer

```ts
const nextCheck = new Date(context.df.currentUtcDateTime.getTime() + intervalMs);
yield context.df.createTimer(nextCheck);
```

`setInterval` / `setTimeout` は使わない（オーケストレーターは決定的である必要があるため）。
`createTimer` なら待機中はインスタンスが休止し、コストがかからない。

### 時刻は currentUtcDateTime

期限判定・次回時刻の計算はすべて `context.df.currentUtcDateTime` を基準にする。
`Date.now()` / `new Date()` はリプレイで値が変わるため禁止。

### タイムアウト（expiry）を必ず設ける

無限ループを避けるため、監視には**期限**を持たせる。
期限切れ時は `timeout` として結果を返し、必要なら別ルート（エスカレーション）へ。

### 進捗の公開

`setCustomStatus` に `pollCount` / `lastStatus` / `phase` を入れ、
監視の様子を外部から確認できるようにする。

---

## 8. 応用: 動的間隔・多重監視・通知

- **動的なポーリング間隔**: 最初は短く、時間が経つほど間隔を延ばす（バックオフ）。
  `interval` をループ内で変化させるだけで実現できる。
- **多重監視（並列）**: 複数対象を監視するなら、対象ごとにインスタンスを起動するか、
  Fan-out で複数の監視サブオーケストレーションを並列に走らせる。
- **完了時アクション**: 完了検知後に `callActivity` で通知・後続処理・別ワークフロー起動。
- **人間へのエスカレーション**: タイムアウト時に Human interaction（承認待ち）へつなぐ。

---

## 9. 他パターンとの違い

| パターン | 待ち方 | 使いどころ |
|----------|--------|-----------|
| **Monitor** | 自分から**定期的に確認**（ポーリング） | 相手がいつ終わるか不明で、確認するしかない |
| Human interaction | 外部**イベントを待つ**（プッシュ） | 相手（人/システム）がイベントを送れる |
| Async HTTP API | クライアントが状態を**ポーリング** | 長時間処理の受け口（202→200） |
| Function chaining | 直列に処理 | 順序のある処理 |

**Monitor と Human interaction は「待つ」点が似ていますが、方向が逆**です。
Monitor は「こちらから確認しに行く（pull）」、Human interaction は
「向こうからイベントが来る（push）」。イベントを送ってもらえるなら後者が効率的です。

---

## 10. ベストプラクティス

- [ ] 待機は必ず **`createTimer`**（Durable Timer）で行う（`setInterval` 禁止）。
- [ ] 時刻は **`context.df.currentUtcDateTime`** を使う（決定性）。
- [ ] **タイムアウト（expiry）** を設けて無限監視を防ぐ。
- [ ] 外部状態の確認（I/O・乱数）は **Activity** に閉じ込める。
- [ ] `setCustomStatus` で `pollCount` / `lastStatus` を公開する。
- [ ] ポーリング間隔は相手の負荷を考慮（必要ならバックオフ）。
- [ ] 相手がイベントを送れるなら Monitor より **Human interaction** を検討。
- [ ] 完了時・タイムアウト時の**後続処理**を明確にする。

---

## 関連

- Human-in-the-loop の解説 → [`./DF-Human-in-the-loop.md`](./DF-Human-in-the-loop.md)
- Async HTTP API の解説 → [`./DF-async-http-api.md`](./DF-async-http-api.md)
- Function chaining の解説 → [`./DF-function-chaining.md`](./DF-function-chaining.md)
- Fan-out / Fan-in の解説 → [`./DF-fanout-fanin.md`](./DF-fanout-fanin.md)
- プロジェクト全体 → [`./README.md`](./README.md)
- 公式: [Monitor パターン](https://learn.microsoft.com/azure/azure-functions/durable/durable-functions-overview#monitoring)
