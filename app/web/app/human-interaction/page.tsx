"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { OrchestrationCard } from "@/components/OrchestrationCard";

interface Instance {
  instanceId: string;
  key: string;
}

export default function HumanInteractionPage() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/start", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "start failed");
      // 新しい承認待ちをリスト先頭に追加（並列に複数保持）
      setInstances((prev) => [
        { instanceId: data.instanceId, key: `${data.instanceId}-${Date.now()}` },
        ...prev,
      ]);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setInstances([]);
    setError(null);
  };

  const waitingCount = instances.length;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          Human interaction（人間参加型）
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          外部イベントを待ち、承認・拒否で再開するパターン。
          「Start」を押すたびに承認待ちが1件追加され、並列に処理できます（拒否すると承認されるまでやり直し）。
        </p>
      </header>

      {/* 操作バー */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={handleStart} disabled={loading}>
          DurableFunctions Start
        </Button>
        {instances.length > 0 && (
          <Button variant="outline" onClick={handleClear} disabled={loading}>
            一覧をクリア
          </Button>
        )}
        <span className="ml-auto text-sm text-slate-500">
          承認待ちリスト: <span className="font-semibold">{waitingCount}</span> 件
        </span>
      </div>

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          エラー: {error}
        </p>
      )}

      {/* 承認待ちリスト */}
      {instances.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center text-sm text-slate-400">
          まだ承認待ちはありません。「DurableFunctions Start」で追加してください。
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {instances.map((inst, i) => (
            <OrchestrationCard
              key={inst.key}
              instanceId={inst.instanceId}
              index={instances.length - 1 - i}
            />
          ))}
        </div>
      )}

      <footer className="mt-4 text-center text-xs text-slate-400">
        バックエンド: Azure Functions (Durable) / フロント: Next.js + Tailwind +
        shadcn/ui
      </footer>
    </main>
  );
}
