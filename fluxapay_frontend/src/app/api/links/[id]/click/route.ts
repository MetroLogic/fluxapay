import { NextRequest, NextResponse } from "next/server";
import { incrementClicks } from "@/lib/links";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const link = incrementClicks(id);
  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.redirect(new URL(`/pay/${id}`, req.url));
}
