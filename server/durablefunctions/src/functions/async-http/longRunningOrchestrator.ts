import * as df from "durable-functions";
import { OrchestrationContext, OrchestrationHandler } from "durable-functions";

interface LongRunningInput {
  steps: number;
}

/**
 * Async HTTP API 用の「長時間処理」オーケストレーター。
 *
 * Durable Timer で 1ステップ2秒ずつ待機しながら進捗を進める。
 * 実行中は customStatus で進捗率を公開し、クライアントは
 * 組み込みの状態エンドポイント（statusQueryGetUri）をポーリングして完了を待つ。
 *
 * ※ 待機に setTimeout ではなく context.df.createTimer を使うのがポイント
 *   （決定性が保たれ、待機中もリソースを消費しない）。
 */
const longRunningOrchestrator: OrchestrationHandler = function* (
  context: OrchestrationContext
) {
  const input = (context.df.getInput() as LongRunningInput) ?? { steps: 5 };
  const totalSteps = input.steps ?? 5;

  for (let step = 1; step <= totalSteps; step++) {
    context.df.setCustomStatus({
      step,
      totalSteps,
      progress: Math.round((step / totalSteps) * 100),
    });

    // Durable Timer で2秒待機（長時間処理をシミュレート）
    const deadline = new Date(
      context.df.currentUtcDateTime.getTime() + 2000
    );
    yield context.df.createTimer(deadline);
  }

  return {
    message: `処理が完了しました（全 ${totalSteps} ステップ）`,
    totalSteps,
  };
};

df.app.orchestration("longRunningOrchestrator", longRunningOrchestrator);

export default longRunningOrchestrator;
