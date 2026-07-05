import { NextRequest, NextResponse } from "next/server";

const AGENT_BASE_URL = process.env.AGENT_BASE_URL ?? "http://localhost:7072";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { prompt?: string };
    const prompt = body?.prompt;
    if (!prompt || !prompt.trim()) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }
    const res = await fetch(`${AGENT_BASE_URL}/api/magentic`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.error ?? `magentic failed: ${res.status}` },
        { status: 502 }
      );
    }
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
