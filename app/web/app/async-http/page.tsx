"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface AsyncStatus {
  runtimeStatus: string;
  customStatus: { step: number; totalSteps: number; progress: number } | null;
  output: { message: string; totalSteps: number } | null;
}

// Async HTTP API のライフサイクル（202 → ポーリング → 200）
const PHASES = [
  { key: "accepted", label: "202 Accepted", sub: "受付（即応答）" },
  { key: "polling", label: "ポーリング", sub: "202 実行中" },
  { key: "done", label: "200 OK", sub: "完了・結果取得" },
];

export default function AsyncHttpPage() {
  const [steps, setSteps] = useState(5);
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [status, setStatus] = useState<AsyncStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runtimeStatus = status?.runtimeStatus ?? null;
  const isCompleted =
    runtimeStatus === "Completed" ||
    runtimeStatus === "Failed" ||
    runtimeStatus === "Terminated";
  const running = !!instanceId && !isCompleted;
  const progress = status?.customStatus?.progress ?? (instanceId ? 0 : 0);
  const step = status?.customStatus?.step ?? 0;
  const totalSteps = status?.customStatus?.totalSteps ?? steps;

  // ライフサイクルの現在フェーズ index
  const phaseIndex = !instanceId ? -1 : isCompleted ? 2 : 1;

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!instanceId) return;
    stopPolling();
    const poll = async () => {
      try {
        const res = await fetch(`/api/status?instanceId=${instanceId}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as AsyncStatus;
        setStatus(data);
        if (
          data.runtimeStatus === "Completed" ||
          data.runtimeStatus === "Failed" ||
          data.runtimeStatus === "Terminated"
        ) {
          stopPolling();
        }
      } catch {
        // 一時エラーは無視
      }
    };
    poll();
    pollRef.current = setInterval(poll, 800);
    return stopPolling;
  }, [instanceId, stopPolling]);

  const handleStart = async () => {
    setError(null);
    setLoading(true);
    setStatus(null);
    setInstanceId(null);
    try {
      const res = await fetch("/api/async/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "start failed");
      setInstanceId(data.instanceId);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    stopPolling();
    setInstanceId(null);
    setStatus(null);
    setError(null);
  };

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          Async HTTP API（非同期HTTP API）
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          長時間処理を開始するとすぐに <b>202 Accepted</b>{" "}
          が返り、状態をポーリングして進捗・完了を確認するパターン。各ステップは Durable
          Timer で約2秒かかります。
        </p>
      </header>

      {/* 操作パネル */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">長時間処理を開始</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="steps" className="text-xs text-slate-500">
              ステップ数（各約2秒）
            </label>
            <input
              id="steps"
              type="number"
              min={1}
              max={20}
              value={steps}
              onChange={(e) =>
                setSteps(Math.min(20, Math.max(1, Number(e.target.value) || 1)))
              }
              disabled={loading || running}
              className="w-28 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none disabled:bg-slate-100"
            />
          </div>
          <Button onClick={handleStart} disabled={loading || running}>
            処理を開始（202）
          </Button>
          {instanceId && (
            <Button variant="outline" onClick={handleReset} disabled={loading}>
              リセット
            </Button>
          )}
        </CardContent>
      </Card>

      {/* ライフサイクル + 進捗バー */}
      {instanceId && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">非同期ライフサイクル</CardTitle>
              {runtimeStatus && (
                <Badge
                  className={
                    running
                      ? "bg-blue-600"
                      : runtimeStatus === "Completed"
                        ? "bg-green-600"
                        : "bg-slate-500"
                  }
                >
                  {running ? "202 Running" : "200 " + runtimeStatus}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* フェーズ */}
            <div className="flex items-stretch gap-2">
              {PHASES.map((p, i) => (
                <div key={p.key} className="flex flex-1 items-center gap-2">
                  <div
                    className={cn(
                      "flex min-w-0 flex-1 flex-col items-center rounded-lg border px-2 py-2 text-center transition-all",
                      i === phaseIndex && !isCompleted &&
                        "border-blue-500 bg-blue-50 ring-2 ring-blue-200",
                      i === 2 && isCompleted &&
                        "border-green-500 bg-green-50 ring-2 ring-green-200",
                      i < phaseIndex && "border-slate-300 bg-slate-100 text-slate-500",
                      i > phaseIndex && "border-slate-200 bg-white text-slate-400"
                    )}
                  >
                    <span className="text-xs font-semibold">{p.label}</span>
                    <span className="mt-0.5 text-[10px] opacity-70">{p.sub}</span>
                  </div>
                  {i < PHASES.length - 1 && (
                    <span className="text-slate-300">→</span>
                  )}
                </div>
              ))}
            </div>

            {/* 進捗バー */}
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                <span>
                  {isCompleted
                    ? "完了"
                    : running
                      ? `処理中… step ${step}/${totalSteps}`
                      : "開始中…"}
                </span>
                <span className="font-mono font-semibold">{progress}%</span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    isCompleted ? "bg-green-500" : "bg-blue-500"
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 結果 */}
      {status?.output && (
        <Card className="border-green-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">結果（200 OK）</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-green-700">
            ✅ {status.output.message}
          </CardContent>
        </Card>
      )}

      {instanceId && (
        <p className="text-center font-mono text-[11px] text-slate-400">
          instanceId: {instanceId}
        </p>
      )}

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          エラー: {error}
        </p>
      )}
    </main>
  );
}
