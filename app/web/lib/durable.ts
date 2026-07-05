/**
 * Durable Functions バックエンド（func host）と通信するためのヘルパー。
 * Next.js のルートハンドラ（サーバー側）から呼ぶことで CORS を回避する。
 */
const BASE_URL = process.env.FUNCTIONS_BASE_URL ?? "http://localhost:7071";

export type RuntimeStatus =
  | "Pending"
  | "Running"
  | "Completed"
  | "Failed"
  | "Terminated"
  | "Suspended"
  | string;

export interface OrchestrationStatus {
  name: string;
  instanceId: string;
  runtimeStatus: RuntimeStatus;
  input: unknown;
  customStatus: unknown;
  output: { approved: boolean; message: string } | null;
  createdTime: string;
  lastUpdatedTime: string;
}

/** オーケストレーションを開始し instanceId を返す。 */
export async function startOrchestration(): Promise<{ instanceId: string }> {
  const res = await fetch(`${BASE_URL}/api/start`, { method: "POST" });
  if (!res.ok) {
    throw new Error(`start failed: ${res.status}`);
  }
  const data = await res.json();
  return { instanceId: data.id as string };
}

/** Function chaining を開始する（申請者名を渡す）。 */
export async function startChaining(
  name: string
): Promise<{ instanceId: string }> {
  const res = await fetch(`${BASE_URL}/api/chaining/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    throw new Error(`chaining start failed: ${res.status}`);
  }
  const data = await res.json();
  return { instanceId: data.id as string };
}

/** 承認/拒否イベントを送信する。 */
export async function sendApproval(
  instanceId: string,
  approved: boolean
): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/approve/${instanceId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approved }),
  });
  if (!res.ok) {
    throw new Error(`approve failed: ${res.status}`);
  }
}

/** インスタンスの現在ステータスを取得する。 */
export async function getStatus(
  instanceId: string
): Promise<OrchestrationStatus> {
  const url = `${BASE_URL}/runtime/webhooks/durabletask/instances/${instanceId}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`status failed: ${res.status}`);
  }
  return (await res.json()) as OrchestrationStatus;
}
