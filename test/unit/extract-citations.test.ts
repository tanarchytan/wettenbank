import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseBwbXml } from "../../src/ingest/parse-bwb-xml.ts";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "bwb-sample.xml");

describe("extractCitations", () => {
  test("regulations expose well-formed citation edges", () => {
    const xml = readFileSync(FIXTURE, "utf-8");
    const parsed = parseBwbXml(xml);
    expect(parsed.citations.length).toBeGreaterThanOrEqual(3);
    for (const c of parsed.citations) {
      expect(c.toBwbId).toMatch(/^BWB[A-Z]\d+$/);
      expect(["verwijzing", "wijziging", "grondslag"]).toContain(c.kind);
    }
    const kinds = new Set(parsed.citations.map((c) => c.kind));
    expect(kinds.has("verwijzing")).toBe(true);
    expect(kinds.has("wijziging")).toBe(true);
    expect(kinds.has("grondslag")).toBe(true);
  });
});
