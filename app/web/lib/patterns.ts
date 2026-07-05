export interface PatternDef {
  slug: string;
  title: string;
  short: string;
  description: string;
  example: string;
  implemented: boolean;
}

/** Durable Functions の代表的な6パターン。 */
export const PATTERNS: PatternDef[] = [
  {
    slug: "function-chaining",
    title: "Function chaining",
    short: "関数チェーン",
    description: "Activity を順番に呼ぶ",
    example: "申請 → 検証 → 登録 → 通知",
    implemented: true,
  },
  {
    slug: "fan-out-fan-in",
    title: "Fan-out / Fan-in",
    short: "並列 & 集約",
    description: "並列実行して結果を集約する",
    example: "複数ファイル分析、複数AIエージェントの並列処理",
    implemented: true,
  },
  {
    slug: "async-http",
    title: "Async HTTP API",
    short: "非同期HTTP",
    description: "起動後に 202 を返し、状態をポーリング",
    example: "長時間の生成AI処理、バッチ処理API",
    implemented: false,
  },
  {
    slug: "monitor",
    title: "Monitor",
    short: "監視",
    description: "Durable Timer で定期確認する",
    example: "外部ジョブ、デプロイ、支払い、審査状態の監視",
    implemented: false,
  },
  {
    slug: "human-interaction",
    title: "Human interaction",
    short: "人間参加型",
    description: "外部イベントを待ち、承認・拒否で再開",
    example: "承認フロー、HITL、例外処理",
    implemented: true,
  },
  {
    slug: "aggregator",
    title: "Aggregator",
    short: "集約",
    description: "イベントを集約し、一定条件で処理",
    example: "メトリクス集計、注文・IoTイベントのバッチ化",
    implemented: false,
  },
];

export function getPattern(slug: string): PatternDef | undefined {
  return PATTERNS.find((p) => p.slug === slug);
}
