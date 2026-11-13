import { NextResponse } from "next/server";

import { backendFetch } from "@/lib/server/backend";
import { getSessionToken } from "@/lib/server/session";
import { clearedSessionCookieOptions } from "@/lib/session-constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const token = await getSessionToken();
  if (token) {
    try {
      await backendFetch("auth/logout", { method: "POST", token });
    } catch {
      // The cookie is cleared locally even when the API is unreachable.
    }
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(clearedSessionCookieOptions());
  return response;
}
