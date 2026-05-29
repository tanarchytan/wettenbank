import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GET } from "../../app/api/search/route.ts";
import { runMigrations } from "../../bin/migrate.ts";
import { getDb, closeDb } from "../../src/db.ts";
import { parseBwbXml } from "../../src/ingest/parse-bwb-xml.ts";
import { upsertRegulation } from "../../src/ingest/upsert.ts";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "bwb-sample.xml");

beforeAll(async () => {
  await runMigrations();
  const sql = getDb();
  await sql`TRUNCATE regulation_state, article, citation, regulation CASCADE`;
  await upsertRegulation(parseBwbXml(readFileSync(FIXTURE, "utf-8")));
});

afterAll(async () => { await closeDb(); });

function makeReq(url: string): Request { return new Request(url); }

describe("GET /api/search", () => {
  test("returns 400 on missing q", async () => {
    const res = await GET(makeReq("http://localhost/api/search"));
    expect(res.status).toBe(400);
  });

  test("returns hits for 'grondwet'", async () => {
    const res = await GET(makeReq("http://localhost/api/search?q=grondwet"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=60");
    const body = await res.json() as { query: string; total: number; results: Array<{ bwbId: string }> };
    expect(body.total).toBeGreaterThan(0);
    expect(body.results[0]!.bwbId).toBe("BWBR0001840");
  });

  test("returns empty results for nonsense", async () => {
    const res = await GET(makeReq("http://localhost/api/search?q=zzzzzqqqqq"));
    const body = await res.json() as { total: number };
    expect(body.total).toBe(0);
  });
});
