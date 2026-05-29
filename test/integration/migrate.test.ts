import { describe, expect, test, beforeEach, afterAll } from "bun:test";
import { getDb, closeDb } from "../../src/db.ts";
import { runMigrations } from "../../bin/migrate.ts";

describe("runMigrations", () => {
  beforeEach(async () => {
    const sql = getDb();
    // Drop in dependency order; CASCADE handles FK constraints on each table.
    await sql`DROP TABLE IF EXISTS _migrations CASCADE`;
    await sql`DROP TABLE IF EXISTS citation CASCADE`;
    await sql`DROP TABLE IF EXISTS article CASCADE`;
    await sql`DROP TABLE IF EXISTS sync_log CASCADE`;
    await sql`DROP TABLE IF EXISTS regulation_state CASCADE`;
    await sql`DROP TABLE IF EXISTS regulation CASCADE`;
  });

  test("creates _migrations table and records applied files", async () => {
    await runMigrations();
    const sql = getDb();
    const rows = await sql<{ filename: string }[]>`SELECT filename FROM _migrations ORDER BY filename`;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]!.filename).toBe("0001_init.sql");
  });

  test("is idempotent — running twice does not re-apply", async () => {
    await runMigrations();
    const sql = getDb();
    const before = await sql<{ applied_at: Date }[]>`SELECT applied_at FROM _migrations WHERE filename='0001_init.sql'`;
    await runMigrations();
    const after = await sql<{ applied_at: Date }[]>`SELECT applied_at FROM _migrations WHERE filename='0001_init.sql'`;
    expect(after[0]!.applied_at.getTime()).toBe(before[0]!.applied_at.getTime());
  });

  afterAll(async () => { await closeDb(); });
});
