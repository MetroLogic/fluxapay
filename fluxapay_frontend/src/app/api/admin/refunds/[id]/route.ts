import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;

    const response = await fetch(`${API_BASE_URL}/api/refunds/${encodeURIComponent(id)}`, {
      headers: {
        "Content-Type": "application/json",
        ...(ADMIN_API_KEY && { "X-Admin-API-Key": ADMIN_API_KEY }),
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch refund" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Refund fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
