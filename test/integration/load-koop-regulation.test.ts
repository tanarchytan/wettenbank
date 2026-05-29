import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadKoopRegulation } from "../../src/ingest/load-koop-regulation.ts";

const KOOP_DIR = join(import.meta.dir, "..", "..", "wetten", "BWBR0001840");
const dataPresent = existsSync(join(KOOP_DIR, "manifest.xml"));

describe("loadKoopRegulation — BWBR0001840 (Grondwet)", () => {
  test.todoIf(!dataPresent)(
    "loads bwbId and ministry from WTI",
    () => {
      const loaded = loadKoopRegulation(KOOP_DIR);
      expect(loaded.bwbId).toBe("BWBR0001840");
      expect(loaded.ministry).toBe("Binnenlandse Zaken en Koninkrijksrelaties");
    },
  );

  test.todoIf(!dataPresent)(
    "loads citetitle and abbreviation from WTI",
    () => {
      const loaded = loadKoopRegulation(KOOP_DIR);
      expect(loaded.citetitle).toBe("Grondwet");
      expect(loaded.abbreviation).toBe("GW");
    },
  );

  test.todoIf(!dataPresent)(
    "loads all 11 states",
    () => {
      const loaded = loadKoopRegulation(KOOP_DIR);
      expect(loaded.states.length).toBeGreaterThanOrEqual(5);
      // All 11 states present in wetten/ dir
      expect(loaded.states.length).toBe(11);
    },
  );

  test.todoIf(!dataPresent)(
    "latest state has validFrom 2023-02-22",
    () => {
      const loaded = loadKoopRegulation(KOOP_DIR);
      const latest = loaded.states[loaded.states.length - 1]!;
      expect(latest.validFrom).toBe("2023-02-22");
    },
  );

  test.todoIf(!dataPresent)(
    "states are sorted chronologically",
    () => {
      const loaded = loadKoopRegulation(KOOP_DIR);
      for (let i = 1; i < loaded.states.length; i++) {
        expect(loaded.states[i]!.validFrom >= loaded.states[i - 1]!.validFrom).toBe(true);
      }
    },
  );

  test.todoIf(!dataPresent)(
    "latest state has 142+ articles and correct WTI overrides",
    () => {
      const loaded = loadKoopRegulation(KOOP_DIR);
      const latest = loaded.states[loaded.states.length - 1]!;
      expect(latest.articles.length).toBeGreaterThanOrEqual(142);
      expect(latest.ministry).toBe("Binnenlandse Zaken en Koninkrijksrelaties");
      expect(latest.citetitle).toBe("Grondwet");
    },
  );

  test.todoIf(!dataPresent)(
    "each state has a sourceXmlPath that exists",
    () => {
      const loaded = loadKoopRegulation(KOOP_DIR);
      for (const state of loaded.states) {
        expect(existsSync(state.sourceXmlPath)).toBe(true);
      }
    },
  );
});
