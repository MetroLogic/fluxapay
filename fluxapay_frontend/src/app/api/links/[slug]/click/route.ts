import { NextRequest, NextResponse } from "next/server";
import { incrementClicks } from "@/lib/links";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const link = incrementClicks(slug);
  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.redirect(new URL(`/pay/${slug}`, req.url));
}
