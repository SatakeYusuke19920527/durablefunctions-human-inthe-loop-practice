/**
 * Microsoft Agent Framework（Python Functions, 別ポート）と通信するヘルパー。
 * Next.js のルートハンドラ（サーバー側）から呼ぶことで CORS を回避する。
 */
const AGENT_BASE_URL = process.env.AGENT_BASE_URL ?? "http://localhost:7072";

export interface SequentialResult {
  pattern: string;
  pipeline: string[];
  prompt: string;
  messages: { author: string; text: string }[];
  final: string;
}

/** Sequential パターンを実行する（要約→レビュー→最終回答）。 */
export async function runSequential(prompt: string): Promise<SequentialResult> {
  const res = await fetch(`${AGENT_BASE_URL}/api/sequential`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error ?? `sequential failed: ${res.status}`);
  }
  return data as SequentialResult;
}

export interface ConcurrentResult {
  pattern: string;
  agents: string[];
  prompt: string;
  messages: { author: string; text: string }[];
}

/** Concurrent パターンを実行する（複数 Agent を並列実行）。 */
export async function runConcurrent(prompt: string): Promise<ConcurrentResult> {
  const res = await fetch(`${AGENT_BASE_URL}/api/concurrent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error ?? `concurrent failed: ${res.status}`);
  }
  return data as ConcurrentResult;
}
