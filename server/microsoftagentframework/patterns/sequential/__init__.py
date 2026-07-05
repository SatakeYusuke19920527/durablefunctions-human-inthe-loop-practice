"""
Sequential パターン（Microsoft Agent Framework）。

Agent を固定順で実行するパイプライン:
    要約(summarizer) → レビュー(reviewer) → 最終回答(finalizer)

HTTP トリガー:
    POST /api/sequential   body: { "prompt": "..." }
    → 各段の Agent が前段の出力を踏まえて処理し、最終回答を返す。

必要な環境変数（local.settings.json / App Settings）:
    AZURE_OPENAI_ENDPOINT                 例: https://<name>.openai.azure.com
    AZURE_OPENAI_CHAT_DEPLOYMENT_NAME     例: gpt-4o-mini（デプロイ名）
    AZURE_OPENAI_API_KEY                  APIキー
    AZURE_OPENAI_API_VERSION              任意（既定: preview / v1 API サーフェス）
"""

import json
import logging
import os

import azure.functions as func

bp = func.Blueprint()

logger = logging.getLogger(__name__)

DEFAULT_API_VERSION = "preview"


def _missing_config() -> list[str]:
    """未設定の必須環境変数を返す。"""
    required = [
        "AZURE_OPENAI_ENDPOINT",
        "AZURE_OPENAI_CHAT_DEPLOYMENT_NAME",
        "AZURE_OPENAI_API_KEY",
    ]
    return [name for name in required if not os.environ.get(name)]


async def _run_sequential(prompt: str) -> dict:
    """要約→レビュー→最終回答 の Sequential ワークフローを実行する。"""
    # 重い依存はリクエスト時に import（未インストール環境での読み込み失敗を避ける）
    from agent_framework.openai import OpenAIChatClient
    from agent_framework.orchestrations import SequentialBuilder

    # OpenAIChatClient は azure_endpoint を渡すと Azure OpenAI を利用できる
    client = OpenAIChatClient(
        azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
        api_key=os.environ["AZURE_OPENAI_API_KEY"],
        model=os.environ["AZURE_OPENAI_CHAT_DEPLOYMENT_NAME"],
        api_version=os.environ.get("AZURE_OPENAI_API_VERSION", DEFAULT_API_VERSION),
    )

    summarizer = client.as_agent(
        name="summarizer",
        instructions=(
            "あなたは要約担当です。ユーザーの入力を、要点を押さえて簡潔な日本語で要約してください。"
        ),
    )
    reviewer = client.as_agent(
        name="reviewer",
        instructions=(
            "あなたはレビュー担当です。直前の要約に対して、"
            "不足・誤り・改善点を3点以内で簡潔に指摘してください。"
        ),
    )
    finalizer = client.as_agent(
        name="finalizer",
        instructions=(
            "あなたは最終回答担当です。これまでの要約とレビューを踏まえ、"
            "読み手にとって分かりやすい最終回答を日本語でまとめてください。"
        ),
    )

    # 固定順のパイプラインを構築して実行
    workflow = SequentialBuilder(
        participants=[summarizer, reviewer, finalizer]
    ).build()
    result = await workflow.run(prompt)
    outputs = result.get_outputs()

    messages = []
    if outputs:
        final = outputs[0]  # AgentResponse（末尾 Agent の応答）
        for msg in final.messages:
            messages.append(
                {
                    "author": getattr(msg, "author_name", None) or "assistant",
                    "text": msg.text,
                }
            )

    return {
        "pattern": "sequential",
        "pipeline": ["summarizer", "reviewer", "finalizer"],
        "prompt": prompt,
        "messages": messages,
        "final": messages[-1]["text"] if messages else "",
    }


@bp.route(route="sequential", methods=["POST"])
async def sequential(req: func.HttpRequest) -> func.HttpResponse:
    # 入力の取得
    try:
        body = req.get_json()
    except ValueError:
        body = {}
    prompt = (body or {}).get("prompt")
    if not prompt or not str(prompt).strip():
        return func.HttpResponse(
            json.dumps({"error": "prompt is required"}, ensure_ascii=False),
            status_code=400,
            mimetype="application/json",
        )

    # 設定チェック
    missing = _missing_config()
    if missing:
        return func.HttpResponse(
            json.dumps(
                {"error": f"missing environment variables: {', '.join(missing)}"},
                ensure_ascii=False,
            ),
            status_code=500,
            mimetype="application/json",
        )

    # 実行
    try:
        result = await _run_sequential(str(prompt))
    except Exception as e:  # noqa: BLE001
        logger.exception("sequential workflow failed")
        return func.HttpResponse(
            json.dumps({"error": str(e)}, ensure_ascii=False),
            status_code=502,
            mimetype="application/json",
        )

    return func.HttpResponse(
        json.dumps(result, ensure_ascii=False),
        status_code=200,
        mimetype="application/json",
    )
