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

interface HandoffResult {
  pattern: "handoff";
  start: string;
  agents: string[];
  handedTo: string | null;
  prompt: string;
  messages: { author: string; text: string }[];
  final: string;
}

const SPECIALISTS = [
  {
    key: "billing",
    label: "請求・支払い",
    sub: "billing",
    active: "border-amber-400 bg-amber-50 text-amber-900 shadow-sm",
  },
  {
    key: "tech",
    label: "技術・不具合",
    sub: "tech",
    active: "border-blue-400 bg-blue-50 text-blue-900 shadow-sm",
  },
];

export default function HandoffPage() {
  const [prompt, setPrompt] = useState(
    "請求書の金額が請求先と違います。どうすればいいですか？"
  );
  const [result, setResult] = useState<HandoffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch("/api/agent/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      setResult(data as HandoffResult);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const routedTo = result?.handedTo ?? null;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          Handoff（トリアージ → 専門家）
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Microsoft Agent Framework で、triage Agent が問い合わせ内容を判断し、
          請求・支払いは billing、技術・不具合は tech に制御を渡すパターン。
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
            {loading ? "振り分け中…（LLM 呼び出し）" : "Handoff 実行"}
          </Button>
        </CardContent>
      </Card>

      {/* ルーティング */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">ルーティング</CardTitle>
            {loading ? (
              <Badge className="bg-blue-600">振り分け中</Badge>
            ) : result ? (
              <Badge className="bg-green-600">完了</Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div
              className={cn(
                "rounded-lg border px-4 py-3 text-center transition-all sm:w-44",
                loading
                  ? "border-blue-400 bg-blue-50 text-blue-800"
                  : result
                    ? "border-green-400 bg-green-50 text-green-800"
                    : "border-slate-200 bg-white text-slate-500"
              )}
            >
              <div className="text-sm font-semibold">triage</div>
              <div className="mt-0.5 text-[10px] opacity-70">一次受付</div>
              {loading && (
                <div className="mt-2 flex items-center justify-center gap-1 text-[10px] text-blue-600">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
                  振り分け中…
                </div>
              )}
            </div>

            <div className="text-center text-slate-300 sm:w-8">→</div>

            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              {SPECIALISTS.map((agent) => {
                const active = routedTo === agent.key;
                return (
                  <div
                    key={agent.key}
                    className={cn(
                      "rounded-lg border px-4 py-3 text-center transition-all",
                      active
                        ? agent.active
                        : loading
                          ? "border-slate-200 bg-slate-50 text-slate-500"
                          : "border-slate-200 bg-white text-slate-400"
                    )}
                  >
                    <div className="text-sm font-semibold">{agent.label}</div>
                    <div className="mt-0.5 font-mono text-[10px] opacity-70">
                      {agent.sub}
                    </div>
                    <div className="mt-2 text-[10px]">
                      {active ? (
                        <span className="text-green-700">✅ handoff 済み</span>
                      ) : loading ? (
                        <span>候補</span>
                      ) : (
                        <span>待機</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 結果 */}
      {result && (
        <Card className="border-green-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              最終回答
              {result.handedTo && (
                <span className="ml-2 font-mono text-xs text-slate-400">
                  by {result.handedTo}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
              {result.final}
            </div>
            {result.messages.length > 0 && (
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <div className="text-xs font-semibold text-slate-500">
                  Agent メッセージ
                </div>
                {result.messages.map((message, index) => (
                  <div key={`${message.author}-${index}`} className="text-xs">
                    <Badge className="mr-2 bg-slate-600">{message.author}</Badge>
                    <span className="whitespace-pre-wrap text-slate-700">
                      {message.text}
                    </span>
                  </div>
                ))}
              </div>
            )}
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
