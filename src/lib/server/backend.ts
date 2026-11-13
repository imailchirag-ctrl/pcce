const BASE = (process.env.FASTAPI_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

export const API_PREFIX = "/api/v1";

export class BackendUnavailableError extends Error {
  constructor() {
    super("The SkillBridge service is not running. Start it with `npm run dev:all`.");
    this.name = "BackendUnavailableError";
  }
}

export function backendUrl(path: string): string {
  const clean = path.replace(/^\/+/, "");
  return `${BASE}${API_PREFIX}/${clean}`;
}

export type BackendOptions = {
  method?: string;
  token?: string | null;
  body?: BodyInit | null;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export async function backendFetch(path: string, options: BackendOptions = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  try {
    return await fetch(backendUrl(path), {
      method: options.method || "GET",
      headers,
      body: options.body,
      cache: "no-store",
      signal: options.signal,
    });
  } catch {
    throw new BackendUnavailableError();
  }
}

export async function backendJson<T>(
  path: string,
  options: BackendOptions = {},
): Promise<{ status: number; data: T | null; response: Response }> {
  const response = await backendFetch(path, options);
  const text = await response.text();
  let data: T | null = null;
  try {
    data = text ? (JSON.parse(text) as T) : null;
  } catch {
    data = null;
  }
  return { status: response.status, data, response };
}

export function errorPayload(message: string, code = "request_failed", status = 400): Response {
  return Response.json({ error: { code, message } }, { status });
}
