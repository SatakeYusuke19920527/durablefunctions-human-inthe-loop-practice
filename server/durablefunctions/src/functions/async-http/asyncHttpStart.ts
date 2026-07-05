import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import * as df from "durable-functions";
import { DurableClient } from "durable-functions";

/**
 * Async HTTP API を開始する HTTP トリガー。
 * POST /api/async/start にJSON { "steps": 5 } を送ると長時間処理を開始し、
 * **202 Accepted** と状態確認用の URL 群（statusQueryGetUri 等）を返す。
 *
 * createCheckStatusResponse が Async HTTP API パターンの中核:
 *   - すぐに 202 を返す（処理の完了は待たない）
 *   - Location ヘッダ + statusQueryGetUri を返し、クライアントがそこをポーリング
 *   - 実行中は 202、完了すると 200 が返る
 */
const asyncHttpStart = async (
  request: HttpRequest,
  client: DurableClient,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  let body: { steps?: number } = {};
  try {
    body = (await request.json()) as { steps?: number };
  } catch {
    // ボディ無しはデフォルト
  }
  const steps = Math.min(20, Math.max(1, body.steps ?? 5));

  const instanceId = await client.startNew("longRunningOrchestrator", {
    input: { steps },
  });
  context.log(`Started long-running orchestration with ID = '${instanceId}'.`);

  // 202 + 状態確認 URL 群を返す（Async HTTP API の中核）
  return client.createCheckStatusResponse(request, instanceId);
};

df.app.client.http("asyncHttpStart", {
  route: "async/start",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: asyncHttpStart,
});

export default asyncHttpStart;
