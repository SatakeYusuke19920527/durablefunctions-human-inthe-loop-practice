import * as df from "durable-functions";
import { ActivityHandler } from "durable-functions";

export interface FileResult {
  file: string;
  words: number;
}

/**
 * 1ファイルを分析する Activity（fan-out で並列に多数実行される）。
 * デモとして約3秒かかる想定。単語数はダミー（乱数）で返す。
 */
const analyzeFile: ActivityHandler = async (file: string): Promise<FileResult> => {
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const words = Math.floor(Math.random() * 100) + 1;
  return { file, words };
};

df.app.activity("analyzeFile", { handler: analyzeFile });

export default analyzeFile;
