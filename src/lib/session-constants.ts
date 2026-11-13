export const SESSION_COOKIE = "sb_session";
export const OAUTH_COOKIE = "sb_oauth";
export const OAUTH_STATE_MAX_AGE = 60 * 10;
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

type CookieOptions = {
  name: string;
  value: string;
  httpOnly: boolean;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
};

export function sessionCookieOptions(token: string): CookieOptions {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

export function clearedSessionCookieOptions(): CookieOptions {
  return {
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
}

export function oauthCookieOptions(state: string): CookieOptions {
  return {
    name: OAUTH_COOKIE,
    value: state,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: OAUTH_STATE_MAX_AGE,
  };
}
