import { NextRequest, NextResponse } from "next/server";
import { startChaining } from "@/lib/durable";

export async function POST(req: NextRequest) {
  try {
    let name = "山田太郎";
    try {
      const body = (await req.json()) as { name?: string };
      if (body?.name) name = body.name;
    } catch {
      // ボディ無しはデフォルト名
    }
    const { instanceId } = await startChaining(name);
    return NextResponse.json({ instanceId });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
