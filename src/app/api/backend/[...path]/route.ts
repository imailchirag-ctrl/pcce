import type { NextRequest } from "next/server";

import { BackendUnavailableError, backendFetch } from "@/lib/server/backend";
import { getSessionToken } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const RESERVED = new Set(["auth", "events"]);
// Mutations on these prefixes must originate from the SkillBridge workspace itself.
const SAME_ORIGIN_PREFIXES = new Set(["career-quests", "twin", "market", "exchange"]);

async function proxy(request: NextRequest, path: string[]) {
  if (!path.length || RESERVED.has(path[0])) {
    return Response.json(
      { error: { code: "not_found", message: "This endpoint is not proxied." } },
      { status: 404 },
    );
  }

  if (SAME_ORIGIN_PREFIXES.has(path[0]) && !["GET", "HEAD"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) {
      return Response.json(
        { error: { code: "origin_rejected", message: "This request must come from the SkillBridge workspace." } },
        { status: 403 },
      );
    }
  }

  const token = await getSessionToken();
  if (!token) {
    return Response.json(
      { error: { code: "unauthorized", message: "Your session has expired. Sign in again." } },
      { status: 401 },
    );
  }

  const contentType = request.headers.get("content-type");
  let body: ArrayBuffer | undefined;
  if (!["GET", "HEAD"].includes(request.method)) {
    body = await request.arrayBuffer();
  }

  try {
    const response = await backendFetch(`${path.join("/")}${request.nextUrl.search}`, {
      method: request.method,
      token,
      body,
      headers: contentType ? { "Content-Type": contentType } : undefined,
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
    if (error instanceof BackendUnavailableError) {
      return Response.json(
        { error: { code: "backend_unavailable", message: error.message } },
        { status: 503 },
      );
    }
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return Response.json(
      {
        error: {
          code: timedOut ? "timeout" : "proxy_failed",
          message: timedOut
            ? "The analysis took too long. Try a smaller file or try again."
            : "The request could not reach the SkillBridge service.",
        },
      },
      { status: 503 },
    );
  }
}

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function HEAD(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxy(request, path);
}
