import { NextRequest, NextResponse } from "next/server";
import { runConcurrent } from "@/lib/agent";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { prompt?: string };
    const prompt = body?.prompt;
    if (!prompt || !prompt.trim()) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }
    const result = await runConcurrent(prompt);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
