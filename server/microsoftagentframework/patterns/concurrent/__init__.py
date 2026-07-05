"""
Concurrent パターン（Microsoft Agent Framework）。

複数の Agent を「並列」に実行し、結果を集約する（fan-out / fan-in）:
    技術(tech) ┐
    ビジネス(business) ┼─並列実行→集約→ 各観点の回答をまとめて返す
    リスク(risk) ┘

HTTP トリガー:
    POST /api/concurrent   body: { "prompt": "..." }
    → 3つの専門 Agent が同じ入力を同時に処理し、それぞれの回答を返す。

必要な環境変数（local.settings.json / App Settings）:
    AZURE_OPENAI_ENDPOINT                 例: https://<name>.openai.azure.com
    AZURE_OPENAI_CHAT_DEPLOYMENT_NAME     例: gpt-5-mini（デプロイ名）
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

# 並列実行する専門 Agent（名前 → 役割）
AGENTS = {
    "tech": "あなたは技術の専門家です。入力に対して技術的な観点から要点を簡潔な日本語で述べてください。",
    "business": "あなたはビジネスの専門家です。入力に対してビジネス・コストの観点から要点を簡潔な日本語で述べてください。",
    "risk": "あなたはリスク管理の専門家です。入力に対してリスク・注意点の観点から要点を簡潔な日本語で述べてください。",
}


def _missing_config() -> list[str]:
    required = [
        "AZURE_OPENAI_ENDPOINT",
        "AZURE_OPENAI_CHAT_DEPLOYMENT_NAME",
        "AZURE_OPENAI_API_KEY",
    ]
    return [name for name in required if not os.environ.get(name)]


async def _run_concurrent(prompt: str) -> dict:
    """複数 Agent を並列実行し、各観点の回答を集約して返す。"""
    from agent_framework.openai import OpenAIChatClient
    from agent_framework.orchestrations import ConcurrentBuilder

    client = OpenAIChatClient(
        azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
        api_key=os.environ["AZURE_OPENAI_API_KEY"],
        model=os.environ["AZURE_OPENAI_CHAT_DEPLOYMENT_NAME"],
        api_version=os.environ.get("AZURE_OPENAI_API_VERSION", DEFAULT_API_VERSION),
    )

    agents = [
        client.as_agent(name=name, instructions=instructions)
        for name, instructions in AGENTS.items()
    ]

    # fan-out（並列実行）→ fan-in（集約）
    workflow = ConcurrentBuilder(participants=agents).build()
    result = await workflow.run(prompt)
    outputs = result.get_outputs()

    messages = []
    if outputs:
        # 集約結果は1つの AgentResponse に各 Agent の応答が並ぶ
        aggregated = outputs[0]
        for msg in aggregated.messages:
            text = msg.text
            if not text:
                continue
            messages.append(
                {
                    "author": getattr(msg, "author_name", None) or "assistant",
                    "text": text,
                }
            )

    return {
        "pattern": "concurrent",
        "agents": list(AGENTS.keys()),
        "prompt": prompt,
        "messages": messages,
    }


@bp.route(route="concurrent", methods=["POST"])
async def concurrent(req: func.HttpRequest) -> func.HttpResponse:
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

    try:
        result = await _run_concurrent(str(prompt))
    except Exception as e:  # noqa: BLE001
        logger.exception("concurrent workflow failed")
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
