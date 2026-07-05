# Durable Functions — Aggregator（集約 / Durable Entities）完全ガイド

このドキュメントは、Azure Durable Functions の **Aggregator（集約）**
パターンを、**Durable Entities** の仕組みとともに詳しく解説します。
コード例は本リポジトリの `server/src/functions/aggregator/` の実装に対応しています。

---

## 目次

1. [Aggregator とは](#1-aggregator-とは)
2. [Durable Entities とは](#2-durable-entities-とは)
3. [なぜ Durable Functions を使うのか](#3-なぜ-durable-functions-を使うのか)
4. [使いどころ（ユースケース）](#4-使いどころユースケース)
5. [本リポジトリの実装](#5-本リポジトリの実装)
6. [動作確認（curl）](#6-動作確認curl)
7. [実装のポイント](#7-実装のポイント)
8. [signalEntity と readEntityState](#8-signalentity-と-readentitystate)
9. [他パターンとの違い](#9-他パターンとの違い)
10. [ベストプラクティス](#10-ベストプラクティス)

---

## 1. Aggregator とは

**Aggregator** は、**時間をまたいで届く多数のイベントを、1つの状態に集約し続ける**
パターンです。カウント・合計・平均・最大/最小・バッチ化などに使います。

```
イベント① ─┐
イベント② ─┤
イベント③ ─┼─▶ [ Aggregator（状態を保持）] ─▶ 集約結果
イベント④ ─┤        count / sum / avg / min / max …
イベント⑤ ─┘
```

これまでのパターン（オーケストレーター）は「処理の流れ」を記述するものでしたが、
Aggregator は **状態を長期間持ち続ける**点が本質的に異なります。
これを実現するのが **Durable Entities（永続エンティティ）** です。

---

## 2. Durable Entities とは

**Durable Entity** は、**状態を持つ小さなオブジェクト**（アクターに近い概念）です。

- **一意なID**: `エンティティ名 + キー`（例: `metricsAggregator@sensor-1`）で識別
- **状態を永続保持**: 操作のたびに状態がストレージに保存される
- **操作（operation）を直列処理**: 送られてきた操作を**1件ずつ順番に**実行するため、
  **競合（レースコンディション）が起きない** → ロック不要で安全に集計できる
- **オンデマンド**: 必要なときだけメモリに載り、アイドル時は休止（低コスト）

```ts
// エンティティは「operation名」で分岐し、getState/setState で状態を更新する
const entity = (context) => {
  const state = context.df.getState(() => 初期値);
  switch (context.df.operationName) {
    case "add":   /* state を更新 */ context.df.setState(state); break;
    case "reset": context.df.setState(初期値); break;
  }
};
```

---

## 3. なぜ Durable Functions を使うのか

「多数のイベントを1つの状態に集約する」を自前で書くと、
**並行更新の競合**という難問にぶつかります。

| 課題 | 通常の実装 | Durable Entities |
|------|-----------|------------------|
| 同時に来るイベントの競合 | ロック/トランザクションが必要 | **直列処理**で競合しない（ロス不要） |
| 状態の永続化 | 自前でDB読み書き | 自動で永続化される |
| 大量のキー（集約単位） | シャーディング設計が必要 | キーごとに独立エンティティ（自動分散） |
| アイドル時のコスト | 常駐 | 休止してコスト最小 |
| スケール | 手動 | キー単位で自動スケール |

**要点**: エンティティは操作を**1件ずつ直列に処理**するため、
「読み込み → 加算 → 書き込み」の競合が構造的に起きません。
これが Aggregator を安全・簡潔に書ける理由です。

---

## 4. 使いどころ（ユースケース）

「**継続的に届くイベントを、単位ごとにまとめたい**」とき。

- **メトリクス集計**: リクエスト数・エラー数・レイテンシの合計/平均
- **IoT テレメトリ集約**: デバイスごとにセンサー値を集計（min/max/avg）
- **注文・カートの集約**: ユーザー/注文IDごとに明細を積み上げてバッチ化
- **カウンター**: いいね数・在庫数・投票数などの安全なインクリメント
- **課金・使用量の集計**: テナントごとの利用量を積算
- **イベントのバッファリング**: 一定数/一定時間たまったらまとめて処理

> **判断基準**: 「**状態を持って集め続ける**」なら Aggregator（Entity）。
> 「一度きりの並列処理→集約」なら Fan-out/Fan-in の方が適切です。

---

## 5. 本リポジトリの実装

`server/src/functions/aggregator/` に、数値イベントを集約する例を実装しています。

```
aggregator/
├── metricsAggregator.ts   # Durable Entity（集約の中核。add / reset）
├── aggregatorAdd.ts       # HTTP: POST /api/aggregator/{key}/add（signalEntity）
├── aggregatorGet.ts       # HTTP: GET  /api/aggregator/{key}（readEntityState）
└── aggregatorReset.ts     # HTTP: POST /api/aggregator/{key}/reset
```

### Entity（集約の中核）

```ts
interface MetricsState {
  count: number; sum: number; min: number | null; max: number | null; last: number | null;
}

const metricsAggregator = (context: EntityContext<MetricsState>) => {
  const state = context.df.getState(initialState) as MetricsState;

  switch (context.df.operationName) {
    case "add": {
      const value = context.df.getInput<number>() ?? 0;
      state.count += 1;
      state.sum += value;
      state.min = state.min === null ? value : Math.min(state.min, value);
      state.max = state.max === null ? value : Math.max(state.max, value);
      state.last = value;
      context.df.setState(state);   // ← 更新した状態を永続化
      break;
    }
    case "reset":
      context.df.setState(initialState());
      break;
  }
};

df.app.entity("metricsAggregator", metricsAggregator);
```

- `getState(初期化関数)` … 保持している状態を取得（無ければ初期値）
- `operationName` … 送られてきた操作名（`add` / `reset`）で分岐
- `getInput()` … 操作に付随する入力（加算する値）
- `setState(...)` … 状態を保存（次の操作へ引き継がれる）

### HTTP（イベント送信・状態取得）

```ts
// 送信: signalEntity（fire-and-forget）
const entityId = new df.EntityId("metricsAggregator", key);
await client.signalEntity(entityId, "add", value);

// 取得: readEntityState
const res = await client.readEntityState<MetricsState>(entityId);
// res.entityExists / res.entityState
```

`{key}` は集約の単位（メトリクス名・デバイスID・注文IDなど）。
**同じ key へのイベントは1つのエンティティに集約**されます。

---

## 6. 動作確認（curl）

前提: Azurite と Functions（`server/`）を起動しておく（README 参照）。

```bash
KEY=sensor-1

# イベントを複数送信（同じ key に集約される）
curl -X POST http://localhost:7071/api/aggregator/$KEY/add -H "Content-Type: application/json" -d '{"value":10}'
curl -X POST http://localhost:7071/api/aggregator/$KEY/add -H "Content-Type: application/json" -d '{"value":20}'
curl -X POST http://localhost:7071/api/aggregator/$KEY/add -H "Content-Type: application/json" -d '{"value":30}'

# 集約結果を取得
curl http://localhost:7071/api/aggregator/$KEY

# リセット
curl -X POST http://localhost:7071/api/aggregator/$KEY/reset
```

集約結果の例（10, 20, 30, 5, 35 を送った場合）:

```json
{
  "key": "sensor-1",
  "exists": true,
  "count": 5,
  "sum": 100,
  "avg": 20,
  "min": 5,
  "max": 35,
  "last": 35
}
```

> **補足**: `signalEntity` は fire-and-forget（202を返す）で、エンティティは
> 操作を非同期に**直列処理**します。連続送信直後に取得すると、まだ反映途中の
> ことがあるため、少し待ってから `GET` すると確実です。

---

## 7. 実装のポイント

### 直列処理だから競合しない

エンティティは1つのキーに対して操作を**1件ずつ順番に**処理します。
そのため「読み込み→加算→書き込み」を並行実行しても**カウントが失われません**。
自前のロックやトランザクションは不要です。

### キー設計 = 集約の単位

`new df.EntityId("metricsAggregator", key)` の `key` が集約の単位です。
`sensor-1` / `sensor-2` のようにキーを分ければ、それぞれ独立して集約されます
（キーごとに自動でスケール・分散）。

### 状態は JSON シリアライズ可能に

`setState` に渡す状態は JSON 化できる必要があります。関数やクラスインスタンスは不可。

### エンティティ内で重い処理・外部I/Oは避ける

エンティティ操作は短く保つのが基本。重い処理は別 Activity/オーケストレーターへ。

---

## 8. signalEntity と readEntityState

| API | 種別 | 用途 |
|-----|------|------|
| `client.signalEntity(id, op, input)` | 書き込み | 操作を**送るだけ**（fire-and-forget、結果は待たない） |
| `client.readEntityState<T>(id)` | 読み取り | 現在の状態を取得（`entityExists` / `entityState`） |
| `context.df.signalEntity(...)` | 書き込み | **オーケストレーター/エンティティから**他エンティティへ通知 |

- 集約は「送りっぱなし」で良いので `signalEntity`（202）を使う。
- 結果を同期的に受け取りたい特殊ケースでは、オーケストレーターから
  `callEntity`（応答待ち）を使う方法もある。

---

## 9. 他パターンとの違い

| パターン | 中心 | 状態 | 使いどころ |
|----------|------|------|-----------|
| **Aggregator** | **Entity** | **長期保持** | 継続的なイベントの集約・カウント |
| Fan-out / Fan-in | Orchestrator | 一時的 | 一度きりの並列処理→集約 |
| Function chaining | Orchestrator | 一時的 | 順序のある処理 |
| Human interaction | Orchestrator | 一時的 | 人間の入力を待つ |
| Monitor | Orchestrator | 一時的 | 外部状態を定期確認 |

**Aggregator だけが「状態を持つ Entity」ベース**である点が最大の違いです。
「1回のワークフロー」ではなく「**存在し続けるオブジェクト**」に対して
イベントを送り続けるイメージです。

---

## 10. ベストプラクティス

- [ ] 集約の単位を **キー（EntityId のキー）** で適切に分割する。
- [ ] エンティティの状態は **JSON シリアライズ可能**に保つ。
- [ ] 操作（operation）は**短く軽く**。重い処理は Activity/オーケストレーターへ委譲。
- [ ] 送信は **`signalEntity`**（fire-and-forget）、取得は **`readEntityState`**。
- [ ] 連続送信直後の取得は反映途中のことがある（少し待つ or 整合性要件を考慮）。
- [ ] 「一度きりの並列集約」なら Entity ではなく **Fan-out/Fan-in** を検討。
- [ ] 一定件数/時間でまとめて処理したい場合は、閾値到達時に別処理を起動する設計に。

---

## 関連

- Fan-out / Fan-in の解説 → [`./DF-fanout-fanin.md`](./DF-fanout-fanin.md)
- Monitor の解説 → [`./DF-monitor.md`](./DF-monitor.md)
- Human-in-the-loop の解説 → [`./DF-Human-in-the-loop.md`](./DF-Human-in-the-loop.md)
- プロジェクト全体 → [`./README.md`](./README.md)
- 公式: [Aggregator（Stateful entities）パターン](https://learn.microsoft.com/azure/azure-functions/durable/durable-functions-overview#aggregator)
- 公式: [Durable Entities](https://learn.microsoft.com/azure/azure-functions/durable/durable-functions-entities)
