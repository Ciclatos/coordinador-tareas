import { NextResponse } from "next/server";
import { cleanupOrphanBlobs } from "@/lib/storage-management";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const result = await cleanupOrphanBlobs();
  console.info("storage_gc_completed", result);
  return NextResponse.json({ ok: true, ...result });
}
