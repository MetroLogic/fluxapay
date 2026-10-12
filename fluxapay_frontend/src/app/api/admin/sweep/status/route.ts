import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const ADMIN_SECRET = process.env.ADMIN_SECRET;

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const response = await fetch(`${API_BASE_URL}/api/v1/admin/settlement/status`, {
      headers: {
        "Content-Type": "application/json",
        ...(ADMIN_SECRET && { "X-Admin-Secret": ADMIN_SECRET }),
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch settlement status" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Settlement status error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
