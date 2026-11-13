import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const google = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.INTERNAL_API_SECRET,
  );
  return NextResponse.json({ google });
}
