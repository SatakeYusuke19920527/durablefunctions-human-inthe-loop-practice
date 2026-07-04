import * as df from "durable-functions";
import { OrchestrationContext, OrchestrationHandler } from "durable-functions";

/**
 * Human-in-the-loop のオーケストレーター。
 * "Approval" という外部イベントを待機し、受信したら結果を Activity で処理する。
 */
const approvalOrchestrator: OrchestrationHandler = function* (context: OrchestrationContext) {
  // 承認/拒否イベントを待機（人間の操作を待つ）
  const approvalEvent: { approved: boolean } = yield context.df.waitForExternalEvent("Approval");

  // 承認結果を Activity で処理
  const result: string = yield context.df.callActivity("processApproval", approvalEvent);

  return {
    approved: approvalEvent.approved,
    message: result,
  };
};

df.app.orchestration("approvalOrchestrator", approvalOrchestrator);

export default approvalOrchestrator;
