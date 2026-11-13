import { GET as callbackHandler } from "@/app/api/auth/google/callback/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export { callbackHandler as GET };
