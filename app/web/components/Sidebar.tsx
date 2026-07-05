"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PATTERNS } from "@/lib/patterns";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-slate-50">
      <div className="border-b border-slate-200 px-4 py-4">
        <Link href="/" className="block">
          <div className="text-sm font-bold text-slate-800">
            Durable Functions
          </div>
          <div className="text-[11px] text-slate-500">パターン実装サンプル</div>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {PATTERNS.map((p) => {
          const href = `/${p.slug}`;
          const active = pathname === href;
          return (
            <Link
              key={p.slug}
              href={href}
              className={cn(
                "block rounded-lg px-3 py-2 transition-colors",
                active
                  ? "bg-slate-900 text-white"
                  : "text-slate-700 hover:bg-slate-200"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium leading-tight">
                  {p.title}
                </span>
                {p.implemented ? (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
                      active
                        ? "bg-green-500 text-white"
                        : "bg-green-100 text-green-700"
                    )}
                  >
                    実装済
                  </span>
                ) : (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
                      active
                        ? "bg-slate-600 text-slate-200"
                        : "bg-slate-200 text-slate-500"
                    )}
                  >
                    未実装
                  </span>
                )}
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
        })}
      </nav>

      <div className="border-t border-slate-200 px-4 py-3 text-[10px] text-slate-400">
        Human-in-the-loop practice
      </div>
    </aside>
  );
}
