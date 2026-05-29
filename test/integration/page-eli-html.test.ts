import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import EliPage from "../../app/eli/[...slug]/page.tsx";
import { runMigrations } from "../../bin/migrate.ts";
import { getDb, closeDb } from "../../src/db.ts";
import { parseBwbXml } from "../../src/ingest/parse-bwb-xml.ts";
import { upsertRegulation } from "../../src/ingest/upsert.ts";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "bwb-sample.xml");
let eliSlug: string[] = [];

beforeAll(async () => {
  await runMigrations();
  const sql = getDb();
  await sql`TRUNCATE regulation_state, article, citation, regulation CASCADE`;
  await upsertRegulation(parseBwbXml(readFileSync(FIXTURE, "utf-8")));
  const [reg] = await sql<{ eli_uri: string }[]>`SELECT eli_uri FROM regulation LIMIT 1`;
  eliSlug = reg!.eli_uri.split("/").filter(Boolean).slice(1);
});
afterAll(async () => { await closeDb(); });

describe("EliPage HTML", () => {
  test("renders viewer with articles and TOC", async () => {
    const tree = await EliPage({ params: Promise.resolve({ slug: eliSlug }) });
    const html = renderToStaticMarkup(tree);
    expect(html).toContain("Grondwet");
    expect(html).toContain("Artikel 1");
    expect(html).toContain("Inhoudsopgave");
    expect(html).toContain("Verwijzingen");
  });
});
