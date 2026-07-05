import * as df from "durable-functions";
import { OrchestrationContext, OrchestrationHandler } from "durable-functions";
import { Application } from "./validateApplication";
import { Registration } from "./registerApplication";

/**
 * Function chaining のオーケストレーター。
 * Activity を「順番に」呼び、前の出力を次の入力へ渡していく。
 *
 *   検証(validate) → 登録(register) → 通知(notify)
 *
 * 各ステップの間で状態が永続化されるため、途中で中断しても再開できる。
 */
const chainingOrchestrator: OrchestrationHandler = function* (
  context: OrchestrationContext
) {
  const input = (context.df.getInput() as Application) ?? { name: "名無し" };

  // ① 検証
  context.df.setCustomStatus({ step: 1, label: "検証中" });
  const validated: Application = yield context.df.callActivity(
    "validateApplication",
    input
  );

  // ② 登録（①の出力を入力に使う）
  context.df.setCustomStatus({ step: 2, label: "登録中" });
  const registration: Registration = yield context.df.callActivity(
    "registerApplication",
    validated
  );

  // ③ 通知（②の出力を入力に使う）
  context.df.setCustomStatus({ step: 3, label: "通知中" });
  const message: string = yield context.df.callActivity(
    "notifyApplicant",
    registration
  );

  return {
    name: registration.name,
    recordId: registration.recordId,
    message,
  };
};

df.app.orchestration("chainingOrchestrator", chainingOrchestrator);

export default chainingOrchestrator;
