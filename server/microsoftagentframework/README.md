# server/microsoftagentframework/

Microsoft Agent Framework の検証用 **Python Azure Functions アプリ**。

> ⚠️ 実装はこれから。現時点ではディレクトリと Functions アプリの雛形のみ。

`server/durablefunctions/`（Node/TypeScript）とは **別の Function App**（別ランタイム・別ポート）
として動かし、フロント（`app/web`）から呼び分けます。1つの Function App は1言語のみのため、
Python の Agent Framework はここに独立して実装します。

| ディレクトリ | 技術 | 言語 | 内容 |
|--------------|------|------|------|
| `../durablefunctions/` | Azure Durable Functions | TypeScript | 6パターン実装済み |
| `./`（ここ） | Microsoft Agent Framework | **Python** | 5パターンを実装予定 |

---

## 実装する5パターン

| # | パターン | 何をするか | 向くケース |
|---|----------|-----------|-----------|
| 1 | **Sequential** | Agent を固定順で実行する | 要約 → レビュー → 最終回答 |
| 2 | **Concurrent** | 複数 Agent を並列実行し、結果を統合する | 動画・論文・ガイドラインを同時調査 |
| 3 | **Handoff** | 文脈に応じて専門 Agent へ制御を渡す | 一般相談 → 肝胆膵専門 Agent |
| 4 | **Group Chat** | 複数 Agent が共有コンテキスト上で議論する | 多職種レビュー、反論・再検証 |
| 5 | **Magentic** | Manager Agent が次に動かす Agent を動的に決める | 手順が固定できない複雑な調査 |

---

## ディレクトリ構成

```
microsoftagentframework/
├── function_app.py            # エントリポイント（各パターンのBlueprintを登録）
├── host.json
├── requirements.txt           # azure-functions, agent-framework（実装時に固定）
├── local.settings.json.example
├── .funcignore / .gitignore
└── patterns/
    ├── sequential/            # ① 固定順で実行
    ├── concurrent/            # ② 並列実行して統合
    ├── handoff/               # ③ 専門Agentへ制御を渡す
    ├── group_chat/            # ④ 共有コンテキストで議論
    └── magentic/              # ⑤ Managerが動的に指揮
```

各パターンは `patterns/<name>/` に Blueprint（HTTPトリガー）として実装し、
`function_app.py` で `app.register_blueprint(...)` する想定。

---

## 起動（実装後）

Node 版（`../durablefunctions/`）が 7071 を使うため、こちらは**別ポート**で起動する。

```bash
cd server/microsoftagentframework
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp local.settings.json.example local.settings.json

# Node版と競合しないよう別ポートで起動
func start --port 7072
```

---

## 今後の想定

- **各パターン**を HTTP エンドポイントとして公開（例: `POST /api/sequential`）
- **フロント連携**: `app/web` のサイドメニュー「Microsoft Agent Framework」から、
  Next.js の API ルート経由で本サービス（`AGENT_BASE_URL`、例 `http://localhost:7072`）を叩く
- **LLM 接続**: Azure OpenAI / OpenAI などのキーは App Settings / 環境変数で管理（tfvars 等に平文で置かない）
