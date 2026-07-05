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

interface ConcurrentResult {
  agents: string[];
  messages: { author: string; text: string }[];
}

const AGENT_META: Record<string, { label: string; color: string }> = {
  tech: { label: "技術", color: "border-blue-300 bg-blue-50" },
  business: { label: "ビジネス", color: "border-amber-300 bg-amber-50" },
  risk: { label: "リスク", color: "border-rose-300 bg-rose-50" },
};

export default function ConcurrentPage() {
  const [prompt, setPrompt] = useState(
    "社内の問い合わせ対応に AI チャットボットを導入すべきか？"
  );
  const [result, setResult] = useState<ConcurrentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const agents = ["tech", "business", "risk"];

  const handleRun = async () => {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch("/api/agent/concurrent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      setResult(data as ConcurrentResult);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const textOf = (name: string) =>
    result?.messages.find((m) => m.author === name)?.text ?? null;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          Concurrent（並列 &amp; 集約）
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Microsoft Agent Framework で、複数の Agent
          を同じ入力に対して並列実行し、結果を集約するパターン。ここでは
          技術・ビジネス・リスクの3観点で同時分析します（gpt-5-mini）。
        </p>
      </header>

      {/* 入力 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">プロンプト</CardTitle>
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
            {loading ? "実行中…（3 Agent 並列）" : "Concurrent 実行"}
          </Button>
        </CardContent>
      </Card>

      {/* 並列フロー */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">並列実行（fan-out → 集約）</CardTitle>
            {loading ? (
              <Badge className="bg-blue-600">実行中</Badge>
            ) : result ? (
              <Badge className="bg-green-600">完了</Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            {agents.map((name) => {
              const meta = AGENT_META[name] ?? {
                label: name,
                color: "border-slate-300 bg-slate-50",
              };
              const done = !!textOf(name);
              return (
                <div
                  key={name}
                  className={cn(
                    "rounded-lg border p-2 text-center text-xs transition-all",
                    done
                      ? meta.color
                      : loading
                        ? "border-blue-300 bg-blue-50"
                        : "border-slate-200 bg-white text-slate-400"
                  )}
                >
                  <div className="font-semibold">{meta.label}</div>
                  <div className="mt-0.5 flex items-center justify-center gap-1 text-[10px]">
                    {done ? (
                      <span className="text-green-700">✅ 完了</span>
                    ) : loading ? (
                      <>
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
                        <span className="text-blue-600">分析中…</span>
                      </>
                    ) : (
                      <span>待機</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 各観点の結果 */}
      {result && (
        <div className="space-y-4">
          {agents.map((name) => {
            const text = textOf(name);
            const meta = AGENT_META[name] ?? { label: name, color: "" };
            if (!text) return null;
            return (
              <Card key={name} className={meta.color.split(" ")[0]}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    {meta.label}の観点{" "}
                    <span className="font-mono text-xs text-slate-400">
                      ({name})
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                    {text}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          エラー: {error}
        </p>
      )}
    </main>
  );
}
