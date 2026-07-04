"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FlowDiagram } from "@/components/FlowDiagram";
import { StageKey, OrchestrationStatus } from "@/lib/stages";

export default function Home() {
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [status, setStatus] = useState<OrchestrationStatus | null>(null);
  const [decisionSent, setDecisionSent] = useState(false);
  const [decision, setDecision] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runtimeStatus = status?.runtimeStatus ?? null;
  const isCompleted =
    runtimeStatus === "Completed" ||
    runtimeStatus === "Failed" ||
    runtimeStatus === "Terminated";
  const approved = status?.output?.approved ?? null;

  // 現在のステージを算出
  const stage: StageKey = (() => {
    if (!instanceId) return "idle";
    if (isCompleted) return "completed";
    if (decisionSent) return "processing";
    if (runtimeStatus === "Running") return "waiting";
    return "started";
  })();

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // ステータスのポーリング
  useEffect(() => {
    if (!instanceId) return;
    stopPolling();
    const poll = async () => {
      try {
        const res = await fetch(`/api/status?instanceId=${instanceId}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as OrchestrationStatus;
        setStatus(data);
        if (
          data.runtimeStatus === "Completed" ||
          data.runtimeStatus === "Failed" ||
          data.runtimeStatus === "Terminated"
        ) {
          stopPolling();
        }
      } catch {
        // ネットワーク一時エラーは無視して次のポーリングへ
      }
    };
    poll();
    pollRef.current = setInterval(poll, 1500);
    return stopPolling;
  }, [instanceId, stopPolling]);

  const handleStart = async () => {
    setError(null);
    setLoading(true);
    setStatus(null);
    setDecisionSent(false);
    setDecision(null);
    try {
      const res = await fetch("/api/start", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "start failed");
      setInstanceId(data.instanceId);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleDecision = async (approve: boolean) => {
    if (!instanceId) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId, approved: approve }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "approve failed");
      setDecision(approve);
      setDecisionSent(true);
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
    setDecisionSent(false);
    setDecision(null);
    setError(null);
  };

  const canDecide = stage === "waiting" && !decisionSent;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-4 py-10">
      <header className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          Durable Functions — Human-in-the-loop
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          開始 → 承認/拒否 → 処理 → 完了 の流れを可視化するデモ
        </p>
      </header>

      {/* 操作パネル */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">操作</CardTitle>
          <CardDescription>
            「DurableFunctions Start」で開始し、承認または拒否を選択します。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button
            onClick={handleStart}
            disabled={loading || (!!instanceId && !isCompleted)}
          >
            DurableFunctions Start
          </Button>

          <Button
            className="bg-green-600 hover:bg-green-700"
            onClick={() => handleDecision(true)}
            disabled={!canDecide || loading}
          >
            承認
          </Button>
          <Button
            variant="destructive"
            onClick={() => handleDecision(false)}
            disabled={!canDecide || loading}
          >
            拒否
          </Button>

          {(instanceId || error) && (
            <Button variant="outline" onClick={handleReset} disabled={loading}>
              リセット
            </Button>
          )}
        </CardContent>
      </Card>

      {/* フロー図 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">フロー</CardTitle>
          <CardDescription>現在のステージがハイライトされます。</CardDescription>
        </CardHeader>
        <CardContent>
          <FlowDiagram current={stage} approved={approved} decision={decision} />
          <p className="mt-3 text-center text-xs text-slate-400">
            現在のステージが青くハイライトされます（承認=緑 / 拒否=赤）。
          </p>
        </CardContent>
      </Card>

      {/* ステータスボックス */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">ステータス</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-28 text-slate-500">runtimeStatus</span>
            {runtimeStatus ? (
              <Badge
                className={
                  runtimeStatus === "Running"
                    ? "bg-blue-600"
                    : isCompleted && approved === true
                      ? "bg-green-600"
                      : isCompleted && approved === false
                        ? "bg-red-600"
                        : "bg-slate-500"
                }
              >
                {runtimeStatus}
              </Badge>
            ) : (
              <span className="text-slate-400">未開始</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-slate-500">instanceId</span>
            <span className="break-all font-mono text-xs text-slate-700">
              {instanceId ?? "—"}
            </span>
          </div>

          <div className="flex items-start gap-2">
            <span className="w-28 shrink-0 text-slate-500">output</span>
            <div className="flex-1">
              {status?.output ? (
                <div
                  className={
                    "rounded-lg border p-3 " +
                    (status.output.approved
                      ? "border-green-300 bg-green-50 text-green-800"
                      : "border-red-300 bg-red-50 text-red-800")
                  }
                >
                  <div className="font-semibold">
                    {status.output.approved ? "✅ 承認" : "🚫 拒否"}
                  </div>
                  <div className="mt-0.5">{status.output.message}</div>
                </div>
              ) : (
                <span className="text-slate-400">
                  {stage === "waiting"
                    ? "承認/拒否の入力待ちです…"
                    : stage === "processing"
                      ? "処理中…"
                      : "—"}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          エラー: {error}
        </p>
      )}

      <footer className="mt-auto text-center text-xs text-slate-400">
        バックエンド: Azure Functions (Durable) / フロント: Next.js + Tailwind +
        shadcn/ui
      </footer>
    </main>
  );
}
