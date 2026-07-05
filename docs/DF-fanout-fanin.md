# Durable Functions — Fan-out / Fan-in 完全ガイド

このドキュメントは、Azure Durable Functions の **Fan-out / Fan-in（並列 & 集約）**
パターンを、使いどころ・実装・注意点まで詳しく解説します。
コード例は本リポジトリの `server/src/functions/fan-out-fan-in/` の実装に対応しています。

---

## 目次

1. [Fan-out / Fan-in とは](#1-fan-out--fan-in-とは)
2. [なぜ Durable Functions を使うのか](#2-なぜ-durable-functions-を使うのか)
3. [使いどころ（ユースケース）](#3-使いどころユースケース)
4. [本リポジトリの実装](#4-本リポジトリの実装)
5. [動作確認（curl）](#5-動作確認curl)
6. [実装のポイント](#6-実装のポイント)
7. [エラー処理・並列度の制御](#7-エラー処理並列度の制御)
8. [Function chaining との違い](#8-function-chaining-との違い)
9. [ベストプラクティス](#9-ベストプラクティス)

---

## 1. Fan-out / Fan-in とは

**Fan-out / Fan-in** は、**独立した複数の処理を並列に一斉起動（fan-out）**し、
**すべての完了を待って結果を集約（fan-in）**するパターンです。

```
                ┌─▶ Activity(1) ─┐
                ├─▶ Activity(2) ─┤
[入力] ─fan-out─┼─▶ Activity(3) ─┼─fan-in─▶ [集約結果]
                ├─▶ Activity(4) ─┤   (Task.all)
                └─▶ Activity(5) ─┘
```

- **fan-out**: 複数の Activity を同時に投げる（`files.map(f => callActivity(...))`）
- **fan-in**: `Task.all` で全部の完了を待ち、結果配列を集約する

各処理に依存関係がなく**独立して並列実行できる**ときに使います。

---

## 2. なぜ Durable Functions を使うのか

「並列実行して集約」を自前で書くのは、実は難しい問題を含みます。

| 課題 | 通常の実装 | Durable Functions |
|------|-----------|-------------------|
| 大量の並列タスクの管理 | 自前でキュー・状態管理 | `Task.all` で宣言的に |
| 途中でクラッシュしたら？ | どこまで終わったか不明 | **完了済みは履歴から復元**し継続 |
| 各処理を個別にスケール | 手動 | Activity ごとに自動スケール |
| 結果の集約 | 自前で待ち合わせ | `Task.all` が結果配列を返す |
| 並列度が多すぎる | 過負荷 | ホスト側でスロットリング可 |

**ポイント**: fan-out した各 Activity は別々のワーカーで並列実行され、
`Task.all` の時点までに完了した結果が履歴に保存されます。
途中で落ちても、未完了のタスクだけ再開されます。

---

## 3. 使いどころ（ユースケース）

「**独立した処理を大量に、同時に**」こなしたいときに向きます。

- **複数ファイルの一括処理**: 画像リサイズ、ドキュメント解析、ウイルススキャン
- **複数AIエージェントの並列実行**: 複数モデル/プロンプトへ同時問い合わせして集約
- **大量データの分割処理（map/reduce）**: チャンクごとに集計 → 合算
- **複数APIの同時呼び出し**: 複数の外部サービスから情報取得してマージ
- **バッチ処理**: 数千件のレコードを並列処理してレポート化
- **マルチリージョン・マルチテナント処理**: 各対象を並列に処理

> **向かないケース**: 処理に**順序依存がある**場合は Function chaining。
> **人間の承認**が必要なら Human interaction。**継続的な集約**なら Aggregator。

---

## 4. 本リポジトリの実装

`server/src/functions/fan-out-fan-in/` に、最小の「複数ファイルを並列分析 → 集約」を実装しています。

```
fan-out-fan-in/
├── fanOutHttpStart.ts     # HTTP: POST /api/fanout/start で開始
├── fanOutOrchestrator.ts  # fan-out（並列起動）→ fan-in（Task.allで集約）
└── analyzeFile.ts         # 1ファイル分析 Activity（並列に多数実行される）
```

### オーケストレーター（並列 & 集約の本体）

```ts
const fanOutOrchestrator: OrchestrationHandler = function* (context) {
  const input = (context.df.getInput() as FanOutInput) ?? { files: [] };
  const files = input.files ?? [];

  // fan-out: 各ファイルの分析タスクを「並列」に作成
  context.df.setCustomStatus({ phase: "fan-out", total: files.length });
  const tasks = files.map((file) => context.df.callActivity("analyzeFile", file));

  // fan-in: すべての完了を待って集約
  const results = yield context.df.Task.all(tasks);

  context.df.setCustomStatus({ phase: "fan-in", total: files.length });
  const totalWords = results.reduce((sum, r) => sum + r.words, 0);

  return { totalFiles: files.length, totalWords, details: results };
};
```

- **重要**: `files.map(...)` で先に**タスクをすべて作成**してから `Task.all` に渡すのがコツ。
  ループ内で1つずつ `yield` すると直列になってしまう（→ [実装のポイント](#6-実装のポイント)）。
- `Task.all` は**全タスクの結果を配列**で返し、順序は入力順に対応する。

### Activity（並列に実行される単位）

```ts
const analyzeFile: ActivityHandler = async (file: string) => {
  await new Promise((r) => setTimeout(r, 3000)); // デモ用に約3秒
  const words = Math.floor(Math.random() * 100) + 1;
  return { file, words };
};
```

| Activity | 入力 | 出力 | 役割 |
|----------|------|------|------|
| `analyzeFile` | ファイル名 | `{ file, words }` | 1ファイルを分析（約3秒） |

---

## 5. 動作確認（curl）

前提: Azurite と Functions（`server/`）を起動しておく（README 参照）。

```bash
# 5ファイルを並列分析（files 省略時はデフォルト5件）
curl -X POST http://localhost:7071/api/fanout/start \
  -H "Content-Type: application/json" \
  -d '{"files":["a.txt","b.txt","c.txt","d.txt","e.txt"]}'
# → レスポンスの "id"（instanceId）を取得

# 状態を確認
curl "http://localhost:7071/runtime/webhooks/durabletask/instances/<id>"
```

完了時の出力例:

```json
{
  "runtimeStatus": "Completed",
  "customStatus": { "phase": "fan-in", "total": 5 },
  "output": {
    "totalFiles": 5,
    "totalWords": 366,
    "details": [
      { "file": "a.txt", "words": 93 },
      { "file": "b.txt", "words": 89 },
      { "file": "c.txt", "words": 65 },
      { "file": "d.txt", "words": 58 },
      { "file": "e.txt", "words": 61 }
    ]
  }
}
```

**並列性の確認**: 各 Activity は約3秒。5件を**直列**なら約15秒かかるところ、
**並列**なので全体で**約3秒**で完了します（起動オーバーヘッド込みで数秒）。

---

## 6. 実装のポイント

### ★ 並列にする書き方（最重要）

```ts
// ✅ 並列（fan-out）: 先に全タスクを作ってから Task.all
const tasks = files.map((f) => context.df.callActivity("analyzeFile", f));
const results = yield context.df.Task.all(tasks);

// ❌ 直列になってしまう例: ループ内で1つずつ yield
const results = [];
for (const f of files) {
  results.push(yield context.df.callActivity("analyzeFile", f)); // 前の完了を待つ
}
```

`yield` は「そのタスクの完了を待つ」ため、ループ内で `yield` すると直列化します。
**タスクの配列を作ってから `Task.all` に渡す**のが並列化の鍵です。

### Task.all と Task.any

- `context.df.Task.all(tasks)` … **全部**の完了を待ち、結果を配列で返す（fan-in の基本）
- `context.df.Task.any(tasks)` … **最初の1つ**が完了したら返す（最速の結果を採用したい時）

### 集約（reduce）

`Task.all` が返す結果配列を `reduce` / `map` で集計します（合計・平均・マージなど）。

### 副作用は Activity に

分析・I/O・乱数・時刻などの**非決定的処理は Activity 側**へ。
オーケストレーターはリプレイされるため、並列タスクの「組み立てと集約」だけを記述します。

---

## 7. エラー処理・並列度の制御

### 一部のタスクが失敗したら

`Task.all` は、**いずれかのタスクが失敗すると reject** します（例外が throw される）。

```ts
try {
  const results = yield context.df.Task.all(tasks);
} catch (e) {
  // どれかが失敗。必要なら成功分だけ拾う設計にする
}
```

「失敗しても他は続行し、成功分だけ集約したい」場合は、各 Activity 側で
try/catch して**必ず結果オブジェクトを返す**（失敗も値として表現する）設計にします。

### 並列度（スロットリング）の制御

数千タスクを一気に fan-out すると過負荷になります。`host.json` で
Activity の同時実行数を制御できます。

```json
{
  "extensions": {
    "durableTask": {
      "maxConcurrentActivityFunctions": 10
    }
  }
}
```

さらに大量の場合は、バッチに分割して `Task.all` を複数回に分ける方法もあります。

---

## 8. Function chaining との違い

| | Function chaining | Fan-out / Fan-in |
|---|---|---|
| 実行 | **直列**（順番に） | **並列**（同時に） |
| 依存関係 | 前の結果を次に使う | 各処理は独立 |
| 所要時間（N件×3秒） | 約 3N 秒 | 約 3秒 |
| API | `callActivity` を順に `yield` | `map` → `Task.all` |
| 例 | 申請→検証→登録→通知 | 複数ファイルを一括分析 |

順序が必要なら chaining、独立して同時実行できるなら fan-out/fan-in を選びます。
両者は組み合わせ可能（例: チェーンの途中の1ステップを並列 fan-out する）。

---

## 9. ベストプラクティス

- [ ] **タスク配列を作ってから `Task.all`**（ループ内 `yield` で直列化しない）。
- [ ] 各 Activity は**独立・冪等**に（並列・再実行に強くする）。
- [ ] 失敗を許容したいなら Activity 内で try/catch し、結果として返す。
- [ ] 大量並列は `maxConcurrentActivityFunctions` やバッチ分割で**スロットリング**。
- [ ] 副作用・乱数・時刻は Activity 側に置き、オーケストレーターは決定的に保つ。
- [ ] `setCustomStatus` で `fan-out` / `fan-in` フェーズや総数を公開し、監視・UI 連携。
- [ ] 結果の順序は入力順に対応する（`Task.all` の返り値）。

---

## 関連

- Function chaining の解説 → [`./DF-function-chaining.md`](./DF-function-chaining.md)
- Human-in-the-loop の解説 → [`./DF-Human-in-the-loop.md`](./DF-Human-in-the-loop.md)
- プロジェクト全体 → [`./README.md`](./README.md)
- 公式: [Fan-out/fan-in パターン](https://learn.microsoft.com/azure/azure-functions/durable/durable-functions-cloud-backup)
