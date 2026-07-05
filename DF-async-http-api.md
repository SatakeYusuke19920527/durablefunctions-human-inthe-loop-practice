# Durable Functions — Async HTTP API 完全ガイド

このドキュメントは、Azure Durable Functions の **Async HTTP API（非同期HTTP API）**
パターンを、使いどころ・仕組み・実装・注意点まで詳しく解説します。
コード例は本リポジトリの `server/src/functions/async-http/` の実装に対応しています。

---

## 目次

1. [Async HTTP API とは](#1-async-http-api-とは)
2. [なぜ必要なのか（解決する課題）](#2-なぜ必要なのか解決する課題)
3. [仕組み（202 → ポーリング → 200）](#3-仕組み202--ポーリング--200)
4. [使いどころ（ユースケース）](#4-使いどころユースケース)
5. [本リポジトリの実装](#5-本リポジトリの実装)
6. [動作確認（curl）](#6-動作確認curl)
7. [createCheckStatusResponse が返すもの](#7-createcheckstatusresponse-が返すもの)
8. [進捗の公開と Durable Timer](#8-進捗の公開と-durable-timer)
9. [クライアント側の実装パターン](#9-クライアント側の実装パターン)
10. [他パターンとの関係](#10-他パターンとの関係)
11. [ベストプラクティス](#11-ベストプラクティス)

---

## 1. Async HTTP API とは

**Async HTTP API** は、**時間のかかる処理を非同期に受け付ける**ためのパターンです。

- クライアントが処理を開始すると、サーバーは**すぐに `202 Accepted`** を返す
  （処理の完了は待たない）
- レスポンスに**状態確認用の URL**（`statusQueryGetUri`）を含める
- クライアントはその URL を**ポーリング**し、完了したら結果を受け取る

```
クライアント                       サーバー（Durable Functions）
    │  POST /api/async/start          │
    │ ───────────────────────────────▶│  オーケストレーション開始
    │  202 Accepted + statusUrl        │
    │ ◀───────────────────────────────│  （すぐ返す。完了は待たない）
    │                                  │
    │  GET statusUrl（ポーリング）      │
    │ ───────────────────────────────▶│
    │  202（実行中, progress: 67%）     │
    │ ◀───────────────────────────────│
    │  … 数秒後 …                       │
    │  GET statusUrl                    │
    │ ───────────────────────────────▶│
    │  200 OK + 結果                    │
    │ ◀───────────────────────────────│  完了
```

Durable Functions では、この仕組みが **`createCheckStatusResponse` 1つで組み込み提供**されます。

---

## 2. なぜ必要なのか（解決する課題）

HTTP リクエストには**タイムアウト**があります（多くのゲートウェイ/ブラウザで数十秒〜数分）。
処理がそれを超えると、接続が切れて結果を返せません。

| 課題 | 同期API（普通のHTTP） | Async HTTP API |
|------|----------------------|----------------|
| 処理が数分〜数時間かかる | タイムアウトで失敗 | **202を即返し**、後でポーリング |
| 接続を長時間保持 | サーバー負荷・不安定 | 接続は即解放 |
| 進捗を知りたい | 難しい | 状態URLで**進捗を取得**できる |
| 途中でクラッシュ | 最初からやり直し | 状態が永続化され**再開**可能 |
| クライアントが切断 | 処理も無駄になりがち | サーバー側は**独立して継続** |

**要点**: 「重い処理を投げて、あとで結果を取りに行く」形にすることで、
HTTP タイムアウトの制約から解放され、進捗確認や耐障害性も得られます。

---

## 3. 仕組み（202 → ポーリング → 200）

### ① 開始リクエスト → 202 Accepted

`createCheckStatusResponse` が次を返します。

- ステータスコード **`202 Accepted`**
- **`Location`** ヘッダ（＝ポーリング先の状態URL）
- **`Retry-After`** ヘッダ（推奨ポーリング間隔・秒）
- ボディに各種管理 URL（`statusQueryGetUri` など）

### ② ポーリング → 実行中は 202、完了で 200

状態URL（`statusQueryGetUri`）を GET すると:

| 状態 | HTTP コード | 内容 |
|------|-------------|------|
| 実行中（Pending/Running） | **202** | `runtimeStatus` と `customStatus`（進捗） |
| 完了（Completed） | **200** | `output`（最終結果） |
| 失敗（Failed/Terminated） | **200** | エラー情報 |

クライアントは **200 になるまで** `Retry-After` の間隔でポーリングします。

---

## 4. 使いどころ（ユースケース）

「**HTTP タイムアウトを超えうる長時間処理**」を非同期化したいとき。

- **生成AI処理**: 長文生成・要約・画像/動画生成など、数十秒〜数分かかる推論
- **バッチ処理API**: 大量レコードの一括処理・レポート生成
- **大容量ファイル処理**: 動画エンコード、大きなCSV/PDFの変換・解析
- **データパイプライン起動**: ETL やデータ取り込みジョブのキック
- **外部システム連携**: 応答が遅い外部APIを束ねる長時間処理
- **プロビジョニング**: クラウドリソース作成など時間のかかる操作

> **判断基準**: 処理が「HTTP のタイムアウト内に確実に終わる」なら同期APIで十分。
> 「超える可能性がある」「進捗を見せたい」なら Async HTTP API。

---

## 5. 本リポジトリの実装

`server/src/functions/async-http/` に、進捗付きの長時間処理を実装しています。

```
async-http/
├── asyncHttpStart.ts             # HTTP: POST /api/async/start（202 + 状態URLを返す）
└── longRunningOrchestrator.ts    # Durable Timer で進捗を刻む長時間処理
```

### 開始トリガー（202 を返す中核）

```ts
const asyncHttpStart = async (request, client, context) => {
  const { steps = 5 } = await request.json().catch(() => ({}));
  const instanceId = await client.startNew("longRunningOrchestrator", {
    input: { steps },
  });
  // ★ ここが Async HTTP API の中核：202 + 状態確認URL群を返す
  return client.createCheckStatusResponse(request, instanceId);
};
```

### 長時間処理オーケストレーター（進捗 + Durable Timer）

```ts
const longRunningOrchestrator = function* (context) {
  const { steps } = context.df.getInput() ?? { steps: 5 };

  for (let step = 1; step <= steps; step++) {
    // 進捗を customStatus で公開（ポーリングで見える）
    context.df.setCustomStatus({
      step, totalSteps: steps, progress: Math.round((step / steps) * 100),
    });
    // Durable Timer で2秒待機（長時間処理をシミュレート）
    const deadline = new Date(context.df.currentUtcDateTime.getTime() + 2000);
    yield context.df.createTimer(deadline);
  }

  return { message: `処理が完了しました（全 ${steps} ステップ）`, totalSteps: steps };
};
```

- **`createTimer`（Durable Timer）** で待機する点が重要。`setTimeout` と違い
  決定的で、**待機中はリソースを消費しません**（サーバーレスでコスト最小）。
- `setCustomStatus` で進捗率を公開し、ポーリング側に見せます。

---

## 6. 動作確認（curl）

前提: Azurite と Functions（`server/`）を起動しておく（README 参照）。

```bash
# ① 開始（-i でヘッダも表示）
curl -i -X POST http://localhost:7071/api/async/start \
  -H "Content-Type: application/json" -d '{"steps":3}'
```

レスポンス（抜粋）:

```
HTTP/1.1 202 Accepted
Location: http://localhost:7071/runtime/webhooks/durabletask/instances/<id>?...
Retry-After: 10
```

```bash
# ② 状態をポーリング（実行中は 202、完了で 200）
curl -i "http://localhost:7071/runtime/webhooks/durabletask/instances/<id>"
```

実行中:

```
HTTP/1.1 202 Accepted
{ "runtimeStatus": "Running", "customStatus": { "step": 2, "totalSteps": 3, "progress": 67 } }
```

完了:

```
HTTP/1.1 200 OK
{ "runtimeStatus": "Completed", "output": { "message": "処理が完了しました（全 3 ステップ）", "totalSteps": 3 } }
```

---

## 7. createCheckStatusResponse が返すもの

`createCheckStatusResponse(request, instanceId)` は、`202` 応答のボディに
以下の管理用 URL 群を含めます。

| URL | 用途 |
|-----|------|
| `statusQueryGetUri` | 状態取得（GET）。**実行中202 / 完了200** |
| `sendEventPostUri` | 外部イベント送信（Human interaction 併用時） |
| `terminatePostUri` | 実行の強制終了 |
| `purgeHistoryDeleteUri` | 履歴の削除 |
| `suspendPostUri` / `resumePostUri` | 一時停止 / 再開 |

また `202` 応答には **`Location`**（= `statusQueryGetUri`）と
**`Retry-After`** ヘッダが付き、クライアントは標準的な非同期ポーリングを行えます。

---

## 8. 進捗の公開と Durable Timer

### 進捗の公開（customStatus）

`context.df.setCustomStatus({...})` で任意の進捗オブジェクトを公開できます。
ポーリング応答の `customStatus` に反映され、UI の進捗バーなどに使えます。

### なぜ Durable Timer を使うのか

長時間の待機は、必ず **`context.df.createTimer(deadline)`** で行います。

- **決定的**: オーケストレーターはリプレイされるため、`setTimeout` や `Date.now()` は禁物。
  `context.df.currentUtcDateTime` を基準に `createTimer` を使う。
- **コスト最小**: 待機中はインスタンスが休止し、状態はストレージに保存される。
  数分〜数日の待機でもコンピューティングを消費しない。

---

## 9. クライアント側の実装パターン

### 素朴なポーリング（擬似コード）

```ts
const res = await fetch("/api/async/start", { method: "POST", body });
const { id, statusQueryGetUri } = await res.json();

// 202 の間ポーリング、200 で結果取得
while (true) {
  const s = await fetch(statusQueryGetUri);
  if (s.status === 200) {
    const result = await s.json();
    break; // 完了
  }
  await sleep(2000); // Retry-After を尊重
}
```

### 本リポジトリの Web 実装

`app/web` では、Next.js の API ルートが func に中継し、フロントが
`/api/status?instanceId=...` を一定間隔でポーリングして進捗・結果を表示します
（CORS 回避と URL 隠蔽のため、直接 func を叩かずプロキシ経由）。

---

## 10. 他パターンとの関係

- **実はすべてのオーケストレーション開始が Async HTTP API になり得ます**。
  `createCheckStatusResponse` を返せば、chaining でも fan-out でも同じ非同期ポーリングが使えます。
- Human interaction と組み合わせると、`sendEventPostUri` で承認イベントも送れます。
- 「長時間処理を非同期で受ける」という**受け口の作法**であり、
  中身の処理（chaining / fan-out など）は自由に組み合わせられます。

| パターン | 役割の違い |
|----------|-----------|
| **Async HTTP API** | 長時間処理の**受け口**（202→ポーリング→200） |
| Function chaining | 処理の**中身**（直列） |
| Fan-out / Fan-in | 処理の**中身**（並列） |
| Human interaction | 途中で**人間の入力**を待つ |

---

## 11. ベストプラクティス

- [ ] 長時間になりうる処理は**同期で待たせず 202** を返す（`createCheckStatusResponse`）。
- [ ] クライアントは **`Retry-After`** を尊重してポーリング間隔を決める。
- [ ] 待機は必ず **`createTimer`**（Durable Timer）で行う（`setTimeout` 禁止）。
- [ ] 時刻は **`context.df.currentUtcDateTime`** を使う（決定性）。
- [ ] `setCustomStatus` で**進捗**を公開し、UI で見えるようにする。
- [ ] 完了後は不要な履歴を **purge** してストレージを節約。
- [ ] 認証が必要なら状態URLも保護（本番は `authLevel` を anonymous 以外に）。

---

## 関連

- Function chaining の解説 → [`./DF-function-chaining.md`](./DF-function-chaining.md)
- Fan-out / Fan-in の解説 → [`./DF-fanout-fanin.md`](./DF-fanout-fanin.md)
- Human-in-the-loop の解説 → [`./DF-Human-in-the-loop.md`](./DF-Human-in-the-loop.md)
- プロジェクト全体 → [`./README.md`](./README.md)
- 公式: [Async HTTP API パターン](https://learn.microsoft.com/azure/azure-functions/durable/durable-functions-overview#async-http)
