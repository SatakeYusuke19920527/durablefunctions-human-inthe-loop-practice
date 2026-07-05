"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  PATTERNS,
  AGENT_PATTERNS,
  PatternDef,
  patternRoute,
} from "@/lib/patterns";
import { cn } from "@/lib/utils";

function PatternLink({ p, active }: { p: PatternDef; active: boolean }) {
  return (
    <Link
      href={patternRoute(p)}
      className={cn(
        "block rounded-lg px-3 py-2 transition-colors",
        active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-200"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium leading-tight">{p.title}</span>
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
            p.implemented
              ? active
                ? "bg-green-500 text-white"
                : "bg-green-100 text-green-700"
              : active
                ? "bg-slate-600 text-slate-200"
                : "bg-slate-200 text-slate-500"
          )}
        >
          {p.implemented ? "実装済" : "未実装"}
        </span>
      </div>
      <div
        className={cn(
          "mt-0.5 text-[10px] leading-tight",
          active ? "text-slate-300" : "text-slate-400"
        )}
      >
        {p.description}
      </div>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-slate-50">
      <div className="border-b border-slate-200 px-4 py-4">
        <Link href="/" className="block">
          <div className="text-sm font-bold text-slate-800">
            Azure Orchestration
          </div>
          <div className="text-[11px] text-slate-500">パターン実装サンプル</div>
        </Link>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto p-2">
        {/* Durable Functions セクション */}
        <div>
          <div className="px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            Durable Functions
          </div>
          <div className="space-y-1">
            {PATTERNS.map((p) => (
              <PatternLink
                key={p.slug}
                p={p}
                active={pathname === patternRoute(p)}
              />
            ))}
          </div>
        </div>

        {/* Microsoft Agent Framework セクション */}
        <div>
          <div className="px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            Microsoft Agent Framework
          </div>
          <div className="space-y-1">
            {AGENT_PATTERNS.map((p) => (
              <PatternLink
                key={p.slug}
                p={p}
                active={pathname === patternRoute(p)}
              />
            ))}
          </div>
        </div>
      </nav>

      <div className="border-t border-slate-200 px-4 py-3 text-[10px] text-slate-400">
        Durable Functions × Agent Framework
      </div>
    </aside>
  );
}
