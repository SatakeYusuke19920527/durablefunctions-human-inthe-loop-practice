import * as df from "durable-functions";
import { OrchestrationContext, OrchestrationHandler } from "durable-functions";

/**
 * Human-in-the-loop のオーケストレーター（承認されるまでループ）。
 *
 * "Approval" イベントを待機し:
 *   - 承認(approved: true) → Activity で処理して完了
 *   - 拒否(approved: false) → 最初からやり直し（再度承認待ちに戻る）
 *
 * customStatus で現在フェーズと試行回数(attempts)を公開し、
 * フロント側が「承認待ち / 処理中 / 拒否→やり直し」を判別できるようにする。
 */
const approvalOrchestrator: OrchestrationHandler = function* (
  context: OrchestrationContext
) {
  let attempts = 0;

  while (true) {
    attempts++;

    // 承認待ち（人間の操作を待つ）
    context.df.setCustomStatus({ phase: "waiting", attempts });
    const approvalEvent: { approved: boolean } =
      yield context.df.waitForExternalEvent("Approval");

    if (approvalEvent.approved) {
      // 承認 → Activity で処理して完了
      context.df.setCustomStatus({ phase: "processing", attempts });
      const result: string = yield context.df.callActivity(
        "processApproval",
        approvalEvent
      );
      return {
        approved: true,
        message: result,
        attempts,
      };
    }

    // 拒否 → 最初からやり直し（ループ先頭へ戻り、再び承認待ちになる）
    context.df.setCustomStatus({ phase: "rejected_retry", attempts });
  }
};

df.app.orchestration("approvalOrchestrator", approvalOrchestrator);

export default approvalOrchestrator;
