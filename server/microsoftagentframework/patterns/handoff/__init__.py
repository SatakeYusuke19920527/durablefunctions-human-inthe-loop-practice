"""
Handoff パターン（Microsoft Agent Framework）。

文脈に応じて、担当 Agent が適切な専門 Agent へ制御を「引き継ぐ（handoff）」:
    triage（一般窓口） ──▶ billing（請求）
                       └─▶ tech（技術）

HTTP トリガー:
    POST /api/handoff   body: { "prompt": "..." }
    → triage が内容を見て適切な専門家に引き継ぎ、専門家が回答する。

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


def _missing_config() -> list[str]:
    required = [
        "AZURE_OPENAI_ENDPOINT",
        "AZURE_OPENAI_CHAT_DEPLOYMENT_NAME",
        "AZURE_OPENAI_API_KEY",
    ]
    return [name for name in required if not os.environ.get(name)]


async def _run_handoff(prompt: str) -> dict:
    """triage → 専門家 の Handoff ワークフローを実行する。"""
    from agent_framework.openai import OpenAIChatClient
    from agent_framework.orchestrations import HandoffBuilder

    client = OpenAIChatClient(
        azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
        api_key=os.environ["AZURE_OPENAI_API_KEY"],
        model=os.environ["AZURE_OPENAI_CHAT_DEPLOYMENT_NAME"],
        api_version=os.environ.get("AZURE_OPENAI_API_VERSION", DEFAULT_API_VERSION),
    )

    # Handoff では各 Agent に require_per_service_call_history_persistence=True が必須
    def agent(name: str, instructions: str):
        return client.as_agent(
            name=name,
            instructions=instructions,
            require_per_service_call_history_persistence=True,
        )

    triage = agent(
        "triage",
        "あなたは一般窓口です。ユーザーの内容を見て、請求・支払いに関するものは"
        " billing に、技術・不具合に関するものは tech に必ず引き継いでください。",
    )
    billing = agent(
        "billing",
        "あなたは請求の専門家です。ユーザーの質問に簡潔で分かりやすい日本語で回答してください。",
    )
    tech = agent(
        "tech",
        "あなたは技術サポートの専門家です。ユーザーの質問に簡潔で分かりやすい日本語で回答してください。",
    )

    workflow = (
        HandoffBuilder(participants=[triage, billing, tech])
        .with_start_agent(triage)
        .add_handoff(triage, [billing, tech])
        .build()
    )
    result = await workflow.run(prompt)

    # 応答メッセージ（空でないもの）を収集。triage は handoff のみで本文が空になりやすく、
    # 実際の回答は引き継ぎ先の専門家（billing / tech）が生成する。
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

    handed_to = next(
        (m["author"] for m in messages if m["author"] in ("billing", "tech")),
        None,
    )

    return {
        "pattern": "handoff",
        "start": "triage",
        "agents": ["triage", "billing", "tech"],
        "handedTo": handed_to,
        "prompt": prompt,
        "messages": messages,
        "final": messages[-1]["text"] if messages else "",
    }


@bp.route(route="handoff", methods=["POST"])
async def handoff(req: func.HttpRequest) -> func.HttpResponse:
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
        result = await _run_handoff(str(prompt))
    except Exception as e:  # noqa: BLE001
        logger.exception("handoff workflow failed")
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
