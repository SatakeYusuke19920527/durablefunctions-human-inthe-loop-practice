import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import * as df from "durable-functions";
import { DurableClient } from "durable-functions";

/**
 * オーケストレーションを開始する HTTP トリガー。
 * POST /api/start を呼ぶと新しいインスタンスが起動し、状態確認用の URL 群を返す。
 * df.app.client.http で登録すると、第2引数に DurableClient が渡される。
 */
const httpStart = async (
  request: HttpRequest,
  client: DurableClient,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  const instanceId = await client.startNew("approvalOrchestrator");
  context.log(`Started orchestration with ID = '${instanceId}'.`);

  return client.createCheckStatusResponse(request, instanceId);
};

df.app.client.http("httpStart", {
  route: "start",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: httpStart,
});

export default httpStart;
