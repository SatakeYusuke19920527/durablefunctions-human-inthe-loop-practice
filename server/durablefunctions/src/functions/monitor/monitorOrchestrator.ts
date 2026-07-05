import * as df from "durable-functions";
import { OrchestrationContext, OrchestrationHandler } from "durable-functions";
import { JobStatus } from "./checkJobStatus";

interface MonitorInput {
  intervalSeconds: number;
  timeoutSeconds: number;
}

/**
 * Monitor パターンのオーケストレーター。
 *
 * 一定間隔（Durable Timer）で外部ジョブの状態を「定期確認」し、
 *   - "Completed" になったら監視を終了して結果を返す
 *   - 期限（timeout）に達したら打ち切る
 *
 * ポーリングの待機は必ず context.df.createTimer を使う（決定的・低コスト）。
 */
const monitorOrchestrator: OrchestrationHandler = function* (
  context: OrchestrationContext
) {
  const input = (context.df.getInput() as MonitorInput) ?? {
    intervalSeconds: 3,
    timeoutSeconds: 30,
  };
  const intervalMs = (input.intervalSeconds ?? 3) * 1000;
  const timeoutMs = (input.timeoutSeconds ?? 30) * 1000;

  // 監視の期限（これを過ぎたら打ち切る）
  const expiryTime = new Date(
    context.df.currentUtcDateTime.getTime() + timeoutMs
  );

  let pollCount = 0;

  while (context.df.currentUtcDateTime.getTime() < expiryTime.getTime()) {
    pollCount++;

    // 外部ジョブの状態を確認
    const status: JobStatus = yield context.df.callActivity(
      "checkJobStatus",
      pollCount
    );

    context.df.setCustomStatus({
      phase: "monitoring",
      pollCount,
      lastStatus: status,
    });

    if (status === "Completed") {
      // 完了を検知 → 監視終了（実運用ではここで後続処理を呼ぶ）
      return {
        result: "completed",
        pollCount,
        message: `${pollCount} 回目の確認でジョブ完了を検知しました。`,
      };
    }

    // 次の確認までタイマーで待機
    const nextCheck = new Date(
      context.df.currentUtcDateTime.getTime() + intervalMs
    );
    yield context.df.createTimer(nextCheck);
  }

  // 期限切れ（タイムアウト）
  context.df.setCustomStatus({ phase: "timeout", pollCount });
  return {
    result: "timeout",
    pollCount,
    message: `期限内にジョブが完了しませんでした（${pollCount} 回確認）。`,
  };
};

df.app.orchestration("monitorOrchestrator", monitorOrchestrator);

export default monitorOrchestrator;
