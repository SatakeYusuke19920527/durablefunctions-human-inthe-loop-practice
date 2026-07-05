import * as df from "durable-functions";
import { ActivityHandler } from "durable-functions";
import { Application } from "./validateApplication";

export interface Registration {
  name: string;
  recordId: string;
}

/**
 * ② 登録: 検証済みの申請をDBに登録する想定（前ステップの出力を受け取る）。
 * ここでは擬似的に一意なレコードIDを払い出す（デモ用に約3秒待機）。
 */
const registerApplication: ActivityHandler = async (
  input: Application
): Promise<Registration> => {
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const recordId = `REC-${Date.now().toString(36).toUpperCase()}`;
  return { name: input.name, recordId };
};

df.app.activity("registerApplication", { handler: registerApplication });

export default registerApplication;
