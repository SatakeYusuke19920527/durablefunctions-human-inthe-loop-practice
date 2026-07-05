import { NextRequest, NextResponse } from "next/server";
import { startMonitor } from "@/lib/durable";

export async function POST(req: NextRequest) {
  try {
    let intervalSeconds = 3;
    let timeoutSeconds = 30;
    try {
      const body = (await req.json()) as {
        intervalSeconds?: number;
        timeoutSeconds?: number;
      };
      if (typeof body?.intervalSeconds === "number")
        intervalSeconds = body.intervalSeconds;
      if (typeof body?.timeoutSeconds === "number")
        timeoutSeconds = body.timeoutSeconds;
    } catch {
      // デフォルト
    }
    const { instanceId } = await startMonitor(intervalSeconds, timeoutSeconds);
    return NextResponse.json({ instanceId });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
