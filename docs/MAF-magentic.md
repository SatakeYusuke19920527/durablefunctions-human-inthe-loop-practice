# Microsoft Agent Framework — Magentic 完全ガイド

このドキュメントは、**Microsoft Agent Framework（MAF）** の
**Magentic（動的指揮）オーケストレーション**パターンを網羅的に解説します。
コード例は **Python**（`agent-framework`）で、本リポジトリの
`server/microsoftagentframework/patterns/magentic/` の実装に対応します。

> ℹ️ Magentic は、Microsoft Research の **Magentic-One** に由来する、
> **Manager（指揮役）が次に動かす Agent を動的に決める**マルチエージェント・オーケストレーションです。

---

## 目次

1. [Magentic とは](#1-magentic-とは)
2. [仕組み（Manager と Task Ledger）](#2-仕組みmanager-と-task-ledger)
3. [使いどころ（ユースケース）](#3-使いどころユースケース)
4. [実装（Python / Agent Framework）](#4-実装python--agent-framework)
5. [制御オプション](#5-制御オプション)
6. [他パターンとの違い](#6-他パターンとの違い)
7. [本リポジトリでの位置づけ](#7-本リポジトリでの位置づけ)
8. [ベストプラクティス](#8-ベストプラクティス)
9. [参考リンク](#9-参考リンク)

---

## 1. Magentic とは

**Magentic オーケストレーション**は、**Manager Agent（指揮役）**が状況を見ながら
**次に動かす Agent を動的に選び**、タスクを進めていくパターンです。

```
                 ┌───────────────────────────┐
[タスク] ───────▶│  Manager（指揮役）          │
                 │  ・タスクを分解し計画を立てる │
                 │  ・進捗を見て次の Agent を選ぶ│
                 └──────┬─────────┬────────────┘
                        │動的指名   │動的指名
                        ▼          ▼
                   researcher    writer   ...（必要な Agent を都度呼ぶ）
                        │          │
                        └────┬─────┘
                             ▼
                     [Manager が最終成果をまとめる]
```

Sequential（固定順）や Concurrent（一斉並列）と違い、**実行順序が事前に決まっておらず**、
Manager がその場の状況に応じて「誰を・何回・どの順で動かすか」を判断します。

---

## 2. 仕組み（Manager と Task Ledger）

- **Manager（Orchestrator）**: タスクを分解し、計画（**Task Ledger**）を立て、
  進捗（**Progress Ledger**）を見ながら次に動かす Agent を選ぶ。
- **参加 Agent（participants）**: それぞれ専門を持つ（例: 調査・文章化・計算）。
  Manager から呼ばれて部分タスクを実行する。
- **反復**: 「計画 → 実行 → 進捗評価 → 次の一手」を繰り返し、目標達成または上限（round/stall）で終了。
- **最終出力**: Manager が全体を統合した最終成果を返す。

停滞（stall）やループを防ぐため、`max_round_count` / `max_stall_count` / `max_reset_count`
などの上限が用意されています。

---

## 3. 使いどころ（ユースケース）

「**手順を事前に固定できない、複雑で探索的なタスク**」に向きます。

- **複雑な調査・分析**: 何を調べるべきかが進めながら分かるリサーチ
- **オープンエンドな問題解決**: 状況に応じてツール/専門家を使い分ける
- **マルチステップの自動化**: 調査 → 計算 → 文章化 など、手順が入力次第で変わる作業
- **エージェント型アシスタント**: ユーザーの依頼に応じて動的にサブタスクを組み立てる
- **リサーチ&ライティング**: 調べて、検証して、まとめる、を状況に応じて反復

> **向かないケース**: 手順が決まっているなら Sequential、独立処理の一斉並列なら
> Concurrent、担当の切り替えだけなら Handoff、議論・合意形成なら Group Chat が
> シンプルで確実です。Magentic は最も柔軟な反面、コスト・レイテンシが大きくなりがちです。

---

## 4. 実装（Python / Agent Framework）

本リポジトリでは、Manager が researcher（調査）と writer（文章化）を動的に使い分けます。

```
magentic/
└── __init__.py   # HTTP: POST /api/magentic、MagenticBuilder で動的オーケストレーション
```

### クライアントと Agent の定義

```python
from agent_framework.openai import OpenAIChatClient

client = OpenAIChatClient(
    azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
    api_key=os.environ["AZURE_OPENAI_API_KEY"],
    model=os.environ["AZURE_OPENAI_CHAT_DEPLOYMENT_NAME"],  # デプロイ名
    api_version=os.environ.get("AZURE_OPENAI_API_VERSION", "preview"),
)

manager = client.as_agent(
    name="manager",
    instructions="タスクを分解し、researcher と writer を使い分けて最終成果をまとめて。",
)
researcher = client.as_agent(name="researcher", instructions="調査担当。事実を簡潔に集める。")
writer = client.as_agent(name="writer", instructions="文章担当。分かりやすくまとめる。")
```

### Magentic ワークフローの構築と実行

```python
from agent_framework.orchestrations import MagenticBuilder

workflow = MagenticBuilder(
    participants=[researcher, writer],
    manager_agent=manager,     # 指揮役（動的に次の Agent を決定）
    max_round_count=6,         # 反復の上限（暴走防止）
).build()

result = await workflow.run("電気自動車の普及の利点を3つ、簡潔にまとめて。")

# 最終成果（Manager が統合した回答）
outputs = result.get_outputs()
for msg in outputs[0].messages:
    print(f"[{msg.author_name}] {msg.text}")
```

出力イメージ（Manager が最終成果を返す）:

```text
[manager]
- 温室効果ガスの削減：走行時のCO2排出を低減。
- 運用・維持費の低下：燃料費や整備費が下がり総保有コストが低減。
- 都市部の大気質改善：無排気でNOx等を削減。
```

> `OpenAIChatClient(azure_endpoint=...)` と `api_version="preview"`（v1 API サーフェス）は
> 他パターンと共通。詳細は [`./MAF-sequential.md`](./MAF-sequential.md) 参照。

---

## 5. 制御オプション

`MagenticBuilder` には暴走・停滞を防ぐための制御が用意されています。

| オプション | 役割 |
|-----------|------|
| `max_round_count` | 反復（ラウンド）の上限 |
| `max_stall_count` | 進捗が出ないラウンドが続いたときの上限 |
| `max_reset_count` | 計画のやり直し回数の上限 |
| `enable_plan_review` / `with_plan_review` | 計画を人間がレビュー・承認できるようにする（HITL） |
| `with_checkpointing` | チェックポイントで途中状態を保存・再開 |

`enable_plan_review` を使うと、Manager の計画を人間が確認してから実行に移せます
（Human-in-the-loop と組み合わせた運用）。

---

## 6. 他パターンとの違い

| パターン | 実行順序 | 誰が決める | 使いどころ |
|----------|----------|-----------|-----------|
| Sequential | 固定・直列 | 事前に定義 | 順序が決まった処理 |
| Concurrent | 一斉並列 | 事前に定義 | 独立処理を同時実行 |
| Handoff | 分岐 | 各 Agent が引き継ぐ | 担当のルーティング |
| Group Chat | 会話ターン | Orchestrator/選択関数 | 議論・合意形成 |
| **Magentic** | **動的・反復** | **Manager が都度決定** | 手順が固定できない複雑な調査 |

Magentic は最も**自律的・柔軟**ですが、その分**コスト・実行時間・非決定性**が大きくなります。
まずは固定的なパターンで足りないか検討し、本当に必要なときに使うのが定石です。

---

## 7. 本リポジトリでの位置づけ

- 配置: `server/microsoftagentframework/patterns/magentic/`
- ランタイム: **Python の Azure Functions（別 Function App、ポート 7072）**。
  Node 版の Durable Functions（`server/durablefunctions/`, :7071）とは独立起動。
- 公開: HTTP トリガー `POST /api/magentic`（body `{ "prompt": "..." }`）。
- フロント: `app/web` のサイドメニュー「Microsoft Agent Framework」→
  Next.js の API ルート（`/api/agent/magentic`）経由で本サービス（`AGENT_BASE_URL`）を呼び出す。
- LLM: Azure OpenAI（gpt-5-mini）。エンドポイント・キーは環境変数で管理。

---

## 8. ベストプラクティス

- [ ] まず固定パターン（Sequential/Concurrent/Handoff/Group Chat）で足りないか検討する。
- [ ] `max_round_count` / `max_stall_count` などで**暴走・無限ループを必ず抑止**する。
- [ ] 各 participant の役割（`instructions`）を明確にし、Manager が使い分けやすくする。
- [ ] 重要な計画は `enable_plan_review`（HITL）で人間が確認してから実行する。
- [ ] 長時間・高コストになりやすいので、監視・タイムアウト・コスト上限を設ける。
- [ ] 資格情報は環境変数 / Managed Identity で管理（平文で置かない）。

---

## 9. 参考リンク

- [Magentic orchestration（公式・Python/.NET）](https://learn.microsoft.com/agent-framework/workflows/orchestrations/magentic?pivots=programming-language-python)
- [Agent Framework ドキュメント](https://learn.microsoft.com/agent-framework/)
- [microsoft/agent-framework（GitHub）](https://github.com/microsoft/agent-framework)

## 関連（本リポジトリ）

- Sequential の解説 → [`./MAF-sequential.md`](./MAF-sequential.md)
- Concurrent の解説 → [`./MAF-concurrent.md`](./MAF-concurrent.md)
- Handoff の解説 → [`./MAF-handoff.md`](./MAF-handoff.md)
- Group Chat の解説 → [`./MAF-group-chat.md`](./MAF-group-chat.md)
- プロジェクト全体 → [`../README.md`](../README.md)
