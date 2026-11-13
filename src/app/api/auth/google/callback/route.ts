import { NextResponse, type NextRequest } from "next/server";

import { backendJson } from "@/lib/server/backend";
import { googleConfig, googleRedirectUri } from "@/lib/server/google";
import { OAUTH_COOKIE, sessionCookieOptions } from "@/lib/session-constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GoogleTokens = { access_token?: string; error?: string; error_description?: string };
type GoogleProfile = {
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};
type AuthResponse = { token: string; user: Record<string, unknown> };

function failure(request: NextRequest, code: string) {
  const target = new URL("/auth/login", request.url);
  target.searchParams.set("error", code);
  return NextResponse.redirect(target);
}

export async function GET(request: NextRequest) {
  const config = googleConfig();
  if (!config.configured) return failure(request, "google_not_configured");

  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const storedState = request.cookies.get(OAUTH_COOKIE)?.value;

  if (error || !code || !state || !storedState || state !== storedState) {
    return failure(request, error === "access_denied" ? "google_cancelled" : "google_state_mismatch");
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.clientId!,
        client_secret: config.clientSecret!,
        redirect_uri: googleRedirectUri(request.url),
        grant_type: "authorization_code",
      }),
      cache: "no-store",
    });
    const tokens = (await tokenResponse.json()) as GoogleTokens;
    if (!tokenResponse.ok || !tokens.access_token) {
      return failure(request, "google_token_failed");
    }

    const profileResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      cache: "no-store",
    });
    const profile = (await profileResponse.json()) as GoogleProfile;
    if (!profileResponse.ok || !profile.email || profile.email_verified === false) {
      return failure(request, "google_email_unverified");
    }

    const { status, data } = await backendJson<AuthResponse>("auth/oauth", {
      method: "POST",
      headers: { "x-internal-secret": config.internalSecret! },
      body: JSON.stringify({
        email: profile.email,
        name: profile.name?.trim() || profile.email.split("@")[0],
        avatar_url: profile.picture || null,
        provider: "google",
        email_verified: true,
      }),
    });

    if (status !== 200 || !data?.token) return failure(request, "google_account_failed");

    const role = String(data.user.role || "candidate");
    const onboarded = Boolean(data.user.onboarded);
    // After first Google sign-in, send new users to /auth/role then onboarding; returning users go straight to /dashboard.
    const destination = !onboarded ? "/auth/role" : role === "recruiter" ? "/recruiter" : "/dashboard";

    const response = NextResponse.redirect(new URL(destination, request.url));
    response.cookies.set(sessionCookieOptions(data.token));
    response.cookies.set({ name: OAUTH_COOKIE, value: "", path: "/", maxAge: 0, httpOnly: true, sameSite: "lax" });
    return response;
  } catch {
    return failure(request, "google_unavailable");
  }
}
