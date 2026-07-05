# Microsoft Agent Framework — Group Chat 完全ガイド

このドキュメントは、**Microsoft Agent Framework（MAF）** の
**Group Chat（共有会話による複数 Agent 討議）**パターンを網羅的に解説します。
コード例は **Python**（`agent-framework`）で、本リポジトリの
`server/microsoftagentframework/patterns/group_chat/` の実装に対応します。

---

## 目次

1. [Group Chat とは](#1-group-chat-とは)
2. [仕組み（共有コンテキストと発話者選択）](#2-仕組み共有コンテキストと発話者選択)
3. [使いどころ（ユースケース）](#3-使いどころユースケース)
4. [実装（Python / Agent Framework）](#4-実装python--agent-framework)
5. [本リポジトリでの位置づけ](#5-本リポジトリでの位置づけ)
6. [Concurrent との違い](#6-concurrent-との違い)
7. [Sequential との違い](#7-sequential-との違い)
8. [ベストプラクティス](#8-ベストプラクティス)
9. [参考リンク](#9-参考リンク)

---

## 1. Group Chat とは

**Group Chat オーケストレーション**は、複数の Agent が**同じ会話コンテキストを共有**し、
司会役（orchestrator / moderator）が「次に誰が話すか」を選びながら議論を進めるパターンです。

```
                         ┌──────────────────────┐
                         │ moderator             │
                         │ 次の発話者を選ぶ       │
                         └──────────┬───────────┘
                                    │
       ┌────────────────────────────┼────────────────────────────┐
       │                            ▼                            │
       │                  [共有会話コンテキスト]                  │
       │             topic / pro の発言 / con の発言 ...          │
       │                            ▲                            │
       └──────────────┬─────────────┴─────────────┬──────────────┘
                      │                           │
              ┌───────▼───────┐           ┌───────▼───────┐
              │ pro（賛成派）  │           │ con（反対派）  │
              │ 賛成意見を提示 │           │ 反論・懸念提示 │
              └───────────────┘           └───────────────┘
```

本リポジトリのデモでは、`pro`（賛成派）と `con`（反対派）が1つのトピックについて討議し、
`moderator` が発話順を制御します。モデルは Azure OpenAI の **gpt-5-mini** を使います。

---

## 2. 仕組み（共有コンテキストと発話者選択）

### 共有コンテキスト

- 参加 Agent は、互いの発言を含む**同じ会話履歴**を参照します。
- 後の発言者は、直前までの議論を踏まえて賛成・反対・補足・再検証を行えます。
- 「独立に回答を並べる」のではなく、**相互作用する会話**として進みます。

### Orchestrator / Moderator による発話者選択

- `orchestrator_agent` に指定した Agent が、議論の文脈を見て次の発話者を選びます。
- ルールベースで選びたい場合は `selection_func` のような選択関数を使う構成もあります。
- moderator の `instructions` で「賛成派と反対派を交互に発言させる」「重複を避ける」などの進行方針を与えます。

### max_rounds / termination

- `with_max_rounds(3)` のように最大ラウンド数を設定し、議論が長くなりすぎるのを防ぎます。
- 実運用では、最大ラウンド、合意条件、終了判定（termination）を組み合わせて制御します。
- UI ではイベント列を順番に表示すると、実際の討議の流れを見せやすくなります。

---

## 3. 使いどころ（ユースケース）

「**複数の視点が互いに反応しながら答えを深める**」場面に向きます。

- **多職種レビュー**: エンジニア・法務・セキュリティ・事業担当が順に論点を補強
- **反論・再検証**: ある提案に対して反対意見やリスクを出し、再度見直す
- **賛否の議論**: 導入可否、方針変更、アーキテクチャ選定などを pro / con で討議
- **合意形成**: 争点を整理し、最後に妥協案や合意案へ近づける
- **ブレスト**: アイデアを出し合い、別 Agent が広げる・批判する・まとめる

> **向かないケース**: 固定順で変換するだけなら Sequential、
> 互いに依存しない複数観点を同時に出したいだけなら Concurrent が適切。

---

## 4. 実装（Python / Agent Framework）

本リポジトリでは、賛成派・反対派・司会役の3 Agent で討議します。

```
group_chat/
└── __init__.py   # HTTP: POST /api/groupchat、GroupChatBuilder で討議を実行
```

### クライアントと Agent の定義

```python
import os
from agent_framework.openai import OpenAIChatClient

client = OpenAIChatClient(
    azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
    api_key=os.environ["AZURE_OPENAI_API_KEY"],
    model=os.environ["AZURE_OPENAI_CHAT_DEPLOYMENT_NAME"],  # gpt-5-mini のデプロイ名
    api_version=os.environ.get("AZURE_OPENAI_API_VERSION", "preview"),
)

pro = client.as_agent(
    name="pro",
    instructions="あなたは賛成派です。論点を整理し、導入メリットを簡潔に述べてください。",
)

con = client.as_agent(
    name="con",
    instructions="あなたは反対派です。リスク、制約、見落としを簡潔に指摘してください。",
)

moderator = client.as_agent(
    name="moderator",
    instructions=(
        "あなたは議論の司会者です。共有コンテキストを見て、"
        "pro と con のどちらが次に発言すべきかを選んでください。"
    ),
)
```

### Group Chat ワークフローの構築

```python
from agent_framework.orchestrations import GroupChatBuilder

workflow = (
    GroupChatBuilder(participants=[pro, con], orchestrator_agent=moderator)
    .with_max_rounds(3)
    .build()
)
```

`participants` が討議する Agent、`orchestrator_agent` が発話者を選ぶ司会役です。
最大回数は `with_max_rounds` で制限します。発話者選択を明示的に制御したい場合は、
`selection_func` などの選択ロジックを使う設計も検討できます。

### 実行と結果の取得

```python
result = await workflow.run("週4日勤務は導入すべきか？")

messages = []
for event in result:
    # WorkflowRunResult はイベントのリストとして扱い、
    # pro / con の各ターンを順番に取り出して UI 用に整形する。
    response = getattr(event, "data", None)
    for msg in getattr(response, "messages", []) or []:
        author = getattr(msg, "author_name", None)
        if author in {"pro", "con"}:
            messages.append({"author": author, "text": msg.text})
```

本デモの HTTP レスポンスは、討議ターンのみを次の形に整形します。

```json
{
  "pattern": "group_chat",
  "agents": ["pro", "con"],
  "moderator": "moderator",
  "maxRounds": 3,
  "prompt": "週4日勤務は導入すべきか？",
  "messages": [
    { "author": "pro", "text": "賛成です。..." },
    { "author": "con", "text": "反対です。..." }
  ]
}
```

---

## 5. 本リポジトリでの位置づけ

- 配置: `server/microsoftagentframework/patterns/group_chat/`
- ランタイム: **Python の Azure Functions（別 Function App、port 7072）**。
  Node 版の Durable Functions（`server/durablefunctions/`, :7071）とは独立して起動。
- 公開: HTTP トリガー `POST /api/groupchat` で入力を受け取り、
  Group Chat ワークフローを実行して討議ログを返す。
- フロント: `app/web` から Next.js API ルート
  `POST /api/agent/group-chat` 経由で Python Function App（`AGENT_BASE_URL`）を呼び出す。
- UI: `messages` の順序を保ち、`pro` を左、`con` を右に並べてチャット風に表示する。

---

## 6. Concurrent との違い

Concurrent は「同じ入力に対して独立に並列回答し、最後に集約する」パターンです。
Group Chat は「共有会話の中で互いの発言を見ながら順に発話する」ため、反論や再検証に向きます。

| 観点 | Concurrent（並列） | Group Chat（共有討議） |
|------|--------------------|------------------------|
| 実行 | **並列**に全 Agent が回答 | moderator が次の発話者を選びながら進行 |
| 各 Agent の入力 | 全員が同じ初期入力 | **共有会話コンテキスト**（過去発言を含む） |
| Agent 間の関係 | 基本的に独立 | 互いの発言に反応・反論できる |
| 出力 | 参加者ごとの回答を集約 | 時系列の発話ターン |
| 所要時間 | 並列なので短くしやすい | ラウンド数に応じて伸びる |
| 例 | 技術・ビジネス・リスクを同時分析 | 賛成派と反対派が議論して論点を深める |

---

## 7. Sequential との違い

Sequential は「固定順のパイプライン」です。Group Chat は固定順ではなく、
moderator / selection logic が文脈に応じて次の発話者を選びます。

| 観点 | Sequential（順次） | Group Chat（共有討議） |
|------|---------------------|------------------------|
| 実行順 | **固定順**（A → B → C） | 司会役が文脈に応じて選択 |
| 主目的 | 段階的な変換・積み上げ | 議論・反論・合意形成 |
| コンテキスト | 前段の会話を後段へ渡す | 全参加者が共有会話を見る |
| 終端 | 末尾 Agent の回答が中心 | 各ターンの発言履歴が中心 |
| 例 | 要約 → レビュー → 最終回答 | pro / con が論点を往復させる |

---

## 8. ベストプラクティス

- [ ] 参加 Agent の立場を `instructions` で明確に分ける（例: 賛成派 / 反対派 / 専門家）。
- [ ] moderator の役割を具体化し、「重複を避ける」「争点を深める」など進行方針を与える。
- [ ] `with_max_rounds` で上限を設け、コスト・レイテンシ・発散を抑える。
- [ ] 合意形成が目的なら、最後にまとめ役 Agent や終了条件を追加する。
- [ ] UI では発話順を保ち、発話者名・立場・色を明確に分ける。
- [ ] 独立回答で十分なら Concurrent を選び、不要な会話ラウンドを避ける。
- [ ] 資格情報は環境変数 / Managed Identity で管理（平文で置かない）。

---

## 9. 参考リンク

- [Group chat orchestration（公式・Python/.NET）](https://learn.microsoft.com/agent-framework/workflows/orchestrations/group-chat?pivots=programming-language-python)
- [Agent Framework ドキュメント](https://learn.microsoft.com/agent-framework/)
- [microsoft/agent-framework（GitHub）](https://github.com/microsoft/agent-framework)

## 関連（本リポジトリ）

- Sequential の解説 → [`./MAF-sequential.md`](./MAF-sequential.md)
- Concurrent の解説 → [`./MAF-concurrent.md`](./MAF-concurrent.md)
- プロジェクト全体 → [`../README.md`](../README.md)
