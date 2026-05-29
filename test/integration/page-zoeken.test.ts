import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import ZoekenPage from "../../app/zoeken/page.tsx";
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

describe("ZoekenPage", () => {
  test("renders empty state when no query", async () => {
    const tree = await ZoekenPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(tree);
    expect(html).toContain("Eenvoudig zoeken");
    expect(html).not.toContain("Resultaten");
  });

  test("renders hits when q=grondwet", async () => {
    const tree = await ZoekenPage({ searchParams: Promise.resolve({ q: "grondwet" }) });
    const html = renderToStaticMarkup(tree);
    expect(html).toContain("Resultaten");
    expect(html).toContain("Grondwet");
  });
});
