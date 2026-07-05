"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChainFlow } from "@/components/ChainFlow";

interface ChainStatus {
  runtimeStatus: string;
  customStatus: { step: number; label: string } | null;
  output: { name: string; recordId: string; message: string } | null;
}

interface Props {
  instanceId: string;
  index: number;
  name: string;
}

/**
 * 1件の Function chaining インスタンスを自己完結で管理するカード。
 * 自身の instanceId をポーリングし、チェーンの進行と結果を表示する。
 */
export function ChainCard({ instanceId, index, name }: Props) {
  const [status, setStatus] = useState<ChainStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runtimeStatus = status?.runtimeStatus ?? null;
  const isCompleted =
    runtimeStatus === "Completed" ||
    runtimeStatus === "Failed" ||
    runtimeStatus === "Terminated";
  const currentStep = status?.customStatus?.step ?? 1;

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
        const data = (await res.json()) as ChainStatus;
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

  return (
    <Card
      className={
        isCompleted && runtimeStatus === "Completed"
          ? "border-green-300"
          : runtimeStatus === "Running"
            ? "border-blue-300"
            : undefined
      }
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <span className="text-slate-400">#{index + 1}</span>
            <span className="text-slate-700">{name}</span>
            <span className="font-mono text-xs text-slate-400">
              {instanceId.slice(0, 12)}…
            </span>
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

      <CardContent className="space-y-3">
        <ChainFlow currentStep={currentStep} completed={isCompleted} />

        <div className="text-xs">
          {status?.output ? (
            <span className="text-green-700">
              ✅ {status.output.message}（レコードID:{" "}
              <span className="font-mono">{status.output.recordId}</span>）
            </span>
          ) : (
            <span className="text-slate-400">
              {status?.customStatus?.label
                ? `${status.customStatus.label}…`
                : "開始中…"}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
