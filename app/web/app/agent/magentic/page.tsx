"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MagenticResult {
  manager: string;
  participants: string[];
  maxRounds: number;
  messages: { author: string; text: string }[];
  final: string;
}

const AUTHOR_LABEL: Record<string, string> = {
  manager: "マネージャー",
  researcher: "調査担当",
  writer: "文章担当",
};

export default function MagenticPage() {
  const [prompt, setPrompt] = useState(
    "電気自動車を社用車に導入すべきか、利点と注意点を調べてまとめて。"
  );
  const [result, setResult] = useState<MagenticResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch("/api/agent/magentic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      setResult(data as MagenticResult);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          Magentic（動的指揮）
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Manager Agent
          が、次に動かす Agent（調査・文章化）を状況に応じて動的に決めながらタスクを進めるパターン。手順が固定できない複雑な調査・分析向け（gpt-5-mini）。
        </p>
      </header>

      {/* 入力 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">タスク</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={loading}
            rows={3}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none disabled:bg-slate-100"
          />
          <Button onClick={handleRun} disabled={loading || !prompt.trim()}>
            {loading ? "実行中…（Manager が動的に指揮）" : "Magentic 実行"}
          </Button>
        </CardContent>
      </Card>

      {/* 指揮構造 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">動的オーケストレーション</CardTitle>
            {loading ? (
              <Badge className="bg-blue-600">実行中</Badge>
            ) : result ? (
              <Badge className="bg-green-600">完了</Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-2">
            <div
              className={cn(
                "rounded-lg border px-4 py-2 text-center text-sm font-semibold",
                loading
                  ? "border-blue-400 bg-blue-50 text-blue-800"
                  : result
                    ? "border-green-400 bg-green-50 text-green-800"
                    : "border-slate-200 bg-white text-slate-500"
              )}
            >
              🧭 Manager（動的に次の Agent を決定）
            </div>
            <div className="text-slate-300">↓ 動的に指名 ↓</div>
            <div className="flex gap-3">
              {["researcher", "writer"].map((name) => (
                <div
                  key={name}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs",
                    loading
                      ? "border-blue-300 bg-blue-50"
                      : result
                        ? "border-slate-300 bg-slate-100 text-slate-600"
                        : "border-slate-200 bg-white text-slate-400"
                  )}
                >
                  {AUTHOR_LABEL[name] ?? name}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 最終成果 */}
      {result && (
        <Card className="border-green-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">最終成果</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
              {result.final}
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          エラー: {error}
        </p>
      )}
    </main>
  );
}
