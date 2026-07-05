import Link from "next/link";
import { notFound } from "next/navigation";
import { readDocBySlug } from "@/lib/docs";
import { getPattern, ALL_PATTERNS, patternRoute } from "@/lib/patterns";
import { MarkdownView } from "@/components/MarkdownView";

export function generateStaticParams() {
  return ALL_PATTERNS.filter((p) => p.doc).map((p) => ({ slug: p.slug }));
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const doc = readDocBySlug(slug);
  const pattern = getPattern(slug);
  if (!doc || !pattern) {
    notFound();
  }
  const backHref = patternRoute(pattern);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 上部バー */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
          <Link
            href={backHref}
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
          >
            <span>←</span> {pattern.title} に戻る
          </Link>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-500">
            📄 ドキュメント
          </span>
        </div>
      </div>

      {/* 本文 */}
      <div className="mx-auto max-w-3xl px-6 py-10">
        <MarkdownView content={doc.content} />

        <div className="mt-12 border-t border-slate-200 pt-6">
          <Link
            href={backHref}
            className="text-sm text-blue-600 hover:underline"
          >
            ← {pattern.title} のデモに戻る
          </Link>
        </div>
      </div>
    </div>
  );
}
