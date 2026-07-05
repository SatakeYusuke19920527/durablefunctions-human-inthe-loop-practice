import { NextRequest, NextResponse } from "next/server";
import { startAsync } from "@/lib/durable";

export async function POST(req: NextRequest) {
  try {
    let steps = 5;
    try {
      const body = (await req.json()) as { steps?: number };
      if (typeof body?.steps === "number") steps = body.steps;
    } catch {
      // ボディ無しはデフォルト
    }
    const { instanceId } = await startAsync(steps);
    return NextResponse.json({ instanceId });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
