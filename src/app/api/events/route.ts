import type { NextRequest } from "next/server";

import { BackendUnavailableError, backendFetch } from "@/lib/server/backend";
import { getSessionToken } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const token = await getSessionToken();
  if (!token) {
    return Response.json({ error: { code: "unauthorized", message: "Sign in to continue." } }, { status: 401 });
  }

  try {
    const response = await backendFetch("events", {
      token,
      headers: { Accept: "text/event-stream" },
      signal: request.signal,
    });
    if (!response.ok || !response.body) {
      return Response.json(
        { error: { code: "stream_failed", message: "The realtime stream could not start." } },
        { status: 502 },
      );
    }
    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    if (error instanceof BackendUnavailableError) {
      return Response.json({ error: { code: "backend_unavailable", message: error.message } }, { status: 503 });
    }
    return Response.json(
      { error: { code: "stream_failed", message: "The realtime stream is unavailable." } },
      { status: 503 },
    );
  }
}
