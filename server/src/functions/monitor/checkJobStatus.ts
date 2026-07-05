import * as df from "durable-functions";
import { ActivityHandler } from "durable-functions";

export type JobStatus = "Running" | "Completed";

/**
 * 外部ジョブの状態を確認する Activity（Monitor パターンの「確認」役）。
 *
 * デモとして、毎回の確認で 35% の確率で "Completed" を返す
 * （＝外部ジョブが徐々に完了に近づく様子をシミュレート）。
 * 実運用では外部APIやDBを叩いて実際のジョブ状態を取得する。
 */
const checkJobStatus: ActivityHandler = (pollCount: number): JobStatus => {
  const done = Math.random() < 0.35;
  return done ? "Completed" : "Running";
};

df.app.activity("checkJobStatus", { handler: checkJobStatus });

export default checkJobStatus;
