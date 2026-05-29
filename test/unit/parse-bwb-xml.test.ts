import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseBwbXml } from "../../src/ingest/parse-bwb-xml.ts";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "bwb-sample.xml");
const REAL_FIXTURE = join(import.meta.dir, "..", "fixtures", "real-grondwet-2023-02-22.xml");

describe("parseBwbXml — metadata", () => {
  test("extracts bwb_id, title, type, ministry, valid_from", () => {
    const xml = readFileSync(FIXTURE, "utf-8");
    const parsed = parseBwbXml(xml);
    expect(parsed.bwbId).toBe("BWBR0001840");
    expect(parsed.title.toLowerCase()).toContain("grondwet");
    expect(parsed.type).toBe("wet");
    expect(parsed.ministry).toBeTruthy();
    expect(parsed.validFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("parseBwbXml — articles", () => {
  test("extracts articles in document order with stable anchor IDs", () => {
    const xml = readFileSync(FIXTURE, "utf-8");
    const parsed = parseBwbXml(xml);
    expect(parsed.articles.length).toBeGreaterThan(0);

    for (let i = 0; i < parsed.articles.length; i++) {
      expect(parsed.articles[i]!.ord).toBe(i);
    }

    for (const a of parsed.articles) {
      expect(a.number).toBeTruthy();
      expect(a.anchorId).toBeTruthy();
      expect(a.bodyText.length).toBeGreaterThan(0);
    }

    expect(parsed.articles[0]!.anchorId).toMatch(/Artikel/);
  });
});

describe("parseBwbXml — real KOOP schema (Grondwet 2023-02-22)", () => {
  test("extracts bwbId, type, validFrom", () => {
    const xml = readFileSync(REAL_FIXTURE, "utf-8");
    const parsed = parseBwbXml(xml);
    expect(parsed.bwbId).toBe("BWBR0001840");
    expect(parsed.type).toBe("wet");
    expect(parsed.validFrom).toBe("2023-02-22");
  });

  test("title contains 'Grondwet voor het Koninkrijk'", () => {
    const xml = readFileSync(REAL_FIXTURE, "utf-8");
    const parsed = parseBwbXml(xml);
    expect(parsed.title).toContain("Grondwet voor het Koninkrijk");
  });

  test("extracts 142+ articles", () => {
    const xml = readFileSync(REAL_FIXTURE, "utf-8");
    const parsed = parseBwbXml(xml);
    expect(parsed.articles.length).toBeGreaterThanOrEqual(142);
  });

  test("articles have stable ord, non-empty bodyText, non-empty anchorId", () => {
    const xml = readFileSync(REAL_FIXTURE, "utf-8");
    const parsed = parseBwbXml(xml);
    for (let i = 0; i < parsed.articles.length; i++) {
      expect(parsed.articles[i]!.ord).toBe(i);
    }
    for (const a of parsed.articles) {
      expect(a.number).toBeTruthy();
      expect(a.anchorId).toMatch(/Artikel/);
      expect(a.bodyText.length).toBeGreaterThan(0);
    }
  });

  test("first article inside Hoofdstuk1 has correct number and anchorId", () => {
    const xml = readFileSync(REAL_FIXTURE, "utf-8");
    const parsed = parseBwbXml(xml);
    // First artikel in document order is the flat /Artikel (Algemene bepaling), second is Hoofdstuk1/Artikel1
    const art1 = parsed.articles.find((a) => a.number === "1" && a.anchorId.includes("Hoofdstuk1"));
    expect(art1).toBeDefined();
    expect(art1!.bodyText.length).toBeGreaterThan(0);
  });

  test("citations array exists (may be empty for Grondwet body)", () => {
    const xml = readFileSync(REAL_FIXTURE, "utf-8");
    const parsed = parseBwbXml(xml);
    expect(Array.isArray(parsed.citations)).toBe(true);
  });
});
