import * as df from "durable-functions";
import { OrchestrationContext, OrchestrationHandler } from "durable-functions";
import { FileResult } from "./analyzeFile";

interface FanOutInput {
  files: string[];
}

/**
 * Fan-out / Fan-in のオーケストレーター。
 *
 *   fan-out : 複数ファイルの分析 Activity を「並列」に一斉起動
 *   fan-in  : Task.all で全部の完了を待ち、結果を集約
 *
 * 直列だと (件数 × 3秒) かかる処理が、並列なのでおよそ 3秒で完了する。
 */
const fanOutOrchestrator: OrchestrationHandler = function* (
  context: OrchestrationContext
) {
  const input = (context.df.getInput() as FanOutInput) ?? { files: [] };
  const files = input.files ?? [];

  // fan-out: 各ファイルの分析タスクを並列に作成
  context.df.setCustomStatus({ phase: "fan-out", total: files.length });
  const tasks = files.map((file) =>
    context.df.callActivity("analyzeFile", file)
  );

  // fan-in: すべての完了を待って集約
  const results: FileResult[] = yield context.df.Task.all(tasks);

  context.df.setCustomStatus({ phase: "fan-in", total: files.length });
  const totalWords = results.reduce((sum, r) => sum + r.words, 0);

  return {
    totalFiles: files.length,
    totalWords,
    details: results,
  };
};

df.app.orchestration("fanOutOrchestrator", fanOutOrchestrator);

export default fanOutOrchestrator;
