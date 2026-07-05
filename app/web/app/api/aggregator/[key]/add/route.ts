import { NextRequest, NextResponse } from "next/server";
import { aggregatorAdd } from "@/lib/durable";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  try {
    let value = 0;
    try {
      const body = (await req.json()) as { value?: number };
      if (typeof body?.value === "number") value = body.value;
    } catch {
      // デフォルト0
    }
    await aggregatorAdd(key, value);
    return NextResponse.json({ key, value });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
