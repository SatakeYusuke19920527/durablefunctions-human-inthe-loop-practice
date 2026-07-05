# server/microsoftagentframework/

Microsoft Agent Framework の検証用ディレクトリ（**Python** で実装）。

> ⚠️ 実装はこれから。現時点ではディレクトリと方針のみ。

このリポジトリでは、Azure のオーケストレーション技術を2系統で比較・検証します。

| ディレクトリ | 技術 | 言語 | 内容 |
|--------------|------|------|------|
| `../durablefunctions/` | Azure Durable Functions | TypeScript | 6つの代表パターンを実装済み |
| `./`（ここ） | Microsoft Agent Framework | **Python** | 5つのエージェントパターンを実装予定 |

> **なぜ Python?** Microsoft Agent Framework 本体（AutoGen + Semantic Kernel 統合SDK）は
> 現状 **Python / .NET** のみ対応で、TypeScript 版はまだありません。本体を検証するため Python を採用します。
> Durable Functions（TS）とは**別ランタイムの独立サービス**として動かし、フロントから呼び分けます。

---

## 実装する5パターン

| # | パターン | 実装イメージ | 向く用途 |
|---|----------|--------------|----------|
| 1 | **Sequential** | Agent を固定順で実行 | 要約 → レビュー → 整形 |
| 2 | **Concurrent** | 複数 Agent を並列実行して結果統合 | 論文検索・動画解析・ガイドライン検索を同時実行 |
| 3 | **Handoff** | 文脈に応じて Agent 間で担当を引き継ぐ | 一般質問 → 肝胆膵専門 Agent |
| 4 | **Group Chat** | 複数 Agent が共有会話で議論 | 複数専門家視点での検討・反論・合意形成 |
| 5 | **Magentic** | Manager Agent が次に動く Agent を動的に決定 | 複雑で手順が固定できない調査・分析 |

---

## ディレクトリ構成

```
microsoftagentframework/
├── README.md
└── patterns/
    ├── sequential/     # ① 固定順で実行
    ├── concurrent/     # ② 並列実行して統合
    ├── handoff/        # ③ 担当を引き継ぐ
    ├── group_chat/     # ④ 共有会話で議論
    └── magentic/       # ⑤ Manager が動的に指揮
```

（Python モジュールとして扱いやすいよう snake_case で命名。`group_chat` は「Group Chat」パターンに対応。）

---

## 今後の想定（実装開始時に確定）

- **ランタイム**: Python（Microsoft Agent Framework）
- **公開方法**: 各パターンを HTTP エンドポイントとして起動（別ポート、例: `:8000`）し、
  フロント（`app/web`）のサイドメニュー「Microsoft Agent Framework」から呼び出す
- **依存管理**: `pyproject.toml` / `requirements.txt`（実装時に追加）
- **フロント連携**: Next.js の API ルートが Agent サービス（`AGENT_BASE_URL`）へプロキシ
