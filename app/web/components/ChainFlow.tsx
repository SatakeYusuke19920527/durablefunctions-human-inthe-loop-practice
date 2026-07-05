"use client";

import { cn } from "@/lib/utils";

const STEPS = [
  { label: "① 検証", sub: "validateApplication" },
  { label: "② 登録", sub: "registerApplication" },
  { label: "③ 通知", sub: "notifyApplicant" },
  { label: "完了", sub: "Completed" },
];

interface Props {
  /** 1-3 が処理中ステップ、4 が完了。0 は未開始。 */
  currentStep: number;
  /** 完了済みか。 */
  completed: boolean;
}

export function ChainFlow({ currentStep, completed }: Props) {
  // 完了時は最後（index 3）をアクティブに
  const activeIndex = completed ? 3 : currentStep - 1;

  return (
    <div className="flex w-full flex-col items-stretch gap-1.5 sm:flex-row sm:items-center">
      {STEPS.map((step, i) => {
        const isDone = i < activeIndex;
        const isActive = i === activeIndex;
        const isFinal = i === 3 && completed;

        return (
          <div key={step.label} className="flex flex-1 items-center gap-1.5 sm:min-w-0">
            <div
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center rounded-lg border px-2 py-2 text-center transition-all duration-300",
                isFinal && "border-green-500 bg-green-50 shadow-md ring-2 ring-green-200",
                isActive && !isFinal &&
                  "border-blue-500 bg-blue-50 shadow-md ring-2 ring-blue-200",
                isDone && "border-slate-300 bg-slate-100 text-slate-500",
                !isActive && !isDone && "border-slate-200 bg-white text-slate-400"
              )}
            >
              <span className="text-xs font-semibold leading-tight">{step.label}</span>
              <span className="mt-0.5 w-full truncate font-mono text-[9px] leading-tight opacity-70">
                {step.sub}
              </span>
              {isActive && !isFinal && (
                <span className="mt-1 flex items-center gap-1 text-[9px] font-medium text-blue-600">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
                  実行中
                </span>
              )}
            </div>

            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "flex shrink-0 items-center justify-center text-sm leading-none",
                  i < activeIndex ? "text-slate-400" : "text-slate-300"
                )}
              >
                <span className="hidden sm:inline">→</span>
                <span className="sm:hidden">↓</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
