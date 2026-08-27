import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const query = new URLSearchParams();
    if (searchParams.has("paymentId")) query.set("paymentId", searchParams.get("paymentId")!);
    if (searchParams.has("merchantId")) query.set("merchantId", searchParams.get("merchantId")!);
    if (searchParams.has("status")) query.set("status", searchParams.get("status")!);
    if (searchParams.has("page")) query.set("page", searchParams.get("page")!);
    if (searchParams.has("limit")) query.set("limit", searchParams.get("limit")!);

    const response = await fetch(
      `${API_BASE_URL}/api/refunds${query.toString() ? `?${query}` : ""}`,
      {
        headers: {
          "Content-Type": "application/json",
          ...(ADMIN_API_KEY && { "X-Admin-API-Key": ADMIN_API_KEY }),
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch refunds" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Refunds list error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
