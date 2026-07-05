import { getPattern } from "@/lib/patterns";

/** 未実装パターン用のプレースホルダー表示。 */
export function ComingSoon({ slug }: { slug: string }) {
  const p = getPattern(slug);
  if (!p) return null;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
      <header>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{p.title}</h1>
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-500">
            未実装
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">{p.description}</p>
      </header>

      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center">
        <div className="text-4xl">🚧</div>
        <p className="mt-3 text-sm font-medium text-slate-600">
          このパターンはまだ実装されていません
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Coming soon — 今後ここに実装を追加していきます。
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 p-5 text-sm">
        <h2 className="mb-2 font-semibold text-slate-700">概要</h2>
        <dl className="space-y-2">
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-slate-400">説明</dt>
            <dd className="text-slate-700">{p.description}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-slate-400">具体例</dt>
            <dd className="text-slate-700">{p.example}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
