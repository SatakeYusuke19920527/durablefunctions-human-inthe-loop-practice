import { NextRequest, NextResponse } from "next/server";
import { getStatus } from "@/lib/durable";

export async function GET(req: NextRequest) {
  const instanceId = req.nextUrl.searchParams.get("instanceId");
  if (!instanceId) {
    return NextResponse.json(
      { error: "instanceId query param is required" },
      { status: 400 }
    );
  }
  try {
    const status = await getStatus(instanceId);
    return NextResponse.json(status);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
