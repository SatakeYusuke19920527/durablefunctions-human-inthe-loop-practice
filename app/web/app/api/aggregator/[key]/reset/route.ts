import { NextRequest, NextResponse } from "next/server";
import { aggregatorReset } from "@/lib/durable";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  try {
    await aggregatorReset(key);
    return NextResponse.json({ key, reset: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
