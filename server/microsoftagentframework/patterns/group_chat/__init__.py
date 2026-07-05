"""
Group Chat パターン（Microsoft Agent Framework）。

複数の Agent が共有コンテキスト上で議論する。進行役（orchestrator）が
次に発言する参加者を選び、賛成派・反対派が交互に主張を述べる:
    moderator（進行役） が pro / con を指名して議論を進行

HTTP トリガー:
    POST /api/groupchat   body: { "prompt": "..." }
    → pro と con が議論し、各発言（ターン）を返す。

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

MAX_ROUNDS = 3
# 議論の参加者（進行役 moderator は本文には含めない）
PARTICIPANTS = {"pro", "con"}


def _missing_config() -> list[str]:
    required = [
        "AZURE_OPENAI_ENDPOINT",
        "AZURE_OPENAI_CHAT_DEPLOYMENT_NAME",
        "AZURE_OPENAI_API_KEY",
    ]
    return [name for name in required if not os.environ.get(name)]


async def _run_groupchat(prompt: str) -> dict:
    """pro/con が議論する Group Chat ワークフローを実行する。"""
    from agent_framework.openai import OpenAIChatClient
    from agent_framework.orchestrations import GroupChatBuilder

    client = OpenAIChatClient(
        azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
        api_key=os.environ["AZURE_OPENAI_API_KEY"],
        model=os.environ["AZURE_OPENAI_CHAT_DEPLOYMENT_NAME"],
        api_version=os.environ.get("AZURE_OPENAI_API_VERSION", DEFAULT_API_VERSION),
    )

    moderator = client.as_agent(
        name="moderator",
        instructions="あなたは議論の進行役です。pro と con を交互に指名し、両者に発言させてください。",
    )
    pro = client.as_agent(
        name="pro",
        instructions="あなたは賛成派です。テーマに賛成の立場から簡潔に1〜2文で主張してください。",
    )
    con = client.as_agent(
        name="con",
        instructions="あなたは反対派です。テーマに反対の立場から簡潔に1〜2文で主張してください。",
    )

    workflow = (
        GroupChatBuilder(participants=[pro, con], orchestrator_agent=moderator)
        .with_max_rounds(MAX_ROUNDS)
        .build()
    )
    result = await workflow.run(prompt)

    # WorkflowRunResult はイベントのリスト。参加者(pro/con)の発言を順に収集する。
    messages = []
    seen = set()
    for event in result:
        for obj in (event, getattr(event, "data", None)):
            for msg in getattr(obj, "messages", None) or []:
                text = (getattr(msg, "text", "") or "").strip()
                author = getattr(msg, "author_name", None)
                if not text or author not in PARTICIPANTS:
                    continue
                key = (author, text)
                if key in seen:
                    continue
                seen.add(key)
                messages.append({"author": author, "text": text})

    return {
        "pattern": "group_chat",
        "agents": ["pro", "con"],
        "moderator": "moderator",
        "maxRounds": MAX_ROUNDS,
        "prompt": prompt,
        "messages": messages,
    }


@bp.route(route="groupchat", methods=["POST"])
async def groupchat(req: func.HttpRequest) -> func.HttpResponse:
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
        result = await _run_groupchat(str(prompt))
    except Exception as e:  # noqa: BLE001
        logger.exception("group chat workflow failed")
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
