import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const ADMIN_SECRET = process.env.ADMIN_SECRET;

export async function POST(
  req: NextRequest,
  { params }: { params: { logId: string } }
) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { logId } = params;

    const response = await fetch(
      `${API_BASE_URL}/api/v1/webhooks/admin/logs/${encodeURIComponent(logId)}/retry`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(ADMIN_SECRET && { "X-Admin-Secret": ADMIN_SECRET }),
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to retry webhook" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Webhook retry error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
