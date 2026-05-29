import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GET } from "../../app/api/eli/[...slug]/route.ts";
import { runMigrations } from "../../bin/migrate.ts";
import { getDb, closeDb } from "../../src/db.ts";
import { parseBwbXml } from "../../src/ingest/parse-bwb-xml.ts";
import { upsertRegulation } from "../../src/ingest/upsert.ts";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "bwb-sample.xml");

let eliPath: string[] = [];

beforeAll(async () => {
  await runMigrations();
  const sql = getDb();
  await sql`TRUNCATE regulation_state, article, citation, regulation CASCADE`;
  await upsertRegulation(parseBwbXml(readFileSync(FIXTURE, "utf-8")));
  const [reg] = await sql<{ eli_uri: string }[]>`SELECT eli_uri FROM regulation WHERE bwb_id='BWBR0001840'`;
  eliPath = reg!.eli_uri.split("/").filter(Boolean).slice(1); // strip leading 'eli'
});

afterAll(async () => { await closeDb(); });

function ctx(slug: string[]) {
  return { params: Promise.resolve({ slug }) };
}

describe("GET /api/eli/[...slug]", () => {
  test("HTML request redirects to /eli/*", async () => {
    const res = await GET(new Request(`http://localhost/api/eli/${eliPath.join("/")}`), ctx(eliPath));
    expect(res.status).toBe(302);
    const location = res.headers.get("Location");
    expect(location).toContain(`/eli/${eliPath.join("/")}`);
  });

  test("XML rep returns body_xml", async () => {
    const req = new Request(`http://localhost/api/eli/${eliPath.join("/")}`, {
      headers: { Accept: "application/xml" },
    });
    const res = await GET(req, ctx(eliPath));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/xml");
    const text = await res.text();
    expect(text).toContain("BWBR0001840");
  });

  test("JSON-LD rep returns structured metadata", async () => {
    const req = new Request(`http://localhost/api/eli/${eliPath.join("/")}`, {
      headers: { Accept: "application/ld+json" },
    });
    const res = await GET(req, ctx(eliPath));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/ld+json");
    const body = await res.json() as { "@id": string; "dcterms:identifier": string };
    expect(body["dcterms:identifier"]).toBe("BWBR0001840");
  });

  test("PDF rep returns 200 with valid PDF bytes", async () => {
    const req = new Request(`http://localhost/api/eli/${eliPath.join("/")}`, {
      headers: { Accept: "application/pdf" },
    });
    const res = await GET(req, ctx(eliPath));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/pdf");
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(String.fromCharCode(...buf.slice(0, 5))).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(1000);
  });

  test("404 on unknown reg", async () => {
    const fake = ["nl", "wet", "1900", "does-not-exist"];
    const res = await GET(new Request(`http://localhost/api/eli/${fake.join("/")}`), ctx(fake));
    expect(res.status).toBe(404);
  });

  test("immutable Cache-Control for date-stamped URI", async () => {
    const dated = [...eliPath, "2023-02-22"];
    const req = new Request(`http://localhost/api/eli/${dated.join("/")}`, {
      headers: { Accept: "application/xml" },
    });
    const res = await GET(req, ctx(dated));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("immutable");
  });

  test("latest URI gets SWR Cache-Control", async () => {
    const req = new Request(`http://localhost/api/eli/${eliPath.join("/")}`, {
      headers: { Accept: "application/xml" },
    });
    const res = await GET(req, ctx(eliPath));
    expect(res.headers.get("Cache-Control")).toContain("stale-while-revalidate");
  });

  test("Vary: Accept set", async () => {
    const req = new Request(`http://localhost/api/eli/${eliPath.join("/")}`, {
      headers: { Accept: "application/xml" },
    });
    const res = await GET(req, ctx(eliPath));
    expect(res.headers.get("Vary")).toContain("Accept");
  });
});
