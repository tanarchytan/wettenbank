#!/usr/bin/env bun
/**
 * bench-koop.ts
 * Benchmark koop-to-markdown at multiple concurrency levels to find optimal worker count.
 *
 * Usage:
 *   bun run bin/bench-koop.ts [--sample N] [--levels 1,4,8,12,16] [--source ./wetten]
 */

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

// ------------------------------------------------------------------ config

const args = process.argv.slice(2);
function getArg(flag: string, def: string): string {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1]! : def;
}

const SAMPLE_SIZE = parseInt(getArg("--sample", "100"), 10);
const LEVELS_RAW = getArg("--levels", "1,4,8,12,16");
const LEVELS = LEVELS_RAW.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => n > 0);
const SOURCE = getArg("--source", "./wetten");
const BENCH_OUT = "./bench-out";

mkdirSync(BENCH_OUT, { recursive: true });

// ------------------------------------------------------------------ bench runner

interface BenchResult {
  workers: number;
  seconds: number;
  regsPerSec: number;
}

async function bench(workers: number): Promise<BenchResult> {
  const out = mkdtempSync(join(tmpdir(), `wetten-bench-w${workers}-`));
  const start = performance.now();

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      "bun",
      [
        "run",
        "bin/koop-to-markdown.ts",
        "--source",
        SOURCE,
        "--out",
        out,
        "--limit",
        String(SAMPLE_SIZE),
        "--workers",
        String(workers),
      ],
      { stdio: "pipe" },
    );

    // Capture stderr for error visibility but don't print during bench
    const stderrChunks: Buffer[] = [];
    proc.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    proc.stdout?.on("data", () => {}); // discard progress output

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        const stderr = Buffer.concat(stderrChunks).toString("utf-8").slice(0, 500);
        reject(new Error(`exit ${code}: ${stderr}`));
      }
    });

    proc.on("error", reject);
  });

  const seconds = (performance.now() - start) / 1000;
  const regsPerSec = SAMPLE_SIZE / seconds;

  // Clean up temp output
  try {
    rmSync(out, { recursive: true, force: true });
  } catch {
    // Non-fatal — temp dir cleanup failure on Windows
  }

  return { workers, seconds, regsPerSec };
}

// ------------------------------------------------------------------ main

async function main(): Promise<void> {
  console.log(`\n=== koop-to-markdown benchmark ===`);
  console.log(`Sample size  : ${SAMPLE_SIZE} regulations`);
  console.log(`Worker levels: ${LEVELS.join(", ")}`);
  console.log(`Source       : ${SOURCE}`);
  console.log("");

  // Warmup run to prime disk cache and Bun JIT
  console.log("Warmup run (8 workers)...");
  try {
    await bench(8);
    console.log("Warmup done.\n");
  } catch (err) {
    console.warn(`Warmup failed (non-fatal): ${err instanceof Error ? err.message : err}\n`);
  }

  const results: BenchResult[] = [];

  for (const w of LEVELS) {
    process.stdout.write(`Running ${w} worker(s)... `);
    try {
      const r = await bench(w);
      results.push(r);
      console.log(`${r.seconds.toFixed(1)}s = ${r.regsPerSec.toFixed(2)} regs/s`);
    } catch (err) {
      console.log(`FAILED: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (results.length === 0) {
    console.error("All benchmark runs failed.");
    process.exit(1);
  }

  // ------------------------------------------------------------------ table

  console.log("\n=== Results ===");
  console.log(
    "workers | seconds | regs/sec | full-45k ETA    | vs prev",
  );
  console.log(
    "--------|---------|----------|-----------------|--------",
  );

  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    const fullEtaMin = 45920 / r.regsPerSec / 60;
    const fullEtaH = fullEtaMin / 60;
    const etaStr =
      fullEtaH >= 1
        ? `${fullEtaH.toFixed(1)}h (${fullEtaMin.toFixed(0)}m)`
        : `${fullEtaMin.toFixed(1)}m`;

    let vsPrev = "—";
    if (i > 0) {
      const prev = results[i - 1]!;
      const gain = ((r.regsPerSec - prev.regsPerSec) / prev.regsPerSec) * 100;
      vsPrev = gain >= 0 ? `+${gain.toFixed(1)}%` : `${gain.toFixed(1)}%`;
    }

    console.log(
      `${String(r.workers).padStart(7)} | ${r.seconds.toFixed(1).padStart(7)} | ${r.regsPerSec.toFixed(2).padStart(8)} | ${etaStr.padEnd(15)} | ${vsPrev}`,
    );
  }

  // ------------------------------------------------------------------ pick optimal

  // Highest regs/sec where each increment gives >= 10% over previous winner
  let best = results[0]!;
  for (let i = 1; i < results.length; i++) {
    const cur = results[i]!;
    if (cur.regsPerSec > best.regsPerSec * 1.10) {
      best = cur;
    }
  }

  const bestEtaMin = 45920 / best.regsPerSec / 60;
  const bestEtaStr =
    bestEtaMin >= 60
      ? `${(bestEtaMin / 60).toFixed(1)}h`
      : `${bestEtaMin.toFixed(0)}m`;

  console.log(`\nRecommended: ${best.workers} workers`);
  console.log(
    `  ${best.regsPerSec.toFixed(2)} regs/s → ~${bestEtaStr} for full 45,920-reg corpus`,
  );

  // ------------------------------------------------------------------ save results to bench-out

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportPath = join(BENCH_OUT, `bench-${ts}.txt`);

  const lines: string[] = [
    `koop-to-markdown benchmark — ${new Date().toISOString()}`,
    `Sample: ${SAMPLE_SIZE} regs | Source: ${SOURCE}`,
    "",
    "workers | seconds | regs/sec | full-45k ETA    | vs prev",
    "--------|---------|----------|-----------------|--------",
  ];

  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    const fullEtaMin = 45920 / r.regsPerSec / 60;
    const fullEtaH = fullEtaMin / 60;
    const etaStr =
      fullEtaH >= 1
        ? `${fullEtaH.toFixed(1)}h (${fullEtaMin.toFixed(0)}m)`
        : `${fullEtaMin.toFixed(1)}m`;
    let vsPrev = "—";
    if (i > 0) {
      const prev = results[i - 1]!;
      const gain = ((r.regsPerSec - prev.regsPerSec) / prev.regsPerSec) * 100;
      vsPrev = gain >= 0 ? `+${gain.toFixed(1)}%` : `${gain.toFixed(1)}%`;
    }
    lines.push(
      `${String(r.workers).padStart(7)} | ${r.seconds.toFixed(1).padStart(7)} | ${r.regsPerSec.toFixed(2).padStart(8)} | ${etaStr.padEnd(15)} | ${vsPrev}`,
    );
  }

  lines.push("");
  lines.push(`Recommended: ${best.workers} workers (${best.regsPerSec.toFixed(2)} regs/s, ~${bestEtaStr} full run)`);

  await Bun.write(reportPath, lines.join("\n") + "\n");
  console.log(`\nReport saved: ${reportPath}`);
}

await main();
