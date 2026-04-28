import { NextRequest, NextResponse } from "next/server";
import { deleteLink, toggleActive } from "@/lib/links";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ok = deleteLink(id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}

export async function PATCH(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const link = toggleActive(id);
  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(link);
}
