import { NextResponse } from "next/server";
import { startOrchestration } from "@/lib/durable";

export async function POST() {
  try {
    const { instanceId } = await startOrchestration();
    return NextResponse.json({ instanceId });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
