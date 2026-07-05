import Link from "next/link";
import { PATTERNS } from "@/lib/patterns";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          Durable Functions パターン実装サンプル
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Azure Durable Functions の代表的な6パターンを、実装しながら学ぶためのサンプルです。
          左のサイドメニューから各パターンを選択してください。
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {PATTERNS.map((p) => (
          <Link
            key={p.slug}
            href={`/${p.slug}`}
            className="group rounded-xl border border-slate-200 p-4 transition-colors hover:border-slate-400 hover:bg-slate-50"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold text-slate-800 group-hover:text-slate-900">
                {p.title}
              </h2>
              {p.implemented ? (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                  実装済
                </span>
              ) : (
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                  未実装
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">{p.description}</p>
            <p className="mt-2 text-[11px] text-slate-400">例: {p.example}</p>
          </Link>
        ))}
      </div>

      <p className="text-center text-xs text-slate-400">
        現在は <span className="font-semibold">Human interaction</span>{" "}
        のみ実装済みです。
      </p>
    </main>
  );
}
