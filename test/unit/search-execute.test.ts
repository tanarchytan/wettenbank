import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runMigrations } from "../../bin/migrate.ts";
import { getDb, closeDb } from "../../src/db.ts";
import { parseBwbXml } from "../../src/ingest/parse-bwb-xml.ts";
import { upsertRegulation } from "../../src/ingest/upsert.ts";
import { executeSearch } from "../../src/search/execute.ts";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "bwb-sample.xml");

beforeAll(async () => {
  await runMigrations();
  const sql = getDb();
  await sql`TRUNCATE regulation_state, article, citation, regulation CASCADE`;
  await upsertRegulation(parseBwbXml(readFileSync(FIXTURE, "utf-8")));
});
afterAll(async () => { await closeDb(); });

describe("executeSearch", () => {
  test("returns hits for matching q", async () => {
    const r = await executeSearch({ q: "grondwet" });
    expect(r.results.length).toBeGreaterThan(0);
    expect(r.results[0]!.bwbId).toBe("BWBR0001840");
  });
  test("filters by reg type (synthetic fixture is 'wet')", async () => {
    const r1 = await executeSearch({ q: "grondwet", types: ["Wetten"] });
    expect(r1.results.length).toBeGreaterThan(0);
    const r2 = await executeSearch({ q: "grondwet", types: ["MinR"] });
    expect(r2.results.length).toBe(0);
  });
  test("filters by asOfDate (future date returns the open-ended regulation)", async () => {
    const future = await executeSearch({ q: "grondwet", asOfDate: "2099-01-01" });
    expect(future.results.length).toBeGreaterThan(0);
  });
  test("returns empty for unmatched query", async () => {
    const r = await executeSearch({ q: "zzzzzqqqqq" });
    expect(r.results.length).toBe(0);
  });
});
