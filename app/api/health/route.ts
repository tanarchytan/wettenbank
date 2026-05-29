import { NextResponse } from "next/server";
import { getDb } from "@/db";

export const dynamic = "force-dynamic";

interface HealthResponse {
  ok: boolean;
  dbOk: boolean;
  lastSyncAt: string | null;
  lagSeconds: number | null;
}

export async function GET(): Promise<NextResponse<HealthResponse>> {
  let dbOk = false;
  let lastSyncAt: string | null = null;
  let lagSeconds: number | null = null;

  try {
    const sql = getDb();
    const [row] = await sql<{ finished_at: Date | null }[]>`
      SELECT finished_at FROM sync_log
      WHERE kind = 'delta' AND finished_at IS NOT NULL
      ORDER BY id DESC LIMIT 1
    `;
    dbOk = true;
    if (row?.finished_at) {
      lastSyncAt = row.finished_at.toISOString();
      lagSeconds = Math.floor((Date.now() - row.finished_at.getTime()) / 1000);
    }
  } catch {
    dbOk = false;
  }

  return NextResponse.json(
    { ok: dbOk, dbOk, lastSyncAt, lagSeconds },
    { headers: { "Cache-Control": "no-store" } },
  );
}
