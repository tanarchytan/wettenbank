import { describe, expect, test, afterAll } from "bun:test";
import { GET } from "../../app/api/health/route.ts";
import { getDb, closeDb } from "../../src/db.ts";
import { runMigrations } from "../../bin/migrate.ts";

afterAll(async () => { await closeDb(); });

describe("GET /api/health", () => {
  test("returns ok status with sync lag info", async () => {
    await runMigrations();
    const sql = getDb();
    await sql`DELETE FROM sync_log`;
    await sql`
      INSERT INTO sync_log (started_at, finished_at, kind, cursor, rows_upserted, errors)
      VALUES (now() - interval '30 minutes', now() - interval '29 minutes', 'delta', now() - interval '30 minutes', 5, '[]'::jsonb)
    `;

    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json() as {
      ok: boolean;
      dbOk: boolean;
      lastSyncAt: string | null;
      lagSeconds: number | null;
    };
    expect(body.ok).toBe(true);
    expect(body.dbOk).toBe(true);
    expect(body.lastSyncAt).not.toBeNull();
    expect(body.lagSeconds).toBeGreaterThan(0);
    expect(body.lagSeconds).toBeLessThan(60 * 60);
  });

  test("returns dbOk=false when DB unreachable", async () => {
    const origUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://x:y@127.0.0.1:1/none";
    await closeDb();
    try {
      const res = await GET();
      const body = await res.json() as { ok: boolean; dbOk: boolean };
      expect(body.dbOk).toBe(false);
      expect(body.ok).toBe(false);
    } finally {
      process.env.DATABASE_URL = origUrl;
      await closeDb();
    }
  });
});
