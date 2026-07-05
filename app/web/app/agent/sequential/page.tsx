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

interface SequentialResult {
  pipeline: string[];
  messages: { author: string; text: string }[];
  final: string;
}

const STEPS = [
  { key: "summarizer", label: "① 要約", sub: "summarizer" },
  { key: "reviewer", label: "② レビュー", sub: "reviewer" },
  { key: "finalizer", label: "③ 最終回答", sub: "finalizer" },
];

export default function SequentialPage() {
  const [prompt, setPrompt] = useState(
    "Azure Durable Functions と Microsoft Agent Framework の違いを初心者向けに説明して。"
  );
  const [result, setResult] = useState<SequentialResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch("/api/agent/sequential", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      setResult(data as SequentialResult);
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
          Sequential（順次オーケストレーション）
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Microsoft Agent Framework で、Agent を固定順（要約 → レビュー →
          最終回答）で実行するパターン。各段が前段の出力を踏まえて処理します。
          バックエンドは Python Functions（gpt-5-mini）。
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
            {loading ? "実行中…（LLM 呼び出し）" : "Sequential 実行"}
          </Button>
        </CardContent>
      </Card>

      {/* フロー図 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">パイプライン</CardTitle>
            {loading ? (
              <Badge className="bg-blue-600">実行中</Badge>
            ) : result ? (
              <Badge className="bg-green-600">完了</Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex w-full flex-col items-stretch gap-1.5 sm:flex-row sm:items-center">
            {STEPS.map((step, i) => {
              const done = !!result;
              return (
                <div
                  key={step.key}
                  className="flex flex-1 items-center gap-1.5 sm:min-w-0"
                >
                  <div
                    className={cn(
                      "flex min-w-0 flex-1 flex-col items-center rounded-lg border px-2 py-2 text-center transition-all",
                      done
                        ? "border-green-400 bg-green-50 text-green-800"
                        : loading
                          ? "border-blue-400 bg-blue-50 text-blue-800"
                          : "border-slate-200 bg-white text-slate-400"
                    )}
                  >
                    <span className="text-xs font-semibold">{step.label}</span>
                    <span className="mt-0.5 font-mono text-[9px] opacity-70">
                      {step.sub}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <span className="shrink-0 text-sm text-slate-300">
                      <span className="hidden sm:inline">→</span>
                      <span className="sm:hidden">↓</span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 結果 */}
      {result && (
        <Card className="border-green-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">最終回答</CardTitle>
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
