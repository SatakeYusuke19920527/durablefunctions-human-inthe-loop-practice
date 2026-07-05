import { NextRequest, NextResponse } from "next/server";
import { aggregatorGet } from "@/lib/durable";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  try {
    const state = await aggregatorGet(key);
    return NextResponse.json(state);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
