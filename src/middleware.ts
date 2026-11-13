import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/session-constants";

const PROTECTED = [
  "/dashboard",
  "/resume",
  "/career",
  "/learn",
  "/interviews",
  "/jobs",
  "/applications",
  "/profile",
  "/settings",
  "/onboarding",
  "/recruiter",
];

const AUTH_PAGES = ["/auth/login", "/auth/signup", "/auth/signup/recruiter", "/login", "/signup"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  const protectedRoute = PROTECTED.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  if (protectedRoute && !token) {
    const login = request.nextUrl.clone();
    login.pathname = "/auth/login";
    login.search = "";
    login.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }

  if (token && AUTH_PAGES.includes(pathname)) {
    const workspace = request.nextUrl.clone();
    workspace.pathname = "/dashboard";
    workspace.search = "";
    return NextResponse.redirect(workspace);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
