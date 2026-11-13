import { NextResponse, type NextRequest } from "next/server";

import { googleConfig, googleRedirectUri } from "@/lib/server/google";
import { OAUTH_COOKIE, oauthCookieOptions } from "@/lib/session-constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const config = googleConfig();
  if (!config.configured) {
    return NextResponse.redirect(new URL("/auth/login?error=google_not_configured", request.url));
  }

  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: config.clientId!,
    redirect_uri: googleRedirectUri(request.url),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
    access_type: "online",
  });

  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  response.cookies.set(oauthCookieOptions(state));
  return response;
}
