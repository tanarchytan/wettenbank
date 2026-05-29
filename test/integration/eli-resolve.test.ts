import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runMigrations } from "../../bin/migrate.ts";
import { parseBwbXml } from "../../src/ingest/parse-bwb-xml.ts";
import { upsertRegulation } from "../../src/ingest/upsert.ts";
import { getDb, closeDb } from "../../src/db.ts";
import { resolveEli } from "../../src/eli/resolve.ts";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "bwb-sample.xml");

beforeAll(async () => {
  await runMigrations();
  const sql = getDb();
  await sql`TRUNCATE regulation_state, article, citation, regulation CASCADE`;
  const xml = readFileSync(FIXTURE, "utf-8");
  await upsertRegulation(parseBwbXml(xml));
});

afterAll(async () => { await closeDb(); });

describe("resolveEli", () => {
  test("resolves latest by type+year+naturalId", async () => {
    const sql = getDb();
    const [reg] = await sql<{ eli_uri: string }[]>`SELECT eli_uri FROM regulation WHERE bwb_id='BWBR0001840'`;
    expect(reg).toBeDefined();
    const parts = reg!.eli_uri.split("/").filter(Boolean); // ['eli','nl','wet','2023','<slug>']
    const naturalId = parts[parts.length - 1]!;

    const result = await resolveEli({
      type: "wet",
      year: parts[3]!,
      naturalId,
      validAt: null,
      articleNr: null,
    });

    expect(result).not.toBeNull();
    expect(result!.bwbId).toBe("BWBR0001840");
    expect(result!.stateId).toBeGreaterThan(0);
    expect(result!.title).toContain("Grondwet");
  });

  test("returns null on no match", async () => {
    const result = await resolveEli({
      type: "wet",
      year: "1900",
      naturalId: "does-not-exist",
      validAt: null,
      articleNr: null,
    });
    expect(result).toBeNull();
  });

  test("resolves article slot when articleNr given", async () => {
    const sql = getDb();
    const [reg] = await sql<{ eli_uri: string }[]>`SELECT eli_uri FROM regulation WHERE bwb_id='BWBR0001840'`;
    const parts = reg!.eli_uri.split("/").filter(Boolean);
    const result = await resolveEli({
      type: "wet",
      year: parts[3]!,
      naturalId: parts[parts.length - 1]!,
      validAt: null,
      articleNr: "1",
    });
    expect(result).not.toBeNull();
    expect(result!.article).not.toBeNull();
    expect(result!.article!.number).toBe("1");
  });
});
