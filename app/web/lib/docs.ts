import fs from "fs";
import path from "path";
import { PATTERNS } from "@/lib/patterns";

/**
 * docs/ ディレクトリの絶対パスを解決する。
 * リポジトリ構成: <repo>/docs, <repo>/app/web（Next の cwd）。
 * 複数候補を試し、存在するものを返す。
 */
function resolveDocsDir(): string {
  const candidates = [
    path.resolve(process.cwd(), "..", "..", "docs"), // dev: app/web から
    path.resolve(process.cwd(), "docs"), // 念のため
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return candidates[0];
}

/** slug から Markdown の内容を読み込む。存在しなければ null。 */
export function readDocBySlug(slug: string): { title: string; content: string } | null {
  const pattern = PATTERNS.find((p) => p.slug === slug && p.doc);
  if (!pattern?.doc) return null;

  const filePath = path.join(resolveDocsDir(), pattern.doc);
  if (!fs.existsSync(filePath)) return null;

  const content = fs.readFileSync(filePath, "utf-8");
  return { title: pattern.title, content };
}
