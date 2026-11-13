import { NextResponse } from "next/server";

import { backendJson } from "@/lib/server/backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { status, data } = await backendJson<Record<string, number>>("public/stats");
    return NextResponse.json(data ?? {}, { status: status || 502 });
  } catch {
    return NextResponse.json(
      { error: { code: "backend_unavailable", message: "Live stats are unavailable." } },
      { status: 503 },
    );
  }
}
