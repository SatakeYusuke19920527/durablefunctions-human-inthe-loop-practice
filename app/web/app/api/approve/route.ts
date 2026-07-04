import { NextRequest, NextResponse } from "next/server";
import { sendApproval } from "@/lib/durable";

export async function POST(req: NextRequest) {
  try {
    const { instanceId, approved } = (await req.json()) as {
      instanceId: string;
      approved: boolean;
    };
    if (!instanceId || typeof approved !== "boolean") {
      return NextResponse.json(
        { error: "instanceId and approved are required" },
        { status: 400 }
      );
    }
    await sendApproval(instanceId, approved);
    return NextResponse.json({ instanceId, approved });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
