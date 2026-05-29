import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseWti } from "../../src/ingest/parse-wti.ts";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "real-grondwet.wti");

describe("parseWti — Grondwet WTI", () => {
  test("extracts bwbId", () => {
    const wti = parseWti(readFileSync(FIXTURE, "utf-8"));
    expect(wti.bwbId).toBe("BWBR0001840");
  });

  test("extracts ministry", () => {
    const wti = parseWti(readFileSync(FIXTURE, "utf-8"));
    expect(wti.ministry).toBe("Binnenlandse Zaken en Koninkrijksrelaties");
  });

  test("extracts abbreviation (first)", () => {
    const wti = parseWti(readFileSync(FIXTURE, "utf-8"));
    expect(wti.abbreviation).toBe("GW");
  });

  test("extracts citetitle", () => {
    const wti = parseWti(readFileSync(FIXTURE, "utf-8"));
    expect(wti.citetitle).toBe("Grondwet");
  });

  test("extracts soort", () => {
    const wti = parseWti(readFileSync(FIXTURE, "utf-8"));
    expect(wti.soort).toBe("wet");
  });

  test("extracts time-ranged citetitles", () => {
    const wti = parseWti(readFileSync(FIXTURE, "utf-8"));
    expect(wti.citetitles.length).toBeGreaterThanOrEqual(1);
    for (const ct of wti.citetitles) {
      expect(ct.title).toBeTruthy();
      expect(ct.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
