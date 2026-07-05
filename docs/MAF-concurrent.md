# Microsoft Agent Framework — Concurrent 完全ガイド

このドキュメントは、**Microsoft Agent Framework（MAF）** の
**Concurrent（並列 & 集約）オーケストレーション**パターンを網羅的に解説します。
コード例は **Python**（`agent-framework`）で、本リポジトリの
`server/microsoftagentframework/patterns/concurrent/` の実装に対応します。

---

## 目次

1. [Concurrent とは](#1-concurrent-とは)
2. [仕組み（fan-out / fan-in と集約）](#2-仕組みfan-out--fan-in-と集約)
3. [使いどころ（ユースケース）](#3-使いどころユースケース)
4. [実装（Python / Agent Framework）](#4-実装python--agent-framework)
5. [カスタム集約（Custom Aggregator）](#5-カスタム集約custom-aggregator)
6. [Sequential との違い](#6-sequential-との違い)
7. [Durable Functions の Fan-out/Fan-in との違い](#7-durable-functions-の-fan-outfan-in-との違い)
8. [ベストプラクティス](#8-ベストプラクティス)
9. [参考リンク](#9-参考リンク)

---

## 1. Concurrent とは

**Concurrent オーケストレーション**は、複数の Agent を**同じ入力に対して並列に実行**し、
その結果を**1つに集約**するパターンです。

```
             ┌─▶ Agent A ─┐
[入力] ─────┼─▶ Agent B ─┼─▶ 集約（aggregator）─▶ [まとめた結果]
             └─▶ Agent C ─┘
          （同じ入力を同時に処理）
```

各 Agent は互いに独立して動くため、**異なる観点・専門性で同時に分析**するのに向きます。
例：技術・ビジネス・リスクの3観点で同時にレビューする、複数ソースを並行調査する、など。

---

## 2. 仕組み（fan-out / fan-in と集約）

- **fan-out**: `participants` に渡した全 Agent を**並列に起動**し、同じ入力を配る。
- **fan-in（集約）**: 全 Agent の完了を待ち、結果をまとめる。
  - **既定の集約**: 1つの `AgentResponse` に「**参加者ごとに1つの assistant メッセージ**」が並ぶ。
  - `get_outputs()` の先頭要素がその集約済み `AgentResponse`。
- 直列（Sequential）と違い、各 Agent は**前段の出力に依存しない**（同じ入力を見る）。

---

## 3. 使いどころ（ユースケース）

「**独立した複数の視点/処理を同時に走らせて、まとめて受け取りたい**」とき。

- **多観点レビュー**: 技術・ビジネス・リスク・法務など複数専門家で同時に評価
- **同時調査**: 動画・論文・ガイドラインなど複数ソースを並行して調べる
- **アンサンブル**: 複数の異なるプロンプト/モデルに同じ問いを投げて結果を比較・統合
- **ブレインストーミング**: 複数の視点でアイデアを同時に出す
- **多言語生成**: 同じ内容を複数言語で並行生成

> **向かないケース**: 前の結果を次に使う（順序依存）なら Sequential、
> 文脈で担当を切り替えるなら Handoff、議論・合意形成なら Group Chat が適切。

---

## 4. 実装（Python / Agent Framework）

本リポジトリでは、技術・ビジネス・リスクの3観点で並列分析します。

```
concurrent/
└── __init__.py   # HTTP: POST /api/concurrent、ConcurrentBuilder で並列実行
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

tech = client.as_agent(name="tech", instructions="技術の専門家として要点を述べて")
business = client.as_agent(name="business", instructions="ビジネス/コストの観点で述べて")
risk = client.as_agent(name="risk", instructions="リスク/注意点の観点で述べて")
```

### 並列ワークフローの構築と実行

```python
from agent_framework.orchestrations import ConcurrentBuilder

# fan-out（並列実行）→ fan-in（集約）
workflow = ConcurrentBuilder(participants=[tech, business, risk]).build()
result = await workflow.run("社内問い合わせ対応にAIチャットボットを導入すべきか？")

# 既定の集約: 1つの AgentResponse に各 Agent の応答が並ぶ
outputs = result.get_outputs()
aggregated = outputs[0]
for msg in aggregated.messages:
    print(f"[{msg.author_name}] {msg.text}")
```

出力イメージ（各 Agent が並列に回答）:

```text
[tech]     技術的には、データ管理・品質・運用設計が重要…
[business] コスト観点では、初期費用と運用費のバランスが…
[risk]     情報漏えい・誤回答のリスクに注意し、対策として…
```

> `OpenAIChatClient(azure_endpoint=...)` と `api_version="preview"`（v1 API サーフェス）は
> Sequential と共通のポイント。詳細は [`./MAF-sequential.md`](./MAF-sequential.md) 参照。

---

## 5. カスタム集約（Custom Aggregator）

既定は「参加者ごとに1メッセージ」ですが、`with_aggregator` で**独自の集約**にできます。
たとえば「全回答を1つに要約する」「投票で1つを選ぶ」「JSON にまとめる」など。

```python
workflow = (
    ConcurrentBuilder(participants=[tech, business, risk])
    .with_aggregator(my_aggregator)  # 集約ロジックを差し替え
    .build()
)
```

集約用に「まとめ役の Agent」を1体用意し、全回答を渡して最終要約を作る、という構成もよく使われます。

---

## 6. Sequential との違い

| 観点 | Sequential（順次） | Concurrent（並列） |
|------|---------------------|---------------------|
| 実行 | 直列（順番に） | **並列（同時に）** |
| 各 Agent の入力 | 前段の会話（積み上がる） | **全員が同じ入力** |
| 依存関係 | 前段の結果に依存 | 各自独立 |
| 所要時間（N体×t秒） | 約 N×t 秒 | 約 t 秒 |
| 出力 | 末尾 Agent の応答 | 全 Agent の応答を集約 |
| 例 | 要約→レビュー→最終回答 | 技術・ビジネス・リスクを同時分析 |

---

## 7. Durable Functions の Fan-out/Fan-in との違い

「並列実行して集約する」構造は同じですが、対象と抽象度が異なります。

| 観点 | Durable Functions: Fan-out/Fan-in | Agent Framework: Concurrent |
|------|-----------------------------------|-----------------------------|
| 並列単位 | Activity（任意のコード） | **Agent（LLM）** |
| 集約 | `Task.all` の結果を自前で集計 | **aggregator が AgentResponse に集約** |
| 主目的 | 決定的な並列処理 | **複数視点の LLM 推論を統合** |
| 状態の永続化 | ストレージに永続化（耐障害） | ワークフロー実行（永続化は別途） |

- **確定的な大量並列処理** → Fan-out/Fan-in
- **複数の視点で並列に考えさせて統合** → Concurrent

---

## 8. ベストプラクティス

- [ ] 各 Agent の役割（`instructions`）を**明確に分離**し、観点が重複しないようにする。
- [ ] 独立して並列にできる処理だけを Concurrent にする（順序依存なら Sequential）。
- [ ] 結果を1つにまとめたいときは **`with_aggregator`** や「まとめ役 Agent」を使う。
- [ ] 参加 Agent が多いとコスト・レイテンシが増えるため数を適切に絞る。
- [ ] 資格情報は環境変数 / Managed Identity で管理（平文で置かない）。
- [ ] 出力は「参加者ごとに1メッセージ」が既定。UI では Agent 名で区別して表示する。

---

## 9. 参考リンク

- [Concurrent orchestration（公式・Python/.NET）](https://learn.microsoft.com/agent-framework/workflows/orchestrations/concurrent?pivots=programming-language-python)
- [Agent Framework ドキュメント](https://learn.microsoft.com/agent-framework/)
- [microsoft/agent-framework（GitHub）](https://github.com/microsoft/agent-framework)

## 関連（本リポジトリ）

- Sequential の解説 → [`./MAF-sequential.md`](./MAF-sequential.md)
- 対になる Durable Functions パターン → [`./DF-fanout-fanin.md`](./DF-fanout-fanin.md)
- プロジェクト全体 → [`../README.md`](../README.md)
