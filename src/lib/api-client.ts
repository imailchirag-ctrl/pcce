export type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<TResponse>(path: string, init: RequestInit = {}): Promise<TResponse> {
  if (!path.startsWith("/")) {
    throw new Error("API paths must be relative to this application.");
  }

  let response: Response;
  try {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    response = await fetch(path, {
      ...init,
      headers,
    });
  } catch {
    throw new ApiError("The service could not be reached. Try again shortly.", 0, "network_error");
  }

  const body = (await response.json().catch(() => null)) as ApiErrorBody | TResponse | null;
  if (!response.ok) {
    const errorBody = body as ApiErrorBody | null;
    throw new ApiError(
      errorBody?.error?.message ?? "The request could not be completed.",
      response.status,
      errorBody?.error?.code ?? "request_failed",
    );
  }

  if (body === null) {
    throw new ApiError("The service returned an invalid response.", response.status, "invalid_response");
  }

  return body as TResponse;
}
