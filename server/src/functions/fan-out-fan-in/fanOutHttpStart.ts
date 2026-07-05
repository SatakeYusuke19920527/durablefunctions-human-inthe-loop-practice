import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import * as df from "durable-functions";
import { DurableClient } from "durable-functions";

const DEFAULT_FILES = ["a.txt", "b.txt", "c.txt", "d.txt", "e.txt"];

/**
 * Fan-out / Fan-in を開始する HTTP トリガー。
 * POST /api/fanout/start にJSON { "files": ["a.txt", ...] } を送ると、
 * 各ファイルを並列分析して集約するオーケストレーションを開始する。
 * files 省略時はデフォルトの5ファイルを使用。
 */
const fanOutHttpStart = async (
  request: HttpRequest,
  client: DurableClient,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  let body: { files?: string[] } = {};
  try {
    body = (await request.json()) as { files?: string[] };
  } catch {
    // ボディ無しはデフォルト
  }
  const files =
    Array.isArray(body.files) && body.files.length > 0
      ? body.files
      : DEFAULT_FILES;

  const instanceId = await client.startNew("fanOutOrchestrator", {
    input: { files },
  });
  context.log(`Started fan-out orchestration with ID = '${instanceId}'.`);

  return client.createCheckStatusResponse(request, instanceId);
};

df.app.client.http("fanOutHttpStart", {
  route: "fanout/start",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: fanOutHttpStart,
});

export default fanOutHttpStart;
