export type StageKey =
  | "idle"
  | "started"
  | "waiting"
  | "decision_sent"
  | "processing"
  | "completed";

export interface CustomStatus {
  phase: "waiting" | "processing" | "rejected_retry";
  attempts: number;
}

export interface OrchestrationStatus {
  name: string;
  instanceId: string;
  runtimeStatus: string;
  customStatus: CustomStatus | null;
  output: { approved: boolean; message: string; attempts?: number } | null;
  createdTime: string;
  lastUpdatedTime: string;
}

/** フロー図で表示する各ステージの定義。 */
export const STAGES: { key: StageKey; label: string; sub: string }[] = [
  { key: "started", label: "① 開始", sub: "httpStart" },
  { key: "waiting", label: "② 承認待ち", sub: "waitForExternalEvent" },
  { key: "decision_sent", label: "③ 承認/拒否", sub: "raiseEvent" },
  { key: "processing", label: "④ 処理", sub: "processApproval" },
  { key: "completed", label: "⑤ 完了", sub: "Completed" },
];
