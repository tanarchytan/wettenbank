import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseManifest } from "../../src/ingest/parse-manifest.ts";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "real-grondwet-manifest.xml");

describe("parseManifest — Grondwet manifest", () => {
  test("extracts bwbId and latestItem", () => {
    const m = parseManifest(readFileSync(FIXTURE, "utf-8"));
    expect(m.bwbId).toBe("BWBR0001840");
    expect(m.latestItem).toBe("2023-02-22_0/xml/BWBR0001840_2023-02-22_0.xml");
  });

  test("extracts wtiLocation", () => {
    const m = parseManifest(readFileSync(FIXTURE, "utf-8"));
    expect(m.wtiLocation).toBe("BWBR0001840.WTI");
  });

  test("extracts root firstInwerkingtreding from work metadata", () => {
    const m = parseManifest(readFileSync(FIXTURE, "utf-8"));
    expect(m.firstInwerkingtreding).toBe("1840-09-12");
  });

  test("extracts all 11 states in chronological order", () => {
    const m = parseManifest(readFileSync(FIXTURE, "utf-8"));
    expect(m.states.length).toBe(11);
    // chronological order
    for (let i = 1; i < m.states.length; i++) {
      expect(m.states[i]!.validFrom >= m.states[i - 1]!.validFrom).toBe(true);
    }
  });

  test("first state is 2002-03-21 with correct xmlFilename", () => {
    const m = parseManifest(readFileSync(FIXTURE, "utf-8"));
    const first = m.states[0]!;
    expect(first.validFrom).toBe("2002-03-21");
    expect(first.validTo).toBe("2005-02-07");
    expect(first.xmlFilename).toBe("BWBR0001840_2002-03-21_0.xml");
  });

  test("last state is 2023-02-22 with sentinel validTo", () => {
    const m = parseManifest(readFileSync(FIXTURE, "utf-8"));
    const last = m.states[m.states.length - 1]!;
    expect(last.validFrom).toBe("2023-02-22");
    expect(last.validTo).toBe("9999-12-31");
    expect(last.xmlFilename).toBe("BWBR0001840_2023-02-22_0.xml");
  });
});
