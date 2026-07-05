"use client";

import { cn } from "@/lib/utils";

export interface FileResult {
  file: string;
  words: number;
}

interface Props {
  /** 分析対象のファイル名一覧（並列数）。 */
  files: string[];
  /** 実行中か（fan-out 中は全レーンが並列実行）。 */
  running: boolean;
  /** 完了したか。 */
  completed: boolean;
  /** 完了時の各ファイル結果。 */
  details: FileResult[] | null;
  /** 集約結果の合計単語数。 */
  totalWords: number | null;
}

export function FanOutFlow({
  files,
  running,
  completed,
  details,
  totalWords,
}: Props) {
  const resultOf = (file: string) =>
    details?.find((d) => d.file === file)?.words ?? null;

  return (
    <div className="flex w-full items-stretch gap-2">
      {/* ① fan-out（起点） */}
      <div className="flex shrink-0 flex-col justify-center">
        <div
          className={cn(
            "flex w-28 flex-col items-center rounded-lg border px-2 py-3 text-center",
            running || completed
              ? "border-slate-400 bg-slate-100 text-slate-600"
              : "border-slate-200 bg-white text-slate-400"
          )}
        >
          <span className="text-xs font-semibold">① fan-out</span>
          <span className="mt-0.5 font-mono text-[9px] opacity-70">
            並列に一斉起動
          </span>
          <span className="mt-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
            {files.length} 並列
          </span>
        </div>
      </div>

      {/* 矢印（分岐） */}
      <div className="flex shrink-0 items-center text-lg text-slate-300">→</div>

      {/* 中央: N 本の並列レーン */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {files.map((file) => {
          const words = resultOf(file);
          const done = completed && words !== null;
          return (
            <div
              key={file}
              className={cn(
                "flex items-center justify-between rounded-md border px-3 py-1.5 text-xs transition-all duration-300",
                done
                  ? "border-green-400 bg-green-50 text-green-800"
                  : running
                    ? "border-blue-400 bg-blue-50 text-blue-800"
                    : "border-slate-200 bg-white text-slate-400"
              )}
            >
              <span className="flex items-center gap-2">
                {running && !done && (
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
                )}
                {done && <span>✅</span>}
                <span className="font-mono">{file}</span>
              </span>
              <span className="text-[10px]">
                {done ? (
                  <span className="font-semibold">{words} words</span>
                ) : running ? (
                  <span className="text-blue-600">分析中…</span>
                ) : (
                  <span className="text-slate-300">待機</span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* 矢印（集約） */}
      <div className="flex shrink-0 items-center text-lg text-slate-300">→</div>

      {/* ② fan-in（集約） */}
      <div className="flex shrink-0 flex-col justify-center">
        <div
          className={cn(
            "flex w-28 flex-col items-center rounded-lg border px-2 py-3 text-center",
            completed
              ? "border-green-500 bg-green-50 text-green-700 shadow-md ring-2 ring-green-200"
              : "border-slate-200 bg-white text-slate-400"
          )}
        >
          <span className="text-xs font-semibold">② fan-in</span>
          <span className="mt-0.5 font-mono text-[9px] opacity-70">
            Task.all で集約
          </span>
          {completed && totalWords !== null && (
            <span className="mt-1 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700">
              計 {totalWords} words
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
