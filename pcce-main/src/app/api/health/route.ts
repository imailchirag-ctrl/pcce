import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type DependencyStatus = "available" | "unavailable" | "not_configured";

export async function GET() {
  let fastApi: DependencyStatus = "not_configured";
  const baseUrl = process.env.FASTAPI_BASE_URL?.trim().replace(/\/+$/, "");

  if (baseUrl) {
    try {
      const response = await fetch(`${baseUrl}/api/v1/health`, {
        cache: "no-store",
        signal: AbortSignal.timeout(2500),
      });
      fastApi = response.ok ? "available" : "unavailable";
    } catch {
      fastApi = "unavailable";
    }
  }

  const healthy = fastApi !== "unavailable";

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      services: {
        web: "available",
        fastapi: fastApi,
        database: process.env.DATABASE_URL ? "configured" : "not_configured",
      },
    },
    { status: healthy ? 200 : 503 },
  );
}
