import { NextRequest, NextResponse } from "next/server";
import { startFanOut } from "@/lib/durable";

export async function POST(req: NextRequest) {
  try {
    let files: string[] = [];
    try {
      const body = (await req.json()) as { files?: string[] };
      if (Array.isArray(body?.files)) files = body.files;
    } catch {
      // ボディ無しはデフォルト（サーバー側で補完）
    }
    const { instanceId } = await startFanOut(files);
    return NextResponse.json({ instanceId });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
