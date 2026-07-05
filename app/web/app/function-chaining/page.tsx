"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChainCard } from "@/components/ChainCard";

interface Instance {
  instanceId: string;
  name: string;
  key: string;
}

export default function FunctionChainingPage() {
  const [name, setName] = useState("山田太郎");
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/chaining/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "start failed");
      // 新しいチェーンをリスト先頭に追加（並列に複数実行）
      setInstances((prev) => [
        {
          instanceId: data.instanceId,
          name,
          key: `${data.instanceId}-${Date.now()}`,
        },
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

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          Function chaining（関数チェーン）
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Activity を順番に呼び、前の出力を次に渡すパターン（検証 → 登録 → 通知）。
          「チェーン開始」を押すたびに1件追加され、複数を並列に実行できます。
        </p>
      </header>

      {/* 操作バー */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="name" className="text-xs text-slate-500">
            申請者名
          </label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
            className="w-56 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none disabled:bg-slate-100"
            placeholder="申請者名を入力"
          />
        </div>
        <Button onClick={handleStart} disabled={loading || !name.trim()}>
          チェーン開始
        </Button>
        {instances.length > 0 && (
          <Button variant="outline" onClick={handleClear} disabled={loading}>
            一覧をクリア
          </Button>
        )}
        <span className="ml-auto self-center text-sm text-slate-500">
          実行リスト: <span className="font-semibold">{instances.length}</span> 件
        </span>
      </div>

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          エラー: {error}
        </p>
      )}

      {/* 実行リスト */}
      {instances.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center text-sm text-slate-400">
          まだ実行はありません。「チェーン開始」で追加してください。
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {instances.map((inst, i) => (
            <ChainCard
              key={inst.key}
              instanceId={inst.instanceId}
              name={inst.name}
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
