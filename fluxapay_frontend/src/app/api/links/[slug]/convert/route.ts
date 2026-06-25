import { NextRequest, NextResponse } from "next/server";
import { incrementConversions } from "@/lib/links";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const link = incrementConversions(slug);
  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ conversions: link.conversions });
}
