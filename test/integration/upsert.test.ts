import { describe, expect, test, beforeAll, beforeEach, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getDb, closeDb } from "../../src/db.ts";
import { runMigrations } from "../../bin/migrate.ts";
import { parseBwbXml } from "../../src/ingest/parse-bwb-xml.ts";
import { upsertRegulation } from "../../src/ingest/upsert.ts";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "bwb-sample.xml");

beforeAll(async () => {
  await runMigrations();
});

beforeEach(async () => {
  const sql = getDb();
  await sql`TRUNCATE regulation_state, article, citation, regulation CASCADE`;
  await sql`DELETE FROM sync_log`;
});

afterAll(async () => { await closeDb(); });

describe("upsertRegulation", () => {
  test("inserts regulation + state + articles on first call", async () => {
    const xml = readFileSync(FIXTURE, "utf-8");
    const parsed = parseBwbXml(xml);

    const result = await upsertRegulation(parsed);

    expect(result.regulationInserted).toBe(true);
    expect(result.stateInserted).toBe(true);
    expect(result.articlesInserted).toBeGreaterThan(0);

    const sql = getDb();
    const [reg] = await sql<{ bwb_id: string; title: string }[]>`
      SELECT bwb_id, title FROM regulation WHERE bwb_id = ${parsed.bwbId}
    `;
    expect(reg).toBeDefined();
    expect(reg!.title.toLowerCase()).toContain("grondwet");
  });

  test("is idempotent on identical XML", async () => {
    const xml = readFileSync(FIXTURE, "utf-8");
    const parsed = parseBwbXml(xml);

    await upsertRegulation(parsed);
    const second = await upsertRegulation(parsed);

    expect(second.stateInserted).toBe(false);
    expect(second.articlesInserted).toBe(0);

    const sql = getDb();
    const rows = await sql<{ count: string }[]>`
      SELECT count(*) FROM regulation_state WHERE bwb_id = ${parsed.bwbId}
    `;
    expect(Number(rows[0]!.count)).toBe(1);
  });

  test("populates FTS tsv via generated column", async () => {
    const xml = readFileSync(FIXTURE, "utf-8");
    const parsed = parseBwbXml(xml);
    await upsertRegulation(parsed);

    const sql = getDb();
    const [hit] = await sql<{ bwb_id: string }[]>`
      SELECT bwb_id FROM regulation_state
      WHERE tsv @@ to_tsquery('dutch', 'grondwet')
        AND bwb_id = ${parsed.bwbId}
      LIMIT 1
    `;
    expect(hit).toBeDefined();
  });
});
