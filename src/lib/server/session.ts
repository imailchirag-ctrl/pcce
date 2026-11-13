import { cookies } from "next/headers";

import { backendJson } from "./backend";
import { SESSION_COOKIE } from "@/lib/session-constants";

export { SESSION_COOKIE };

export async function getSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value;
}

export async function getCurrentUser() {
  const token = await getSessionToken();
  if (!token) return { user: null, token: null };
  try {
    const { data, status } = await backendJson<{ user: Record<string, unknown> }>("auth/session", { token });
    if (status !== 200 || !data?.user) return { user: null, token };
    return { user: data.user, token };
  } catch {
    return { user: null, token };
  }
}
