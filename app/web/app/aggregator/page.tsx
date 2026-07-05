"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface AggState {
  key: string;
  exists: boolean;
  count: number;
  sum: number;
  avg: number | null;
  min: number | null;
  max: number | null;
  last: number | null;
}

export default function AggregatorPage() {
  const [key, setKey] = useState("sensor-1");
  const [value, setValue] = useState(10);
  const [state, setState] = useState<AggState | null>(null);
  const [events, setEvents] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (k: string) => {
      try {
        const res = await fetch(`/api/aggregator/${encodeURIComponent(k)}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as AggState;
        setState(data);
      } catch {
        // 無視
      }
    },
    []
  );

  // キー変更時に現在状態を取得
  useEffect(() => {
    refresh(key);
    setEvents([]);
  }, [key, refresh]);

  const handleAdd = async (v: number) => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/aggregator/${encodeURIComponent(key)}/add`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: v }),
        }
      );
      if (!res.ok) throw new Error((await res.json()).error ?? "add failed");
      setEvents((prev) => [v, ...prev].slice(0, 20));
      // エンティティは直列処理のため少し待ってから取得
      setTimeout(() => refresh(key), 600);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/aggregator/${encodeURIComponent(key)}/reset`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error((await res.json()).error ?? "reset failed");
      setEvents([]);
      setTimeout(() => refresh(key), 600);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const stat = (label: string, val: string | number | null) => (
    <div className="rounded-lg border border-slate-200 p-3 text-center">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="mt-0.5 font-mono text-lg font-bold text-slate-800">
        {val === null ? "—" : val}
      </div>
    </div>
  );

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          Aggregator（集約 / Durable Entities）
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          時間をまたいで届くイベントを1つの状態に集約するパターン。Durable Entity
          が操作を直列処理するので、競合せず安全に集計できます。
          <b> key</b> ごとに独立して集約されます。
        </p>
      </header>

      {/* 操作パネル */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">イベントを送信</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="key" className="text-xs text-slate-500">
              集約キー（例: センサーID）
            </label>
            <input
              id="key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              disabled={loading}
              className="w-40 rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="value" className="text-xs text-slate-500">
              値
            </label>
            <input
              id="value"
              type="number"
              value={value}
              onChange={(e) => setValue(Number(e.target.value) || 0)}
              disabled={loading}
              className="w-28 rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            />
          </div>
          <Button onClick={() => handleAdd(value)} disabled={loading || !key}>
            add（送信）
          </Button>
          <Button
            variant="outline"
            onClick={() => handleAdd(Math.floor(Math.random() * 100) + 1)}
            disabled={loading || !key}
          >
            ランダム値を add
          </Button>
          <Button
            variant="destructive"
            onClick={handleReset}
            disabled={loading || !key}
          >
            reset
          </Button>
        </CardContent>
      </Card>

      {/* 集約状態 */}
      <Card className="border-green-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              集約状態（key: <span className="font-mono">{key}</span>）
            </CardTitle>
            <Badge className="bg-slate-600">
              {state?.exists ? "存在" : "未作成"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {stat("count", state?.count ?? 0)}
          {stat("sum", state?.sum ?? 0)}
          {stat(
            "avg",
            state?.avg !== null && state?.avg !== undefined
              ? Math.round((state.avg + Number.EPSILON) * 100) / 100
              : null
          )}
          {stat("min", state?.min ?? null)}
          {stat("max", state?.max ?? null)}
          {stat("last", state?.last ?? null)}
        </CardContent>
      </Card>

      {/* 送信したイベントの履歴 */}
      {events.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              送信したイベント（新しい順）
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {events.map((v, i) => (
              <span
                key={i}
                className="rounded bg-blue-100 px-2 py-0.5 font-mono text-xs text-blue-700"
              >
                {v}
              </span>
            ))}
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
