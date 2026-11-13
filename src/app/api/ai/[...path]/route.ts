import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const FASTAPI_BASE_URL = (process.env.FASTAPI_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

async function proxy(request: NextRequest, path: string[]) {
  const incoming = new URL(request.url);
  const target = `${FASTAPI_BASE_URL}/api/v1/${path.join("/")}${incoming.search}`;
  const headers = new Headers();
  headers.set("Accept", "application/json");
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  const demoUser = request.headers.get("x-demo-user");
  if (demoUser) headers.set("x-demo-user", demoUser);

  let body: ArrayBuffer | undefined;
  if (!["GET", "HEAD"].includes(request.method)) {
    body = await request.arrayBuffer();
  }

  try {
    const response = await fetch(target, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(115_000),
    });
    const payload = await response.arrayBuffer();
    return new Response(payload, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "TimeoutError"
        ? "The AI service took too long to respond. Try again or use the deterministic fallback."
        : "The AI service is not reachable. Start FastAPI with `npm run fastapi:dev`.";
    return Response.json(
      {
        error: {
          code: "ai_service_unavailable",
          message,
        },
      },
      { status: 503 },
    );
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}
