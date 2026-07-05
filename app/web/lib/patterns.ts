export type PatternGroup = "df" | "agent";

export interface PatternDef {
  slug: string;
  title: string;
  short: string;
  description: string;
  example: string;
  implemented: boolean;
  /** 所属グループ（df = Durable Functions / agent = Microsoft Agent Framework）。 */
  group: PatternGroup;
  /** docs/ 配下の Markdown ファイル名（ドキュメントがある場合）。 */
  doc?: string;
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
    group: "df",
    doc: "DF-function-chaining.md",
  },
  {
    slug: "fan-out-fan-in",
    title: "Fan-out / Fan-in",
    short: "並列 & 集約",
    description: "並列実行して結果を集約する",
    example: "複数ファイル分析、複数AIエージェントの並列処理",
    implemented: true,
    group: "df",
    doc: "DF-fanout-fanin.md",
  },
  {
    slug: "async-http",
    title: "Async HTTP API",
    short: "非同期HTTP",
    description: "起動後に 202 を返し、状態をポーリング",
    example: "長時間の生成AI処理、バッチ処理API",
    implemented: true,
    group: "df",
    doc: "DF-async-http-api.md",
  },
  {
    slug: "monitor",
    title: "Monitor",
    short: "監視",
    description: "Durable Timer で定期確認する",
    example: "外部ジョブ、デプロイ、支払い、審査状態の監視",
    implemented: true,
    group: "df",
    doc: "DF-monitor.md",
  },
  {
    slug: "human-interaction",
    title: "Human interaction",
    short: "人間参加型",
    description: "外部イベントを待ち、承認・拒否で再開",
    example: "承認フロー、HITL、例外処理",
    implemented: true,
    group: "df",
    doc: "DF-Human-in-the-loop.md",
  },
  {
    slug: "aggregator",
    title: "Aggregator",
    short: "集約",
    description: "イベントを集約し、一定条件で処理",
    example: "メトリクス集計、注文・IoTイベントのバッチ化",
    implemented: true,
    group: "df",
    doc: "DF-aggregator.md",
  },
];

/** Microsoft Agent Framework の5パターン。 */
export const AGENT_PATTERNS: PatternDef[] = [
  {
    slug: "sequential",
    title: "Sequential",
    short: "順次",
    description: "Agent を固定順で実行する",
    example: "要約 → レビュー → 最終回答",
    implemented: true,
    group: "agent",
    doc: "MAF-sequential.md",
  },
  {
    slug: "concurrent",
    title: "Concurrent",
    short: "並列",
    description: "複数 Agent を並列実行し統合する",
    example: "動画・論文・ガイドラインを同時調査",
    implemented: true,
    group: "agent",
    doc: "MAF-concurrent.md",
  },
  {
    slug: "handoff",
    title: "Handoff",
    short: "引き継ぎ",
    description: "文脈に応じて専門 Agent へ渡す",
    example: "一般相談 → 肝胆膵専門 Agent",
    implemented: true,
    group: "agent",
    doc: "MAF-handoff.md",
  },
  {
    slug: "group-chat",
    title: "Group Chat",
    short: "議論",
    description: "複数 Agent が共有会話で議論する",
    example: "多職種レビュー、反論・再検証",
    implemented: true,
    group: "agent",
    doc: "MAF-group-chat.md",
  },
  {
    slug: "magentic",
    title: "Magentic",
    short: "動的指揮",
    description: "Manager Agent が次の Agent を動的に決める",
    example: "手順が固定できない複雑な調査",
    implemented: false,
    group: "agent",
  },
];

/** 全パターン（両グループ）。 */
export const ALL_PATTERNS: PatternDef[] = [...PATTERNS, ...AGENT_PATTERNS];

/** パターンの画面ルートを返す（agent は /agent/ 配下）。 */
export function patternRoute(p: PatternDef): string {
  return p.group === "agent" ? `/agent/${p.slug}` : `/${p.slug}`;
}

export function getPattern(slug: string): PatternDef | undefined {
  return ALL_PATTERNS.find((p) => p.slug === slug);
}

/** ドキュメントファイル名からパターンを逆引きする。 */
export function getPatternByDoc(doc: string): PatternDef | undefined {
  return ALL_PATTERNS.find((p) => p.doc === doc);
}

/** ドキュメントファイル名 → パターン slug の逆引きマップ（クライアント安全）。 */
export const DOC_TO_SLUG: Record<string, string> = Object.fromEntries(
  ALL_PATTERNS.filter((p) => p.doc).map((p) => [p.doc as string, p.slug])
);
