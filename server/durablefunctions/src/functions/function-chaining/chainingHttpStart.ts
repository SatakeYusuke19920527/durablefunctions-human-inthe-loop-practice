import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import * as df from "durable-functions";
import { DurableClient } from "durable-functions";

/**
 * Function chaining を開始する HTTP トリガー。
 * POST /api/chaining/start にJSON { "name": "山田太郎" } を送ると、
 * 検証→登録→通知 のチェーンを実行するオーケストレーションを開始する。
 */
const chainingHttpStart = async (
  request: HttpRequest,
  client: DurableClient,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  let body: { name?: string } = {};
  try {
    body = (await request.json()) as { name?: string };
  } catch {
    // ボディ無しはデフォルト名で開始
  }
  const input = { name: body.name ?? "山田太郎" };

  const instanceId = await client.startNew("chainingOrchestrator", { input });
  context.log(`Started chaining orchestration with ID = '${instanceId}'.`);

  return client.createCheckStatusResponse(request, instanceId);
};

df.app.client.http("chainingHttpStart", {
  route: "chaining/start",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: chainingHttpStart,
});

export default chainingHttpStart;
