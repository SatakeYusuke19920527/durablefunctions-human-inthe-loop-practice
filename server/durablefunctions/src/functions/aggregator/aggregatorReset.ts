import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import * as df from "durable-functions";
import { DurableClient } from "durable-functions";

/**
 * 集約エンティティをリセットする HTTP トリガー。
 * POST /api/aggregator/{key}/reset で "reset" 操作を送り、集計を初期化する。
 */
const aggregatorReset = async (
  request: HttpRequest,
  client: DurableClient,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  const key = request.params.key;
  if (!key) {
    return { status: 400, jsonBody: { error: "key is required" } };
  }

  const entityId = new df.EntityId("metricsAggregator", key);
  await client.signalEntity(entityId, "reset");
  context.log(`Signaled 'reset' to aggregator '${key}'.`);

  return { status: 202, jsonBody: { key, message: "reset" } };
};

df.app.client.http("aggregatorReset", {
  route: "aggregator/{key}/reset",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: aggregatorReset,
});

export default aggregatorReset;
