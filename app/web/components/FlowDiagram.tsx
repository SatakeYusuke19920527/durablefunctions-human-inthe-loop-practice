"use client";

import { StageKey } from "@/lib/stages";
import { cn } from "@/lib/utils";

const ORDER: StageKey[] = [
  "started",
  "waiting",
  "decision_sent",
  "processing",
  "completed",
];

interface Props {
  /** 現在アクティブなステージ。 */
  current: StageKey;
  /** 完了時に承認されたか（色分け用、未完了は null）。 */
  approved: boolean | null;
  /** ③で選択された承認(true)/拒否(false)。未選択は null。 */
  decision: boolean | null;
}

/** 単一ボックス。 */
function StageBox({
  label,
  sub,
  state,
  pulsing,
}: {
  label: string;
  sub: string;
  state: "idle" | "done" | "active" | "approved" | "rejected" | "dim";
  pulsing?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center rounded-lg border px-1.5 py-2 text-center transition-all duration-300",
        state === "active" &&
          "border-blue-500 bg-blue-50 shadow-md ring-2 ring-blue-200",
        state === "approved" &&
          "border-green-500 bg-green-50 shadow-md ring-2 ring-green-200",
        state === "rejected" &&
          "border-red-500 bg-red-50 shadow-md ring-2 ring-red-200",
        state === "done" && "border-slate-300 bg-slate-100 text-slate-500",
        state === "dim" && "border-slate-200 bg-slate-50 text-slate-300",
        state === "idle" && "border-slate-200 bg-white text-slate-400"
      )}
    >
      <span className="text-xs font-semibold leading-tight">{label}</span>
      <span className="mt-0.5 w-full truncate font-mono text-[9px] leading-tight opacity-70">
        {sub}
      </span>
      {pulsing && (
        <span className="mt-1 flex items-center gap-1 text-[9px] font-medium text-blue-600">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
          実行中
        </span>
      )}
    </div>
  );
}

function Arrow({ passed }: { passed: boolean }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center text-sm leading-none",
        passed ? "text-slate-400" : "text-slate-300"
      )}
    >
      <span className="hidden sm:inline">→</span>
      <span className="sm:hidden">↓</span>
    </div>
  );
}

export function FlowDiagram({ current, approved, decision }: Props) {
  const idx = current === "idle" ? -1 : ORDER.indexOf(current);
  const decisionIdx = ORDER.indexOf("decision_sent");

  // ③ より後に進んでいる（＝承認/拒否を送信済み）か
  const decisionReached = idx >= decisionIdx;

  return (
    <div className="flex w-full flex-col items-stretch gap-1.5 sm:flex-row sm:items-center">
      {/* ① 開始 */}
      <div className="flex flex-1 items-center gap-1.5 sm:min-w-0">
        <StageBox
          label="① 開始"
          sub="httpStart"
          state={idx > 0 ? "done" : idx === 0 ? "active" : "idle"}
          pulsing={idx === 0}
        />
        <Arrow passed={idx > 0} />
      </div>

      {/* ② 承認待ち */}
      <div className="flex flex-1 items-center gap-1.5 sm:min-w-0">
        <StageBox
          label="② 承認待ち"
          sub="waitForExternalEvent"
          state={idx > 1 ? "done" : idx === 1 ? "active" : "idle"}
          pulsing={idx === 1}
        />
        <Arrow passed={idx > 1} />
      </div>

      {/* ③ 承認 / 拒否（2ボックスを縦積み） */}
      <div className="flex flex-1 items-center gap-1.5 sm:min-w-0">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <StageBox
            label="③ 承認"
            sub="approved: true"
            state={
              !decisionReached
                ? "idle"
                : decision === true
                  ? "approved"
                  : "dim"
            }
          />
          <StageBox
            label="③ 拒否"
            sub="approved: false"
            state={
              !decisionReached
                ? "idle"
                : decision === false
                  ? "rejected"
                  : "dim"
            }
          />
        </div>
        <Arrow passed={idx > decisionIdx} />
      </div>

      {/* ④ 処理 */}
      <div className="flex flex-1 items-center gap-1.5 sm:min-w-0">
        <StageBox
          label="④ 処理"
          sub="processApproval"
          state={idx > 3 ? "done" : idx === 3 ? "active" : "idle"}
          pulsing={idx === 3}
        />
        <Arrow passed={idx > 3} />
      </div>

      {/* ⑤ 完了 */}
      <div className="flex flex-1 items-center sm:min-w-0">
        <StageBox
          label="⑤ 完了"
          sub="Completed"
          state={
            idx === 4
              ? approved === true
                ? "approved"
                : approved === false
                  ? "rejected"
                  : "active"
              : "idle"
          }
        />
      </div>
    </div>
  );
}
