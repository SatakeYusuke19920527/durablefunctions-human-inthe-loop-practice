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

interface MonitorStatus {
  runtimeStatus: string;
  customStatus: {
    phase: string;
    pollCount: number;
    lastStatus?: string;
  } | null;
  output: { result: string; pollCount: number; message: string } | null;
}

export default function MonitorPage() {
  const [interval, setIntervalSec] = useState(3);
  const [timeout, setTimeoutSec] = useState(30);
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [status, setStatus] = useState<MonitorStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runtimeStatus = status?.runtimeStatus ?? null;
  const isCompleted =
    runtimeStatus === "Completed" ||
    runtimeStatus === "Failed" ||
    runtimeStatus === "Terminated";
  const running = !!instanceId && !isCompleted;
  const pollCount = status?.customStatus?.pollCount ?? 0;
  const lastStatus = status?.customStatus?.lastStatus ?? null;
  const result = status?.output?.result ?? null;

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
        const data = (await res.json()) as MonitorStatus;
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
    pollRef.current = setInterval(poll, 700);
    return stopPolling;
  }, [instanceId, stopPolling]);

  const handleStart = async () => {
    setError(null);
    setLoading(true);
    setStatus(null);
    setInstanceId(null);
    try {
      const res = await fetch("/api/monitor/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intervalSeconds: interval,
          timeoutSeconds: timeout,
        }),
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
        <h1 className="text-2xl font-bold tracking-tight">Monitor（監視）</h1>
        <p className="mt-1 text-sm text-slate-500">
          Durable Timer で外部ジョブの状態を一定間隔で確認し、完了を検知したら終了するパターン。期限（timeout）を過ぎたら打ち切ります。
        </p>
      </header>

      {/* 操作パネル */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">監視を開始</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="interval" className="text-xs text-slate-500">
              確認間隔（秒）
            </label>
            <input
              id="interval"
              type="number"
              min={1}
              max={30}
              value={interval}
              onChange={(e) =>
                setIntervalSec(
                  Math.min(30, Math.max(1, Number(e.target.value) || 1))
                )
              }
              disabled={loading || running}
              className="w-24 rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="timeout" className="text-xs text-slate-500">
              タイムアウト（秒）
            </label>
            <input
              id="timeout"
              type="number"
              min={5}
              max={300}
              value={timeout}
              onChange={(e) =>
                setTimeoutSec(
                  Math.min(300, Math.max(5, Number(e.target.value) || 5))
                )
              }
              disabled={loading || running}
              className="w-24 rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            />
          </div>
          <Button onClick={handleStart} disabled={loading || running}>
            監視を開始
          </Button>
          {instanceId && (
            <Button variant="outline" onClick={handleReset} disabled={loading}>
              リセット
            </Button>
          )}
        </CardContent>
      </Card>

      {/* 監視状況 */}
      {instanceId && (
        <Card
          className={cn(
            isCompleted && result === "completed" && "border-green-300",
            isCompleted && result === "timeout" && "border-amber-300",
            running && "border-blue-300"
          )}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">監視状況</CardTitle>
              <Badge
                className={
                  running
                    ? "bg-blue-600"
                    : result === "completed"
                      ? "bg-green-600"
                      : result === "timeout"
                        ? "bg-amber-600"
                        : "bg-slate-500"
                }
              >
                {running
                  ? "監視中"
                  : result === "completed"
                    ? "完了検知"
                    : result === "timeout"
                      ? "タイムアウト"
                      : runtimeStatus}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 確認回数のカウンタ */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                {running && (
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-blue-500" />
                )}
                <span className="text-sm text-slate-500">確認回数</span>
              </div>
              <span className="font-mono text-2xl font-bold text-slate-800">
                {pollCount}
              </span>
              <span className="text-xs text-slate-400">
                （{interval}秒ごとに確認 / {timeout}秒で打ち切り）
              </span>
            </div>

            {/* ポーリングのドット表示 */}
            {pollCount > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: pollCount }, (_, i) => {
                  const isLast = i === pollCount - 1;
                  const done = isCompleted && result === "completed" && isLast;
                  return (
                    <span
                      key={i}
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold",
                        done
                          ? "bg-green-500 text-white"
                          : "bg-slate-200 text-slate-500"
                      )}
                      title={`${i + 1}回目`}
                    >
                      {done ? "✓" : i + 1}
                    </span>
                  );
                })}
              </div>
            )}

            <div className="text-sm">
              <span className="text-slate-500">直近の状態: </span>
              <span
                className={cn(
                  "font-medium",
                  lastStatus === "Completed"
                    ? "text-green-700"
                    : "text-blue-700"
                )}
              >
                {lastStatus ?? "—"}
              </span>
            </div>

            {status?.output && (
              <div
                className={cn(
                  "rounded-lg border p-3 text-sm",
                  result === "completed"
                    ? "border-green-300 bg-green-50 text-green-800"
                    : "border-amber-300 bg-amber-50 text-amber-800"
                )}
              >
                {result === "completed" ? "✅ " : "⏰ "}
                {status.output.message}
              </div>
            )}
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
