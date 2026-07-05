import * as df from "durable-functions";
import { ActivityHandler } from "durable-functions";
import { Registration } from "./registerApplication";

/**
 * ③ 通知: 登録完了を申請者に通知する想定（前ステップの出力を受け取る）。
 * ここでは通知メッセージ文字列を返すだけ（デモ用に約3秒待機）。
 */
const notifyApplicant: ActivityHandler = async (
  input: Registration
): Promise<string> => {
  await new Promise((resolve) => setTimeout(resolve, 3000));
  return `${input.name} 様の申請（${input.recordId}）を受け付け、通知を送信しました。`;
};

df.app.activity("notifyApplicant", { handler: notifyApplicant });

export default notifyApplicant;
