import { NextResponse } from "next/server";

import { backendJson, BackendUnavailableError } from "@/lib/server/backend";
import { getSessionToken } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json({ error: { code: "unauthorized", message: "Sign in to continue." } }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "invalid_body", message: "Invalid password payload." } }, { status: 400 });
  }

  try {
    const { status, data } = await backendJson("auth/password", {
      method: "PUT",
      token,
      body: JSON.stringify(payload),
    });
    return NextResponse.json(data ?? { error: { message: "Password update failed." } }, { status: status || 502 });
  } catch (error) {
    if (error instanceof BackendUnavailableError) {
      return NextResponse.json(
        { error: { code: "backend_unavailable", message: error.message } },
        { status: 503 },
      );
    }
    throw error;
  }
}
