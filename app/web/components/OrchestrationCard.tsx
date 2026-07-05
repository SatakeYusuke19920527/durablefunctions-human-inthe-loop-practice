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
import { FlowDiagram } from "@/components/FlowDiagram";
import { StageKey, OrchestrationStatus } from "@/lib/stages";

interface Props {
  instanceId: string;
  index: number;
}

/**
 * 1件のオーケストレーション（承認待ち）を自己完結で管理するカード。
 * サーバーの customStatus.phase / attempts を元に現在ステージを判定する。
 * 拒否されると同じインスタンスがループして再び承認待ちに戻る（attempts が増える）。
 */
export function OrchestrationCard({ instanceId, index }: Props) {
  const [status, setStatus] = useState<OrchestrationStatus | null>(null);
  // 承認/拒否を送信済みの試行番号（この attempts に対しては入力済み）
  const [decidedAttempt, setDecidedAttempt] = useState<number | null>(null);
  // 直近に押した選択（フロー図③の色分け用）
  const [decision, setDecision] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runtimeStatus = status?.runtimeStatus ?? null;
  const phase = status?.customStatus?.phase ?? null;
  const attempts = status?.customStatus?.attempts ?? 1;
  const isCompleted =
    runtimeStatus === "Completed" ||
    runtimeStatus === "Failed" ||
    runtimeStatus === "Terminated";
  const approved = status?.output?.approved ?? null;

  // customStatus.phase を優先してステージを判定
  const stage: StageKey = (() => {
    if (isCompleted) return "completed";
    if (phase === "processing") return "processing";
    // waiting / rejected_retry / (customStatus未反映) は承認待ち扱い
    if (runtimeStatus === "Running") return "waiting";
    return "started";
  })();

  // 新しい試行（拒否でループして attempts が増えた）に入ったら選択をリセット
  useEffect(() => {
    if (decidedAttempt !== null && attempts > decidedAttempt) {
      setDecidedAttempt(null);
      setDecision(null);
    }
  }, [attempts, decidedAttempt]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
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
        // 一時エラーは無視
      }
    };
    poll();
    pollRef.current = setInterval(poll, 1500);
    return stopPolling;
  }, [instanceId, stopPolling]);

  const handleDecision = async (approve: boolean) => {
    setError(null);
    setLoading(true);
    setDecision(approve);
    setDecidedAttempt(attempts);
    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId, approved: approve }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "approve failed");
    } catch (e) {
      setError(String(e));
      setDecidedAttempt(null);
      setDecision(null);
    } finally {
      setLoading(false);
    }
  };

  // この試行に対してまだ入力しておらず、承認待ちのときだけ操作可能
  const canDecide =
    stage === "waiting" && decidedAttempt !== attempts && !loading;

  const showRetryMessage =
    !status?.output &&
    attempts > 1 &&
    stage === "waiting" &&
    decidedAttempt !== attempts;

  return (
    <Card
      className={
        stage === "completed" && approved === true
          ? "border-green-300"
          : stage === "waiting"
            ? "border-blue-300"
            : undefined
      }
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <span className="text-slate-400">#{index + 1}</span>
            <span className="font-mono text-xs text-slate-600">
              {instanceId.slice(0, 12)}…
            </span>
            {attempts > 1 && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                ↺ {attempts}回目
              </span>
            )}
          </CardTitle>
          {runtimeStatus && (
            <Badge
              className={
                runtimeStatus === "Running"
                  ? "bg-blue-600"
                  : isCompleted && approved === true
                    ? "bg-green-600"
                    : "bg-slate-500"
              }
            >
              {runtimeStatus}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <FlowDiagram current={stage} approved={approved} decision={decision} />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700"
            onClick={() => handleDecision(true)}
            disabled={!canDecide}
          >
            承認
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => handleDecision(false)}
            disabled={!canDecide}
          >
            拒否
          </Button>

          <div className="ml-auto text-xs">
            {status?.output ? (
              <span className="text-green-700">
                ✅ {status.output.message}
                {status.output.attempts && status.output.attempts > 1
                  ? `（${status.output.attempts}回目で承認）`
                  : ""}
              </span>
            ) : showRetryMessage ? (
              <span className="text-amber-700">
                🚫 拒否されました。最初からやり直します…
              </span>
            ) : (
              <span className="text-slate-400">
                {stage === "waiting"
                  ? "承認/拒否の入力待ち…"
                  : stage === "processing"
                    ? "処理中…"
                    : "開始中…"}
              </span>
            )}
          </div>
        </div>

        {error && <p className="text-xs text-red-600">エラー: {error}</p>}
      </CardContent>
    </Card>
  );
}
