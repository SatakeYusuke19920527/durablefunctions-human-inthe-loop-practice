"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ALL_PATTERNS, patternRoute } from "@/lib/patterns";

/**
 * 各パターン画面の右上に表示する「ドキュメント」ボタン。
 * 現在のパスからパターンを判定し、対応する docs があればリンクを表示する。
 * /docs/* やホームでは非表示。
 */
export function DocButton() {
  const pathname = usePathname();
  const pattern = ALL_PATTERNS.find(
    (p) => p.doc && patternRoute(p) === pathname
  );

  if (!pattern) return null;

  return (
    <div className="pointer-events-none absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
      <Link
        href={`/docs/${pattern.slug}`}
        className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50"
      >
        📄 ドキュメント
      </Link>
    </div>
  );
}
