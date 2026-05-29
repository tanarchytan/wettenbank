import { describe, expect, test, afterAll } from "bun:test";
import { existsSync, readdirSync as _readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

function readdirSync(p: string): string[] {
  try {
    return _readdirSync(p);
  } catch {
    return [];
  }
}

const KOOP_DIR = join(import.meta.dir, "..", "..", "wetten", "BWBR0001840");
const TMP_OUT = join(import.meta.dir, "..", "tmp", "eli-out");
const dataPresent = existsSync(join(KOOP_DIR, "manifest.xml"));

// Cleanup after tests
afterAll(() => {
  if (existsSync(TMP_OUT)) {
    try {
      rmSync(TMP_OUT, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }
});

describe("koop-to-markdown CLI — BWBR0001840 (Grondwet)", () => {
  // Run the script once; subsequent tests read its output
  let ran = false;
  let grondwetDir: string | null = null;

  async function ensureRan(): Promise<void> {
    if (ran) return;
    ran = true;

    const proc = Bun.spawn(
      [
        "bun",
        "run",
        join(import.meta.dir, "..", "..", "bin", "koop-to-markdown.ts"),
        "--source",
        join(import.meta.dir, "..", "..", "wetten"),
        "--bwb",
        "BWBR0001840",
        "--out",
        TMP_OUT,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );

    await proc.exited;

    // Find the generated grondwet directory
    // Expected: TMP_OUT/wet/1840/grondwet/ or similar year
    const wetDir = join(TMP_OUT, "wet");
    if (!existsSync(wetDir)) return;

    for (const year of readdirSync(wetDir)) {
      const slugDir = join(wetDir, year);
      if (!existsSync(join(slugDir, "grondwet"))) continue;
      grondwetDir = join(slugDir, "grondwet");
      break;
    }

    // Also try direct path if above fails
    if (!grondwetDir) {
      // Walk to find any directory with a README.md containing BWBR0001840
      for (const year of readdirSync(wetDir)) {
        const yearPath = join(wetDir, year);
        for (const slug of readdirSync(yearPath)) {
          const readmePath = join(yearPath, slug, "README.md");
          if (existsSync(readmePath)) {
            const content = readFileSync(readmePath, "utf-8");
            if (content.includes("BWBR0001840")) {
              grondwetDir = join(yearPath, slug);
              break;
            }
          }
        }
        if (grondwetDir) break;
      }
    }
  }

  test.todoIf(!dataPresent)(
    "README.md exists in grondwet directory",
    async () => {
      await ensureRan();
      expect(grondwetDir).not.toBeNull();
      const readmePath = join(grondwetDir!, "README.md");
      expect(existsSync(readmePath)).toBe(true);
    },
  );

  test.todoIf(!dataPresent)(
    "README.md contains BWB-id and version table",
    async () => {
      await ensureRan();
      const readmePath = join(grondwetDir!, "README.md");
      const content = readFileSync(readmePath, "utf-8");
      expect(content).toContain("BWBR0001840");
      expect(content).toContain("## Versies");
      expect(content).toContain("Geldend van");
    },
  );

  test.todoIf(!dataPresent)(
    "at least 5 dated .md files exist",
    async () => {
      await ensureRan();
      const files = readdirSync(grondwetDir!).filter((f) =>
        /^\d{4}-\d{2}-\d{2}\.md$/.test(f),
      );
      expect(files.length).toBeGreaterThanOrEqual(5);
    },
  );

  test.todoIf(!dataPresent)(
    "2023-02-22.md exists with frontmatter and article text",
    async () => {
      await ensureRan();
      const statePath = join(grondwetDir!, "2023-02-22.md");
      expect(existsSync(statePath)).toBe(true);
      const content = readFileSync(statePath, "utf-8");
      // Has frontmatter
      expect(content.startsWith("---\n")).toBe(true);
      // Has BWB id in frontmatter
      expect(content).toContain("bwb_id: BWBR0001840");
      // Has article 1 content
      expect(content).toContain("Allen die zich in Nederland bevinden");
    },
  );

  test.todoIf(!dataPresent)(
    "root INDEX.md exists",
    async () => {
      await ensureRan();
      expect(existsSync(join(TMP_OUT, "INDEX.md"))).toBe(true);
    },
  );

  test.todoIf(!dataPresent)(
    "wet/INDEX.md exists",
    async () => {
      await ensureRan();
      expect(existsSync(join(TMP_OUT, "wet", "INDEX.md"))).toBe(true);
    },
  );
});

