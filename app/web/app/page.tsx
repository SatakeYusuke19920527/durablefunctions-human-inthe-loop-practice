import Link from "next/link";
import {
  PATTERNS,
  AGENT_PATTERNS,
  PatternDef,
  patternRoute,
} from "@/lib/patterns";

function PatternCard({ p }: { p: PatternDef }) {
  return (
    <Link
      href={patternRoute(p)}
      className="group rounded-xl border border-slate-200 p-4 transition-colors hover:border-slate-400 hover:bg-slate-50"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-800 group-hover:text-slate-900">
          {p.title}
        </h3>
        <span
          className={
            p.implemented
              ? "rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700"
              : "rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-500"
          }
        >
          {p.implemented ? "実装済" : "未実装"}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-500">{p.description}</p>
      <p className="mt-2 text-[11px] text-slate-400">例: {p.example}</p>
    </Link>
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          Azure オーケストレーション パターン実装サンプル
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Azure Durable Functions と Microsoft Agent Framework
          のオーケストレーションパターンを、実装しながら学ぶためのサンプルです。
          左のサイドメニューから各パターンを選択してください。
        </p>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">
          Durable Functions
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {PATTERNS.map((p) => (
            <PatternCard key={p.slug} p={p} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">
          Microsoft Agent Framework
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {AGENT_PATTERNS.map((p) => (
            <PatternCard key={p.slug} p={p} />
          ))}
        </div>
      </section>
    </main>
  );
}
