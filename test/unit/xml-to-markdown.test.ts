import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadKoopRegulation } from "../../src/ingest/load-koop-regulation.ts";
import { bodyToMarkdown } from "../../src/markdown/xml-to-markdown.ts";

const KOOP_DIR = join(import.meta.dir, "..", "..", "wetten", "BWBR0001840");
const dataPresent = existsSync(join(KOOP_DIR, "manifest.xml"));

describe("bodyToMarkdown — Grondwet 2023-02-22", () => {
  test.todoIf(!dataPresent)(
    "returns non-empty markdown",
    () => {
      const reg = loadKoopRegulation(KOOP_DIR);
      const latest = reg.states[reg.states.length - 1]!;
      const md = bodyToMarkdown(latest);
      expect(md.length).toBeGreaterThan(100);
    },
  );

  test.todoIf(!dataPresent)(
    "contains Hoofdstuk 1 heading",
    () => {
      const reg = loadKoopRegulation(KOOP_DIR);
      const latest = reg.states[reg.states.length - 1]!;
      const md = bodyToMarkdown(latest);
      expect(md).toContain("## Hoofdstuk 1");
    },
  );

  test.todoIf(!dataPresent)(
    "contains Artikel 1 heading",
    () => {
      const reg = loadKoopRegulation(KOOP_DIR);
      const latest = reg.states[reg.states.length - 1]!;
      const md = bodyToMarkdown(latest);
      expect(md).toContain("### Artikel 1");
    },
  );

  test.todoIf(!dataPresent)(
    "contains actual Grondwet article 1 text",
    () => {
      const reg = loadKoopRegulation(KOOP_DIR);
      const latest = reg.states[reg.states.length - 1]!;
      const md = bodyToMarkdown(latest);
      // Article 1 text in the 2023 state
      expect(md).toContain("Allen die zich in Nederland bevinden");
    },
  );

  test.todoIf(!dataPresent)(
    "contains multiple chapters",
    () => {
      const reg = loadKoopRegulation(KOOP_DIR);
      const latest = reg.states[reg.states.length - 1]!;
      const md = bodyToMarkdown(latest);
      expect(md).toContain("## Hoofdstuk 2");
    },
  );
});
