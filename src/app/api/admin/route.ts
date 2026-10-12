import { NextRequest, NextResponse } from "next/server";

const ADMIN_SECRET = process.env.ADMIN_SECRET;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

function adminHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (ADMIN_SECRET) {
    headers["x-admin-secret"] = ADMIN_SECRET;
  }
  if (ADMIN_API_KEY) {
    headers["x-admin-api-key"] = ADMIN_API_KEY;
  }
  return headers;
}

function getUpstreamBaseUrl(): string | null {
  return (
    process.env.ADMIN_API_BASE_URL ??
    process.env.API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    null
  );
}

async function proxyAdminRequest(
  request: NextRequest,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string[],
): Promise<NextResponse> {
  const baseUrl = getUpstreamBaseUrl();
  if (!baseUrl) {
    return NextResponse.json(
      { error: "Admin API base URL is not configured" },
      { status: 500 },
    );
  }

  const target = `${baseUrl.replace(/\/$/, "")}/admin${path.length ? `/${path.join("/")}` : ""}${request.nextUrl.search}`;

  const init: RequestInit = {
    method,
    headers: adminHeaders(),
    cache: "no-store",
  };

  if (method !== "GET" && method !== "DELETE") {
    const body = await request.text();
    if (body) {
      init.body = body;
    }
  }

  try {
    const upstream = await fetch(target, init);
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to reach admin API" },
      { status: 502 },
    );
  }
}

type RouteContext = { params: { path?: string[] } };

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyAdminRequest(request, "GET", context.params.path ?? []);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyAdminRequest(request, "POST", context.params.path ?? []);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return proxyAdminRequest(request, "PUT", context.params.path ?? []);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return proxyAdminRequest(request, "PATCH", context.params.path ?? []);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxyAdminRequest(request, "DELETE", context.params.path ?? []);
}
