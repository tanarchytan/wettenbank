/**
 * test/integration/koop-to-markdown-filter.test.ts
 *
 * Integration tests for --type filter, --skip-existing, and .conversion-log.jsonl.
 *
 * These tests require the KOOP delivery to be present in ./wetten/.
 * They skip gracefully when data is absent.
 *
 * Performance note: first run scans 42k WTI files (~6 min). Subsequent runs load from
 * .type-filter-cache.json and complete in seconds. The test timeout is set to 15 min
 * to accommodate the initial scan. The --skip-existing rerun shares the same --out
 * directory so it benefits from the cache written by the first run.
 */

import { describe, expect, test, afterAll, beforeAll } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const WETTEN_DIR = join(import.meta.dir, "..", "..", "wetten");
const TMP_OUT = join(import.meta.dir, "..", "tmp", "filter-test");
const SCRIPT = join(import.meta.dir, "..", "..", "bin", "koop-to-markdown.ts");

// Check if at least one BWBR dir exists (BWBR0001840 = Grondwet, type=wet)
const dataPresent = existsSync(join(WETTEN_DIR, "BWBR0001840", "manifest.xml"));

// 15 min per-test timeout — first run scans 42k WTI files (~6 min).
// Subsequent runs use the .type-filter-cache.json and finish in seconds.
const TEST_TIMEOUT = 900_000;

afterAll(() => {
  if (existsSync(TMP_OUT)) {
    try {
      rmSync(TMP_OUT, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }
});

// ------------------------------------------------------------------ shared state for all tests

let filterExitCode: number | null = null;
let filterStdout = "";

let skipExitCode: number | null = null;
let skipStdout = "";

/**
 * One shared beforeAll runs both subprocess invocations sequentially.
 * The second invocation reuses the .type-filter-cache.json from the first,
 * so the total wall time is roughly: (WTI scan ~6 min) + (stat-only rerun ~4s).
 */
beforeAll(async () => {
  if (!dataPresent) return;

  // Run 1: convert 5 wet regs into TMP_OUT
  {
    const proc = Bun.spawn(
      [
        "bun",
        "run",
        SCRIPT,
        "--source", WETTEN_DIR,
        "--out", TMP_OUT,
        "--type", "wet",
        "--limit", "5",
        "--workers", "1",
      ],
      { stdout: "pipe", stderr: "pipe" },
    );

    const [outBuf] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    filterExitCode = await proc.exited;
    filterStdout = outBuf;
  }

  // Run 2: same --out, --skip-existing — hits .type-filter-cache.json from run 1
  {
    const proc = Bun.spawn(
      [
        "bun", "run", SCRIPT,
        "--source", WETTEN_DIR,
        "--out", TMP_OUT,
        "--type", "wet",
        "--limit", "5",
        "--workers", "1",
        "--skip-existing",
      ],
      { stdout: "pipe", stderr: "pipe" },
    );

    const [outBuf] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    skipExitCode = await proc.exited;
    skipStdout = outBuf;
  }
}, TEST_TIMEOUT);

// ------------------------------------------------------------------ filter tests

describe("koop-to-markdown CLI — --type filter + conversion log", () => {
  test.todoIf(!dataPresent)(
    "script exits successfully",
    () => {
      expect(filterExitCode).toBe(0);
    },
    TEST_TIMEOUT,
  );

  test.todoIf(!dataPresent)(
    "stdout reports filtered type",
    () => {
      expect(filterStdout).toContain("wet");
    },
    TEST_TIMEOUT,
  );

  test.todoIf(!dataPresent)(
    "output directory exists",
    () => {
      expect(existsSync(TMP_OUT)).toBe(true);
    },
    TEST_TIMEOUT,
  );

  test.todoIf(!dataPresent)(
    "wet/ subdirectory exists in output",
    () => {
      expect(existsSync(join(TMP_OUT, "wet"))).toBe(true);
    },
    TEST_TIMEOUT,
  );

  test.todoIf(!dataPresent)(
    "no non-wet type directories exist in output",
    () => {
      const nonWetTypes = ["AMvB", "MinR", "verdrag", "beleid", "circulaire", "ZBO", "bedrijf", "reglement"];
      for (const t of nonWetTypes) {
        expect(existsSync(join(TMP_OUT, t))).toBe(false);
      }
    },
    TEST_TIMEOUT,
  );

  test.todoIf(!dataPresent)(
    ".conversion-log.jsonl exists",
    () => {
      expect(existsSync(join(TMP_OUT, ".conversion-log.jsonl"))).toBe(true);
    },
    TEST_TIMEOUT,
  );

  test.todoIf(!dataPresent)(
    ".conversion-log.jsonl has at least 1 entry with action=converted",
    () => {
      const logPath = join(TMP_OUT, ".conversion-log.jsonl");
      const lines = readFileSync(logPath, "utf-8").trim().split("\n").filter(Boolean);
      expect(lines.length).toBeGreaterThan(0);

      const entries = lines.map((l) => JSON.parse(l));
      const converted = entries.filter((e: { action: string }) => e.action === "converted");
      expect(converted.length).toBeGreaterThan(0);
    },
    TEST_TIMEOUT,
  );

  test.todoIf(!dataPresent)(
    "every converted log entry has type=wet",
    () => {
      const logPath = join(TMP_OUT, ".conversion-log.jsonl");
      const lines = readFileSync(logPath, "utf-8").trim().split("\n").filter(Boolean);
      const entries = lines.map((l) => JSON.parse(l));
      const converted = entries.filter((e: { action: string }) => e.action === "converted");
      for (const e of converted) {
        expect(e.type).toBe("wet");
      }
    },
    TEST_TIMEOUT,
  );
});

// ------------------------------------------------------------------ skip-existing tests

describe("koop-to-markdown CLI — --skip-existing resumability", () => {
  test.todoIf(!dataPresent)(
    "second run with --skip-existing succeeds",
    () => {
      expect(skipExitCode).toBe(0);
    },
    TEST_TIMEOUT,
  );

  test.todoIf(!dataPresent)(
    "second run reports converted=0 (all skipped)",
    () => {
      expect(skipStdout).toContain("converted : 0");
    },
    TEST_TIMEOUT,
  );

  test.todoIf(!dataPresent)(
    "conversion log accumulates entries across runs (converted + skipped-unchanged)",
    () => {
      const logPath = join(TMP_OUT, ".conversion-log.jsonl");
      const lines = readFileSync(logPath, "utf-8").trim().split("\n").filter(Boolean);
      // Both runs combined: at least 5 converted + some skipped-unchanged
      expect(lines.length).toBeGreaterThanOrEqual(5);
      const entries = lines.map((l) => JSON.parse(l));
      const skipped = entries.filter(
        (e: { action: string; reason?: string }) =>
          e.action === "skipped" && e.reason === "unchanged",
      );
      expect(skipped.length).toBeGreaterThan(0);
    },
    TEST_TIMEOUT,
  );

  test.todoIf(!dataPresent)(
    "stdout shows (from cache) on second run",
    () => {
      expect(skipStdout).toContain("from cache");
    },
    TEST_TIMEOUT,
  );
});
