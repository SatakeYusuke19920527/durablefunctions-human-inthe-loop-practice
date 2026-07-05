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
import { FanOutFlow, FileResult } from "@/components/FanOutFlow";

interface FanOutStatus {
  runtimeStatus: string;
  customStatus: { phase: string; total: number } | null;
  output: {
    totalFiles: number;
    totalWords: number;
    details: FileResult[];
  } | null;
}

export default function FanOutFanInPage() {
  const [count, setCount] = useState(5);
  const [files, setFiles] = useState<string[]>([]);
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [status, setStatus] = useState<FanOutStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runtimeStatus = status?.runtimeStatus ?? null;
  const isCompleted =
    runtimeStatus === "Completed" ||
    runtimeStatus === "Failed" ||
    runtimeStatus === "Terminated";
  const running = !!instanceId && !isCompleted;

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
        const data = (await res.json()) as FanOutStatus;
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
    // 指定した並列数ぶんのファイル名を生成
    const generated = Array.from(
      { length: count },
      (_, i) => `file${i + 1}.txt`
    );
    setFiles(generated);
    try {
      const res = await fetch("/api/fanout/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: generated }),
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
    setFiles([]);
    setError(null);
  };

  const doneCount = status?.output?.details?.length ?? 0;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          Fan-out / Fan-in（並列 &amp; 集約）
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          複数の Activity を並列に一斉起動（fan-out）し、Task.all
          で全完了を待って集約（fan-in）するパターン。各ファイルの分析は約3秒ですが、並列なので全体も約3秒で完了します。
        </p>
      </header>

      {/* 操作パネル */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">並列分析を開始</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="count" className="text-xs text-slate-500">
              並列数（ファイル数）
            </label>
            <input
              id="count"
              type="number"
              min={1}
              max={12}
              value={count}
              onChange={(e) =>
                setCount(Math.min(12, Math.max(1, Number(e.target.value) || 1)))
              }
              disabled={loading || running}
              className="w-28 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none disabled:bg-slate-100"
            />
          </div>
          <Button onClick={handleStart} disabled={loading || running}>
            並列実行スタート
          </Button>
          {instanceId && (
            <Button variant="outline" onClick={handleReset} disabled={loading}>
              リセット
            </Button>
          )}
          <span className="ml-auto self-center text-sm text-slate-500">
            {running ? (
              <span className="text-blue-600">
                {files.length} 件を並列実行中…
              </span>
            ) : isCompleted ? (
              <span className="text-green-600">
                {doneCount} 件を並列処理して集約完了
              </span>
            ) : (
              <span>並列数を選んでスタート</span>
            )}
          </span>
        </CardContent>
      </Card>

      {/* フロー図 */}
      {instanceId && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                並列フロー（{files.length} 並列）
              </CardTitle>
              {runtimeStatus && (
                <Badge
                  className={
                    runtimeStatus === "Running"
                      ? "bg-blue-600"
                      : runtimeStatus === "Completed"
                        ? "bg-green-600"
                        : "bg-slate-500"
                  }
                >
                  {runtimeStatus}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <FanOutFlow
              files={files}
              running={running}
              completed={isCompleted}
              details={status?.output?.details ?? null}
              totalWords={status?.output?.totalWords ?? null}
            />
          </CardContent>
        </Card>
      )}

      {/* 集約結果 */}
      {status?.output && (
        <Card className="border-green-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">集約結果（fan-in）</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex gap-3">
              <span className="w-28 shrink-0 text-slate-500">ファイル数</span>
              <span className="text-slate-800">
                {status.output.totalFiles} 件（並列処理）
              </span>
            </div>
            <div className="flex gap-3">
              <span className="w-28 shrink-0 text-slate-500">合計単語数</span>
              <span className="font-semibold text-green-700">
                {status.output.totalWords} words
              </span>
            </div>
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
