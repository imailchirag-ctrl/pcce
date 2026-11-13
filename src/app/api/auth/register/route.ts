import { NextResponse } from "next/server";

import { backendJson } from "@/lib/server/backend";
import { sessionCookieOptions } from "@/lib/session-constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AuthResponse = { token: string; user: Record<string, unknown> };

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_body", message: "Enter your account details." } },
      { status: 400 },
    );
  }

  try {
    const { status, data } = await backendJson<AuthResponse>("auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (status !== 200 || !data?.token) {
      return NextResponse.json(data ?? { error: { message: "Account creation failed." } }, { status: status || 502 });
    }
    const response = NextResponse.json({ user: data.user });
    response.cookies.set(sessionCookieOptions(data.token));
    return response;
  } catch {
    return NextResponse.json(
      { error: { code: "backend_unavailable", message: "The SkillBridge service is not running. Start it and try again." } },
      { status: 503 },
    );
  }
}
