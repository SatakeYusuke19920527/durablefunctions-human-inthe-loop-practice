import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import * as df from "durable-functions";
import { DurableClient } from "durable-functions";
import { MetricsState } from "./metricsAggregator";

/**
 * 集約エンティティの現在状態を取得する HTTP トリガー。
 * GET /api/aggregator/{key} で、これまで集約された count/sum/min/max/last と
 * 平均(avg)を返す。readEntityState でエンティティの状態を読み出す。
 */
const aggregatorGet = async (
  request: HttpRequest,
  client: DurableClient,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  const key = request.params.key;
  if (!key) {
    return { status: 400, jsonBody: { error: "key is required" } };
  }

  const entityId = new df.EntityId("metricsAggregator", key);
  const res = await client.readEntityState<MetricsState>(entityId);

  if (!res.entityExists || !res.entityState) {
    return {
      status: 200,
      jsonBody: {
        key,
        exists: false,
        count: 0,
        sum: 0,
        avg: null,
        min: null,
        max: null,
        last: null,
      },
    };
  }

  const s = res.entityState;
  const avg = s.count > 0 ? s.sum / s.count : null;

  return {
    status: 200,
    jsonBody: {
      key,
      exists: true,
      count: s.count,
      sum: s.sum,
      avg,
      min: s.min,
      max: s.max,
      last: s.last,
    },
  };
};

df.app.client.http("aggregatorGet", {
  route: "aggregator/{key}",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: aggregatorGet,
});

export default aggregatorGet;
