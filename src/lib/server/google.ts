const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const internalSecret = process.env.INTERNAL_API_SECRET?.trim();
  return {
    clientId,
    clientSecret,
    internalSecret,
    configured: Boolean(clientId && clientSecret && internalSecret),
  };
}

export function appOrigin(requestUrl: string): string {
  return APP_URL || new URL(requestUrl).origin;
}

export function googleRedirectUri(requestUrl: string): string {
  return `${appOrigin(requestUrl)}/api/auth/google/callback`;
}
