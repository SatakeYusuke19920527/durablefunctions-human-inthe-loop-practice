import * as df from "durable-functions";
import { ActivityHandler } from "durable-functions";

export interface Application {
  name: string;
}

/**
 * ① 検証: 申請内容をチェックする（チェーンの最初のステップ）。
 * デモとして処理に約3秒かかる想定で待機を入れている。
 */
const validateApplication: ActivityHandler = async (
  input: Application
): Promise<Application> => {
  await new Promise((resolve) => setTimeout(resolve, 3000));
  if (!input?.name || input.name.trim() === "") {
    throw new Error("申請者名が空です");
  }
  return { name: input.name.trim() };
};

df.app.activity("validateApplication", { handler: validateApplication });

export default validateApplication;
