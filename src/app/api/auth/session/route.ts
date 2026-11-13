import { NextResponse } from "next/server";

import { backendJson } from "@/lib/server/backend";
import { getSessionToken } from "@/lib/server/session";
import { clearedSessionCookieOptions } from "@/lib/session-constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const token = await getSessionToken();
  if (!token) return NextResponse.json({ user: null });

  try {
    const { status, data } = await backendJson<{ user: Record<string, unknown> }>("auth/session", { token });
    if (status === 200 && data?.user) return NextResponse.json({ user: data.user });

    const response = NextResponse.json({ user: null });
    response.cookies.set(clearedSessionCookieOptions());
    return response;
  } catch {
    return NextResponse.json(
      { error: { code: "backend_unavailable", message: "The API service is not running. Start the app with npm run dev:all and try again." } },
      { status: 503 },
    );
  }
}
