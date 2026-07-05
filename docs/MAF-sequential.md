# Microsoft Agent Framework — Sequential 完全ガイド

このドキュメントは、**Microsoft Agent Framework（MAF）** の
**Sequential（順次）オーケストレーション**パターンを網羅的に解説します。
コード例は **Python**（`agent-framework`）で、本リポジトリの
`server/microsoftagentframework/patterns/sequential/` に実装する内容に対応します。

> ℹ️ Microsoft Agent Framework は AutoGen（マルチエージェント）と
> Semantic Kernel（エンタープライズ制御）を統合した、エージェント構築のための
> オープンソース SDK / ランタイムです。本体は **Python / .NET** に対応しています。

---

## 目次

1. [Sequential とは](#1-sequential-とは)
2. [仕組み（パイプラインと会話コンテキスト）](#2-仕組みパイプラインと会話コンテキスト)
3. [使いどころ（ユースケース）](#3-使いどころユースケース)
4. [実装（Python / Agent Framework）](#4-実装python--agent-framework)
5. [コンテキストの制御（chain_only_agent_responses）](#5-コンテキストの制御chain_only_agent_responses)
6. [カスタム Executor の混在](#6-カスタム-executor-の混在)
7. [中間出力とイベント](#7-中間出力とイベント)
8. [Human-in-the-loop（ツール承認）](#8-human-in-the-loopツール承認)
9. [本リポジトリでの位置づけ](#9-本リポジトリでの位置づけ)
10. [Durable Functions の Function chaining との違い](#10-durable-functions-の-function-chaining-との違い)
11. [ベストプラクティス](#11-ベストプラクティス)
12. [参考リンク](#12-参考リンク)

---

## 1. Sequential とは

**Sequential オーケストレーション**は、複数の **Agent をパイプライン状に固定順で並べ**、
**各 Agent が前の Agent の出力を受け取って処理し、次へ渡す**パターンです。

```
[入力] ─▶ Agent A ─▶ Agent B ─▶ Agent C ─▶ [最終出力]
             │          │          │
             └─ 会話履歴を引き継ぎながら次へ ─┘
```

「前段の成果を土台に次段が積み上げる」処理に向きます。
例：**要約 → レビュー → 最終回答**、翻訳パイプライン、多段推論など。

---

## 2. 仕組み（パイプラインと会話コンテキスト）

### 会話履歴の受け渡し

- **既定**: 各 Agent は「**前の Agent の会話全体**（入力メッセージ＋応答メッセージ）」を受け取る。
  つまり、後段になるほど文脈が積み上がっていく。
- **オプション**: `chain_only_agent_responses=True` にすると、各 Agent は
  「**前の Agent の応答メッセージのみ**」を受け取る（→ [5章](#5-コンテキストの制御chain_only_agent_responses)）。

### 終端出力

- ワークフローの**最終出力は `AgentResponse`**（＝最後の Agent の応答メッセージ）。
- 会話全体ではなく、**末尾 Agent の結果**が返る点に注意。

---

## 3. 使いどころ（ユースケース）

「**順序に依存し、前段の結果を次段が使う**」エージェント処理に向きます。

- **ドキュメント処理**: ライター（生成）→ レビュアー（校閲）→ 整形
- **翻訳パイプライン**: 日本語 → 英語 → 要約（言語や粒度を段階変換）
- **多段推論**: 情報抽出 → 分析 → 結論生成
- **要約 → レビュー → 最終回答**（本リポジトリの想定例）
- **データ加工**: LLM 生成 → ルールベースの後処理（カスタム Executor を混在）

> **向かないケース**: 各処理が独立で**並列にできる**なら Concurrent、
> 文脈で担当を切り替えたいなら Handoff、複数視点で**議論**させたいなら Group Chat が適切。

---

## 4. 実装（Python / Agent Framework）

### 4.1 チャットクライアントの用意

Agent のバックエンドとなる LLM クライアントを1つ用意し、複数 Agent で共有します。
（Azure AI Foundry を使う例。Azure OpenAI 等でも可）

```python
import os
from agent_framework.foundry import FoundryChatClient
from azure.identity import AzureCliCredential

chat_client = FoundryChatClient(
    project_endpoint=os.environ["FOUNDRY_PROJECT_ENDPOINT"],
    model=os.environ["FOUNDRY_MODEL"],
    credential=AzureCliCredential(),
)
```

> ⚠️ `DefaultAzureCredential` / `AzureCliCredential` は開発には便利ですが、本番では
> `ManagedIdentityCredential` など明示的な資格情報を推奨（レイテンシ・セキュリティの観点）。

### 4.2 Agent の定義

`instructions`（役割・システムプロンプト）と `name` を与えて Agent を作ります。

```python
writer = chat_client.as_agent(
    instructions="You are a concise copywriter. Provide a single, punchy marketing sentence.",
    name="writer",
)

reviewer = chat_client.as_agent(
    instructions="You are a thoughtful reviewer. Give brief feedback on the previous assistant message.",
    name="reviewer",
)
```

### 4.3 Sequential ワークフローの構築

`SequentialBuilder` に **participants（実行順）** を渡して `build()` します。

```python
from agent_framework.orchestrations import SequentialBuilder

# writer → reviewer の順で処理
workflow = SequentialBuilder(participants=[writer, reviewer]).build()
```

### 4.4 実行と結果の取得

`await workflow.run(入力)` で実行し、`get_outputs()` で終端の `AgentResponse` を得ます。

```python
from agent_framework import AgentResponse

events = await workflow.run("Write a tagline for a budget-friendly eBike.")
outputs = events.get_outputs()

if outputs:
    final: AgentResponse = outputs[0]
    for msg in final.messages:
        name = msg.author_name or "assistant"
        print(f"[{name}]\n{msg.text}")
```

出力例:

```text
===== Final Response =====
[reviewer]
This tagline clearly communicates affordability... Overall, a strong and effective suggestion!
```

---

## 5. コンテキストの制御（chain_only_agent_responses）

既定では各 Agent が「前段の会話全体」を受け取りますが、
`chain_only_agent_responses=True` にすると「**前段の応答のみ**」を受け取ります。

```python
workflow = SequentialBuilder(
    participants=[writer, translator, reviewer],
    chain_only_agent_responses=True,
).build()
```

**使いどころ**: 翻訳パイプライン・段階的リファインなど、
「前の出力**だけ**を変換すればよく、それ以前の会話に引きずられたくない」ケース。

---

## 6. カスタム Executor の混在

LLM を使わない独自ロジック（集計・整形・ルール処理）を、Agent と**混在**させられます。
`Executor` を継承し、`@handler` を付けたメソッドで処理します。

```python
from agent_framework import (
    AgentExecutorResponse, AgentResponse, Executor, WorkflowContext, handler, Message,
)
from typing_extensions import Never

class Summarizer(Executor):
    """末尾に置く終端 Executor。会話全体を受け取り、要約を最終出力にする。"""

    @handler
    async def summarize(
        self,
        agent_response: AgentExecutorResponse,
        ctx: WorkflowContext[Never, AgentResponse],
    ) -> None:
        conv = agent_response.full_conversation or []
        users = sum(1 for m in conv if m.role == "user")
        assistants = sum(1 for m in conv if m.role == "assistant")
        summary = Message("assistant", [f"Summary -> users:{users} assistants:{assistants}"])
        await ctx.yield_output(AgentResponse(messages=[summary]))

# content(Agent) → summarizer(カスタム) の順
summarizer = Summarizer(id="summarizer")
workflow = SequentialBuilder(participants=[content, summarizer]).build()
```

**ポイント**:
- Agent の次に来るカスタム Executor は、ハンドラ引数に `AgentExecutorResponse` を受け取る
  （Agent は内部で `AgentExecutor` にラップされるため）。会話全体は `full_conversation` で参照。
- **末尾（terminator）の Executor は必ず `ctx.yield_output(AgentResponse(...))`** を呼び、
  その出力をワークフローの終端出力にする。

---

## 7. 中間出力とイベント

ワークフローの実行はイベントストリームとして観測でき、各 Agent の進行や
中間出力を追跡できます（ストリーミング実行では応答トークンをリアルタイムに受け取れる）。
UI で「どの Agent が今処理中か」「途中経過」を見せたい場合に利用します。

- Agent の応答更新イベント（進行状況）
- ワークフローの出力イベント（`get_outputs()` で終端の `AgentResponse` を取得）

---

## 8. Human-in-the-loop（ツール承認）

Sequential は、Agent が使う**ツール呼び出しに人間の承認**を挟めます。
機微なツールを承認必須にしておくと、そのツールが呼ばれた時点でワークフローが**中断**し、
承認イベントが発行されます。外部（人間）が承認/拒否するとワークフローが再開します。

- 機微ツールを「承認必須」でラップ（例: 本番デプロイなど）
- 承認要求イベントを受け取り、承認/拒否を返して再開
- 追加設定なしで、順次オーケストレーションに組み込める

（Durable Functions の Human-in-the-loop と同じ発想を、エージェントのツール実行に適用したもの）

---

## 9. 本リポジトリでの位置づけ

- 配置: `server/microsoftagentframework/patterns/sequential/`
- ランタイム: **Python の Azure Functions（別 Function App、別ポート）**。
  Node 版の Durable Functions（`server/durablefunctions/`, :7071）とは独立して起動。
- 公開: HTTP トリガー（例: `POST /api/sequential`）で入力を受け取り、
  Sequential ワークフローを実行して結果を返す。
- フロント: `app/web` のサイドメニュー「Microsoft Agent Framework」から、
  Next.js の API ルート経由で本サービス（`AGENT_BASE_URL`）を呼び出す想定。
- 必要な設定: LLM 接続（Azure AI Foundry / Azure OpenAI）のエンドポイント・モデル・資格情報。

---

## 10. Durable Functions の Function chaining との違い

「直列に処理する」点は似ていますが、抽象度と役割が異なります。

| 観点 | Durable Functions: Function chaining | Agent Framework: Sequential |
|------|--------------------------------------|-----------------------------|
| 処理単位 | Activity（任意のコード） | **Agent（LLM）** ＋ 任意の Executor |
| 受け渡すもの | 前段の**戻り値** | 前段の**会話（メッセージ）** |
| 主目的 | 決定的なワークフロー | **LLM による生成・推論の多段化** |
| 状態の永続化 | ストレージに永続化（中断・再開・耐障害） | ワークフロー実行（永続化は別途設計） |
| 人間の介入 | 外部イベント待機 | **ツール承認**（HITL） |

- **確定的な業務処理を止まらず流したい** → Function chaining
- **LLM エージェントを段階的に組み合わせたい** → Sequential

両者は排他ではなく、Durable Functions からエージェント処理を呼ぶ、といった**組み合わせ**も可能です。

---

## 11. ベストプラクティス

- [ ] 各 Agent の役割（`instructions`）を**単一責務**に保つ（生成/校閲/整形を分離）。
- [ ] 変換だけを積み重ねたいときは `chain_only_agent_responses=True` を検討。
- [ ] LLM 不要の後処理は**カスタム Executor** に分離（末尾なら `yield_output` を忘れない）。
- [ ] 資格情報は環境変数 / Managed Identity で管理（平文で置かない）。本番は明示的な Credential を推奨。
- [ ] 進行状況を見せたい UI では**イベント/ストリーミング**を活用。
- [ ] 機微な操作は**ツール承認（HITL）**で保護する。
- [ ] 独立処理を並べているだけなら Sequential ではなく **Concurrent** を検討（無駄な直列化を避ける）。

---

## 12. 参考リンク

- [Sequential orchestration（公式・Python/.NET）](https://learn.microsoft.com/agent-framework/workflows/orchestrations/sequential?pivots=programming-language-python)
- [Agents in Workflows](https://learn.microsoft.com/agent-framework/workflows/agents-in-workflows)
- [Agent Framework ドキュメント](https://learn.microsoft.com/agent-framework/)
- [microsoft/agent-framework（GitHub）](https://github.com/microsoft/agent-framework)

## 関連（本リポジトリ）

- 対になる Durable Functions パターン → [`./DF-function-chaining.md`](./DF-function-chaining.md)
- プロジェクト全体 → [`../README.md`](../README.md)
- Agent Framework 側の構成 → [`../server/microsoftagentframework/README.md`](../server/microsoftagentframework/README.md)
