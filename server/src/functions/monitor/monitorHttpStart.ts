import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import * as df from "durable-functions";
import { DurableClient } from "durable-functions";

/**
 * Monitor を開始する HTTP トリガー。
 * POST /api/monitor/start にJSON { "intervalSeconds": 3, "timeoutSeconds": 30 } を送ると、
 * 外部ジョブの状態を定期確認する監視オーケストレーションを開始し、202 と状態URLを返す。
 */
const monitorHttpStart = async (
  request: HttpRequest,
  client: DurableClient,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  let body: { intervalSeconds?: number; timeoutSeconds?: number } = {};
  try {
    body = (await request.json()) as {
      intervalSeconds?: number;
      timeoutSeconds?: number;
    };
  } catch {
    // ボディ無しはデフォルト
  }
  const intervalSeconds = Math.min(30, Math.max(1, body.intervalSeconds ?? 3));
  const timeoutSeconds = Math.min(300, Math.max(5, body.timeoutSeconds ?? 30));

  const instanceId = await client.startNew("monitorOrchestrator", {
    input: { intervalSeconds, timeoutSeconds },
  });
  context.log(`Started monitor orchestration with ID = '${instanceId}'.`);

  return client.createCheckStatusResponse(request, instanceId);
};

df.app.client.http("monitorHttpStart", {
  route: "monitor/start",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: monitorHttpStart,
});

export default monitorHttpStart;
