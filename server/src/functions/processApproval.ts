import * as df from "durable-functions";
import { ActivityHandler } from "durable-functions";

/**
 * 承認結果を受け取って処理する最小のアクティビティ。
 * ここでは結果メッセージを組み立てて返すだけ（実際はDB更新やメール送信など）。
 */
const processApproval: ActivityHandler = (input: { approved: boolean }): string => {
  const result = input?.approved
    ? "承認されました。処理を続行します。"
    : "拒否されました。処理を中止します。";
  return result;
};

df.app.activity("processApproval", { handler: processApproval });

export default processApproval;
