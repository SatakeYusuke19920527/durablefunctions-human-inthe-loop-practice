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

type GroupChatAuthor = "pro" | "con";

interface GroupChatMessage {
  author: GroupChatAuthor;
  text: string;
}

interface GroupChatResult {
  pattern: "group_chat";
  agents: GroupChatAuthor[];
  moderator: "moderator";
  maxRounds: number;
  prompt: string;
  messages: GroupChatMessage[];
}

const AUTHOR_META: Record<
  GroupChatAuthor,
  {
    label: string;
    sub: string;
    bubble: string;
    badge: string;
    align: string;
  }
> = {
  pro: {
    label: "賛成派",
    sub: "pro",
    bubble: "border-emerald-200 bg-emerald-50 text-emerald-950",
    badge: "bg-emerald-600",
    align: "items-start",
  },
  con: {
    label: "反対派",
    sub: "con",
    bubble: "border-rose-200 bg-rose-50 text-rose-950",
    badge: "bg-rose-600",
    align: "items-end",
  },
};

export default function GroupChatPage() {
  const [prompt, setPrompt] = useState("週4日勤務は導入すべきか？");
  const [result, setResult] = useState<GroupChatResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch("/api/agent/group-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      setResult(data as GroupChatResult);
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
          Group Chat（共有会話による討議）
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Microsoft Agent Framework で、moderator が pro（賛成派）/ con（反対派）
          の発話順を進行し、共有コンテキスト上で議論するパターンです（gpt-5-mini）。
        </p>
      </header>

      {/* 入力 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">議論トピック</CardTitle>
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
            {loading ? "議論中…" : "Group Chat 実行"}
          </Button>
        </CardContent>
      </Card>

      {/* 進行 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">討議フロー</CardTitle>
            {loading ? (
              <Badge className="bg-blue-600">議論中</Badge>
            ) : result ? (
              <Badge className="bg-green-600">完了</Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center text-xs text-emerald-900">
              <div className="font-semibold">賛成派</div>
              <div className="mt-0.5 font-mono text-[10px] opacity-70">pro</div>
            </div>
            <div className="flex flex-col items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-xs">
              <span className="font-semibold text-slate-700">moderator</span>
              <span className="text-[10px] text-slate-500">発話者を選択</span>
              {loading && (
                <span className="mt-1 h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
              )}
            </div>
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-center text-xs text-rose-900">
              <div className="font-semibold">反対派</div>
              <div className="mt-0.5 font-mono text-[10px] opacity-70">con</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 討議ログ */}
      <Card className={cn(result ? "border-slate-300" : "")}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">討議スレッド</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
              議論中…
            </div>
          )}

          {!loading && !result && (
            <p className="text-sm text-slate-500">
              トピックを入力して Group Chat を実行すると、賛成派と反対派の発言が順番に表示されます。
            </p>
          )}

          {result && (
            <div className="space-y-4">
              <div className="text-xs text-slate-500">
                maxRounds: {result.maxRounds} / moderator: {result.moderator}
              </div>
              {result.messages.map((message, index) => {
                const meta = AUTHOR_META[message.author];
                const isCon = message.author === "con";
                return (
                  <div
                    key={`${message.author}-${index}`}
                    className={cn("flex flex-col", meta.align)}
                  >
                    <div
                      className={cn(
                        "flex max-w-[85%] flex-col gap-1 rounded-2xl border px-4 py-3 shadow-sm",
                        isCon ? "rounded-tr-sm" : "rounded-tl-sm",
                        meta.bubble
                      )}
                    >
                      <div
                        className={cn(
                          "flex items-center gap-2",
                          isCon ? "justify-end" : "justify-start"
                        )}
                      >
                        <Badge className={cn("text-[10px]", meta.badge)}>
                          {meta.label}
                        </Badge>
                        <span className="font-mono text-[10px] opacity-60">
                          {meta.sub}
                        </span>
                      </div>
                      <div className="whitespace-pre-wrap text-sm leading-relaxed">
                        {message.text}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          エラー: {error}
        </p>
      )}
    </main>
  );
}
