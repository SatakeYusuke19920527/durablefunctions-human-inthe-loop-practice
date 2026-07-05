"use client";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { DOC_TO_SLUG } from "@/lib/patterns";

/**
 * ドキュメント内リンクをアプリ内ルートへ変換する。
 *  - ./DF-xxx.md → /docs/<slug>
 *  - ./README.md → /（ホーム）
 *  - それ以外（http〜）は外部リンク
 */
function resolveHref(href: string | undefined): {
  href: string;
  external: boolean;
} {
  if (!href) return { href: "#", external: false };
  if (/^https?:\/\//.test(href)) return { href, external: true };

  const file = href.replace(/^\.\//, "").split("/").pop() ?? href;
  if (file.toLowerCase() === "readme.md") return { href: "/", external: false };
  const slug = DOC_TO_SLUG[file];
  if (slug) return { href: `/docs/${slug}`, external: false };
  // アンカーやその他はそのまま
  return { href, external: false };
}

export function MarkdownView({ content }: { content: string }) {
  return (
    <article
      className="prose prose-slate max-w-none
        prose-headings:scroll-mt-20
        prose-h1:text-2xl prose-h1:font-bold
        prose-h2:mt-10 prose-h2:border-b prose-h2:border-slate-200 prose-h2:pb-2
        prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
        prose-code:rounded prose-code:bg-slate-100 prose-code:px-1 prose-code:py-0.5
        prose-code:font-normal prose-code:text-slate-800 prose-code:before:content-none
        prose-code:after:content-none
        prose-pre:bg-slate-900 prose-pre:text-slate-100
        prose-table:text-sm prose-th:bg-slate-50
        prose-blockquote:border-l-blue-400 prose-blockquote:bg-blue-50/40
        prose-blockquote:py-0.5 prose-blockquote:not-italic"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          a: ({ href, children }) => {
            const { href: to, external } = resolveHref(href as string);
            if (external) {
              return (
                <a href={to} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              );
            }
            return <Link href={to}>{children}</Link>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}
