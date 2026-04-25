import { NextRequest, NextResponse } from "next/server";
import { getLinks, createLink } from "@/lib/links";

export function GET() {
  return NextResponse.json(getLinks());
}

export async function POST(req: NextRequest) {
  const { label, amount, currency } = await req.json();
  if (!label || typeof amount !== "number") {
    return NextResponse.json({ error: "label and amount required" }, { status: 400 });
  }
  return NextResponse.json(createLink(label, amount, currency), { status: 201 });
}
