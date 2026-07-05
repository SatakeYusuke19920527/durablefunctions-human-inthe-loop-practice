"""
Magentic パターン（Microsoft Agent Framework）。

Manager Agent が、次に動かす Agent を「動的に」決めながらタスクを進める。
手順が固定できない複雑な調査・分析に向く:
    manager（指揮役） が researcher / writer を状況に応じて使い分け、最終成果をまとめる

HTTP トリガー:
    POST /api/magentic   body: { "prompt": "..." }
    → manager がタスクを分解し、必要な Agent を動的に呼び出して最終回答を返す。

必要な環境変数（local.settings.json / App Settings）:
    AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_CHAT_DEPLOYMENT_NAME /
    AZURE_OPENAI_API_KEY / AZURE_OPENAI_API_VERSION（既定: preview）
"""

import json
import logging
import os

import azure.functions as func

bp = func.Blueprint()

logger = logging.getLogger(__name__)

DEFAULT_API_VERSION = "preview"

MAX_ROUNDS = 6


def _missing_config() -> list[str]:
    required = [
        "AZURE_OPENAI_ENDPOINT",
        "AZURE_OPENAI_CHAT_DEPLOYMENT_NAME",
        "AZURE_OPENAI_API_KEY",
    ]
    return [name for name in required if not os.environ.get(name)]


async def _run_magentic(prompt: str) -> dict:
    """manager が researcher/writer を動的に指揮する Magentic ワークフローを実行する。"""
    from agent_framework.openai import OpenAIChatClient
    from agent_framework.orchestrations import MagenticBuilder

    client = OpenAIChatClient(
        azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
        api_key=os.environ["AZURE_OPENAI_API_KEY"],
        model=os.environ["AZURE_OPENAI_CHAT_DEPLOYMENT_NAME"],
        api_version=os.environ.get("AZURE_OPENAI_API_VERSION", DEFAULT_API_VERSION),
    )

    manager = client.as_agent(
        name="manager",
        instructions=(
            "あなたはマネージャーです。与えられたタスクを分解し、researcher（調査）と"
            " writer（文章化）を状況に応じて使い分けて、最終的な成果を日本語でまとめてください。"
        ),
    )
    researcher = client.as_agent(
        name="researcher",
        instructions="あなたは調査担当です。必要な事実や観点を簡潔に集めてください。",
    )
    writer = client.as_agent(
        name="writer",
        instructions="あなたは文章担当です。集まった情報を分かりやすい日本語でまとめてください。",
    )

    # Manager が次に動かす Agent を動的に決定する
    workflow = MagenticBuilder(
        participants=[researcher, writer],
        manager_agent=manager,
        max_round_count=MAX_ROUNDS,
    ).build()
    result = await workflow.run(prompt)

    messages = []
    for out in result.get_outputs():
        for msg in getattr(out, "messages", []) or []:
            text = (msg.text or "").strip()
            if not text:
                continue
            messages.append(
                {
                    "author": getattr(msg, "author_name", None) or "assistant",
                    "text": text,
                }
            )

    return {
        "pattern": "magentic",
        "manager": "manager",
        "participants": ["researcher", "writer"],
        "maxRounds": MAX_ROUNDS,
        "prompt": prompt,
        "messages": messages,
        "final": messages[-1]["text"] if messages else "",
    }


@bp.route(route="magentic", methods=["POST"])
async def magentic(req: func.HttpRequest) -> func.HttpResponse:
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
        result = await _run_magentic(str(prompt))
    except Exception as e:  # noqa: BLE001
        logger.exception("magentic workflow failed")
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
