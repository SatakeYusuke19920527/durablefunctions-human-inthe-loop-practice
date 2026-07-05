import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import * as df from "durable-functions";
import { DurableClient } from "durable-functions";

/**
 * 承認/拒否イベントを送信する HTTP トリガー（人間の操作）。
 * POST /api/approve/{instanceId} にJSON { "approved": true } を送ると、
 * 待機中のオーケストレーションへ "Approval" イベントを raiseEvent で通知する。
 * df.app.client.http で登録すると、第2引数に DurableClient が渡される。
 */
const sendApproval = async (
  request: HttpRequest,
  client: DurableClient,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  const instanceId = request.params.instanceId;
  if (!instanceId) {
    return { status: 400, jsonBody: { error: "instanceId is required." } };
  }

  let body: { approved?: boolean } = {};
  try {
    body = (await request.json()) as { approved?: boolean };
  } catch {
    // ボディが無い/不正な場合はデフォルト（承認）扱い
  }
  const approved = body.approved ?? true;

  const status = await client.getStatus(instanceId);
  if (!status || !status.runtimeStatus) {
    return { status: 404, jsonBody: { error: `Instance '${instanceId}' not found.` } };
  }

  await client.raiseEvent(instanceId, "Approval", { approved });
  context.log(`Raised 'Approval' event (approved=${approved}) for instance '${instanceId}'.`);

  return {
    status: 202,
    jsonBody: {
      instanceId,
      approved,
      message: "Approval event sent.",
    },
  };
};

df.app.client.http("sendApproval", {
  route: "approve/{instanceId}",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: sendApproval,
});

export default sendApproval;
