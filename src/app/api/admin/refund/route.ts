import { NextRequest, NextResponse } from "next/server";

const ADMIN_API_BASE =
  process.env.ADMIN_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "";

function adminHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const secret = process.env.ADMIN_SECRET;
  if (secret) {
    headers["x-admin-secret"] = secret;
  }

  const apiKey = process.env.ADMIN_API_KEY;
  if (apiKey) {
    headers["x-admin-api-key"] = apiKey;
  }

  return headers;
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!ADMIN_API_BASE) {
    return NextResponse.json(
      { error: "Admin API base URL is not configured" },
      { status: 500 }
    );
  }

  try {
    const upstream = await fetch(`${ADMIN_API_BASE}/admin/refund`, {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const text = await upstream.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text };
      }
    }

    return NextResponse.json(data ?? {}, { status: upstream.status });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to process admin refund request",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    );
  }
}
