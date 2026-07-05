import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import * as df from "durable-functions";
import { DurableClient } from "durable-functions";

/**
 * 集約エンティティにイベント（数値）を送る HTTP トリガー。
 * POST /api/aggregator/{key}/add にJSON { "value": 42 } を送ると、
 * signalEntity で "add" 操作をエンティティに通知する（fire-and-forget）。
 *
 * {key} は集約の単位（例: メトリクス名、注文ID、デバイスID）。
 * 同じ key へのイベントは1つの状態に集約される。
 */
const aggregatorAdd = async (
  request: HttpRequest,
  client: DurableClient,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  const key = request.params.key;
  if (!key) {
    return { status: 400, jsonBody: { error: "key is required" } };
  }

  let body: { value?: number } = {};
  try {
    body = (await request.json()) as { value?: number };
  } catch {
    // ボディ無し
  }
  const value = typeof body.value === "number" ? body.value : 0;

  const entityId = new df.EntityId("metricsAggregator", key);
  await client.signalEntity(entityId, "add", value);
  context.log(`Signaled 'add' (${value}) to aggregator '${key}'.`);

  return {
    status: 202,
    jsonBody: { key, value, message: "event aggregated" },
  };
};

df.app.client.http("aggregatorAdd", {
  route: "aggregator/{key}/add",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: aggregatorAdd,
});

export default aggregatorAdd;
