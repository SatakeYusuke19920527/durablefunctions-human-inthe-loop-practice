# Microsoft Agent Framework — Handoff 完全ガイド

このドキュメントは、**Microsoft Agent Framework（MAF）** の
**Handoff（文脈に応じた担当切り替え）オーケストレーション**パターンを網羅的に解説します。
コード例は **Python**（`agent-framework`）で、本リポジトリの
`server/microsoftagentframework/patterns/handoff/` の実装に対応します。

---

## 目次

1. [Handoff とは](#1-handoff-とは)
2. [仕組み（ルーティング・ツール呼び出し・終了）](#2-仕組みルーティングツール呼び出し終了)
3. [使いどころ（ユースケース）](#3-使いどころユースケース)
4. [実装（Python / Agent Framework）](#4-実装python--agent-framework)
5. [本リポジトリでの位置づけ](#5-本リポジトリでの位置づけ)
6. [Sequential / Concurrent との違い](#6-sequential--concurrent-との違い)
7. [ベストプラクティス](#7-ベストプラクティス)
8. [参考リンク](#8-参考リンク)

---

## 1. Handoff とは

**Handoff オーケストレーション**は、最初に受け付ける **triage（振り分け）Agent** が、
ユーザーの内容を見て **適切な専門 Agent に制御を渡す**パターンです。

```text
                         ┌─▶ billing（請求・支払い）─▶ [回答]
[入力] ─▶ triage（分類）─┤
                         └─▶ tech（技術・不具合）───▶ [回答]
```

本デモでは、ユーザーの問い合わせを triage Agent が読み取り、
請求・支払い系なら `billing`、技術・不具合系なら `tech` に handoff します。
最終回答は、handoff された専門 Agent が生成します。

> **ポイント**: Handoff は「全部の Agent を実行する」パターンではありません。
> 文脈に応じて **担当 Agent を選び、会話の主導権を移す**ためのパターンです。

---

## 2. 仕組み（ルーティング・ツール呼び出し・終了）

### 文脈ベースのルーティング

- 最初の入力は `with_start_agent(triage)` で指定した triage Agent が受け取る。
- triage Agent は、問い合わせ文の意味を見て「どの専門 Agent が対応すべきか」を判断する。
- `add_handoff(triage, [billing, tech])` により、triage から `billing` / `tech` へ制御を渡せるようにする。

### handoff はツール呼び出しとして実現される

Handoff では、Agent 間の切り替えが内部的に **handoff 用のツール呼び出し**として扱われます。
triage Agent が「請求の話なので billing へ渡す」と判断すると、handoff ツールを呼び、
以降の会話制御を `billing` Agent が引き継ぎます。

### コンテキスト同期

Handoff では各 Agent が独立したセッションを持つため、Agent Framework は参加 Agent 間で
ユーザー入力や Agent 応答を同期し、handoff 先がそれまでの文脈を読めるようにします。
そのため、本デモでは各 Agent を `require_per_service_call_history_persistence=True` 付きで作成します。

### 終了と最終出力

- 専門 Agent が回答を生成し、それ以上 handoff しない場合、その応答が最終出力になる。
- 実装では `events.get_outputs()` から `AgentResponse` を取得し、`messages` と `final` として HTTP 応答に整形する。
- インタラクティブな Handoff では追加のユーザー入力待ちになる場合もありますが、本デモは単一 HTTP 呼び出しで専門 Agent の回答を返す構成です。

---

## 3. 使いどころ（ユースケース）

「**最初に分類し、最適な担当者へ渡す**」業務に向きます。

- **一般相談 → 専門 Agent**: 受付 Agent が内容を分類し、法務・人事・IT などへ振り分ける。
- **カスタマーサポートのルーティング**: 請求、返品、配送、技術サポートなどに自動振り分けする。
- **社内ヘルプデスク**: アカウント、端末、ネットワーク、申請手続きなど担当チームを切り替える。
- **専門家システム**: 医療、保険、税務など、領域別の専門 Agent が回答する。
- **一次切り分け**: まず triage がカテゴリを決め、以降は専門 Agent が責任を持つ。

> **向かないケース**: 固定順に処理するなら Sequential、複数観点を同時に比較するなら Concurrent、
> 複数 Agent に議論させるなら Group Chat が適切です。

---

## 4. 実装（Python / Agent Framework）

本リポジトリでは、請求・支払いと技術・不具合の2系統へ振り分けます。

```text
handoff/
└── __init__.py   # HTTP: POST /api/handoff、HandoffBuilder で triage → specialist
```

### 4.1 Azure OpenAI クライアントの用意

バックエンドモデルは Azure OpenAI の `gpt-5-mini` デプロイを使います。
`api_version="preview"` は Agent Framework の OpenAI v1 API サーフェスを使うための指定です。

```python
import os

from agent_framework.openai import OpenAIChatClient

client = OpenAIChatClient(
    azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
    api_key=os.environ["AZURE_OPENAI_API_KEY"],
    model=os.environ.get("AZURE_OPENAI_CHAT_DEPLOYMENT_NAME", "gpt-5-mini"),
    api_version="preview",
)
```

### 4.2 Agent の定義

Handoff では会話履歴の同期が重要です。本デモの Agent はすべて
`require_per_service_call_history_persistence=True` を付けて作成します。

```python
triage = client.as_agent(
    name="triage",
    instructions=(
        "あなたは一次受付のトリアージ Agent です。"
        "請求・支払いに関する相談は billing へ、"
        "技術的な不具合や使い方の相談は tech へ handoff してください。"
    ),
    require_per_service_call_history_persistence=True,
)

billing = client.as_agent(
    name="billing",
    instructions=(
        "あなたは請求・支払いの専門 Agent です。"
        "請求書、支払い、返金、契約金額に関する問い合わせに簡潔に回答してください。"
    ),
    require_per_service_call_history_persistence=True,
)

tech = client.as_agent(
    name="tech",
    instructions=(
        "あなたは技術サポートの専門 Agent です。"
        "エラー、不具合、設定、トラブルシューティングに関する問い合わせに回答してください。"
    ),
    require_per_service_call_history_persistence=True,
)
```

### 4.3 Handoff ワークフローの構築

`HandoffBuilder` に参加 Agent を渡し、開始 Agent と handoff 可能な経路を定義します。

```python
from agent_framework.orchestrations import HandoffBuilder

workflow = (
    HandoffBuilder(participants=[triage, billing, tech])
    .with_start_agent(triage)
    .add_handoff(triage, [billing, tech])
    .build()
)
```

この構成では、最初の入力は必ず `triage` が受け取り、必要に応じて `billing` または `tech` に渡します。
専門 Agent からさらに別 Agent へ渡す経路は定義していないため、専門 Agent の応答が最終回答になります。

### 4.4 HTTP 応答の形

本デモの HTTP エンドポイントは、UI がルーティング結果を可視化しやすいように次の形で返します。

```json
{
  "pattern": "handoff",
  "start": "triage",
  "agents": ["triage", "billing", "tech"],
  "handedTo": "billing",
  "prompt": "請求書の金額が請求先と違います。どうすればいいですか？",
  "messages": [{ "author": "billing", "text": "..." }],
  "final": "..."
}
```

`handedTo` は `billing` / `tech` / `null` のいずれかです。`messages` には最終的に応答した Agent のメッセージを入れます。

---

## 5. 本リポジトリでの位置づけ

- 配置: `server/microsoftagentframework/patterns/handoff/`
- ランタイム: **Python の Azure Functions（別 Function App、ポート 7072）**。
  Node 版の Durable Functions（`server/durablefunctions/`, :7071）とは独立して起動。
- 公開: HTTP トリガー `POST /api/handoff` で `{ "prompt": "..." }` を受け取り、Handoff ワークフローを実行する。
- フロント: `app/web` から Next.js API ルート `/api/agent/handoff` 経由で Python Function App を呼び出す。
- 接続先: `AGENT_BASE_URL` があればそれを使い、未設定時は `http://localhost:7072` を使う。
- モデル: Azure OpenAI の `gpt-5-mini`（`OpenAIChatClient(azure_endpoint=..., api_version="preview")`）。

---

## 6. Sequential / Concurrent との違い

| 観点 | Sequential（順次） | Concurrent（並列） | Handoff（担当切り替え） |
|------|---------------------|---------------------|--------------------------|
| 実行形態 | 固定順に Agent を実行 | 全 Agent を同じ入力で並列実行 | **triage が専門 Agent を選ぶ** |
| Agent の入力 | 前段の会話・出力 | 全員が同じ入力 | handoff 先が同期済み文脈を引き継ぐ |
| 主な目的 | 多段処理・リファイン | 多観点分析・集約 | **問い合わせ分類と専門対応** |
| 実行される Agent | 原則すべて（順番どおり） | 原則すべて（同時） | 必要な Agent のみ |
| 出力 | 末尾 Agent の応答 | 集約済み応答 | handoff 先専門 Agent の応答 |
| 例 | 要約 → レビュー → 最終回答 | 技術・ビジネス・リスクを同時分析 | triage → billing / tech |

---

## 7. ベストプラクティス

- [ ] triage Agent の `instructions` に、分類基準と handoff 先を明確に書く。
- [ ] 専門 Agent の責務を重複させすぎない（billing と tech の境界を明確にする）。
- [ ] Handoff 先は必要最小限に絞り、誤ルーティング時のフォールバック方針を用意する。
- [ ] 参加 Agent は会話履歴を扱えるよう `require_per_service_call_history_persistence=True` を設定する。
- [ ] UI では `handedTo` と `messages[].author` を表示し、「誰が回答したか」を明示する。
- [ ] 機微な操作（返金処理、契約変更など）はツール承認（Human-in-the-loop）を組み合わせる。
- [ ] 資格情報は環境変数 / Managed Identity で管理し、平文でリポジトリに置かない。
- [ ] 全 Agent を実行したいだけなら Handoff ではなく Concurrent を使う。

---

## 8. 参考リンク

- [Handoff orchestration（公式・Python/.NET）](https://learn.microsoft.com/agent-framework/workflows/orchestrations/handoff?pivots=programming-language-python)
- [microsoft/agent-framework（GitHub）](https://github.com/microsoft/agent-framework)

## 関連（本リポジトリ）

- Sequential の解説 → [`./MAF-sequential.md`](./MAF-sequential.md)
- Concurrent の解説 → [`./MAF-concurrent.md`](./MAF-concurrent.md)
- プロジェクト全体 → [`../README.md`](../README.md)
