#!/usr/bin/env bun
/**
 * koop-to-markdown.ts
 * Convert KOOP BWB delivery to an ELI-organised markdown tree.
 *
 * Usage:
 *   bun run bin/koop-to-markdown.ts [--source ./wetten] [--out ./docs/eli-index] [--limit N] [--bwb BWBR0001840] [--workers N] [--type wet] [--skip-existing]
 *
 * --workers N       Use N parallel worker threads (default: 1, sequential mode).
 *                   Use 0 to auto-detect (os.cpus().length).
 * --type T          Only process regulations where <soort-regeling> matches T
 *                   (case-insensitive). Comma-separated list OK: --type wet,AMvB
 * --skip-existing   Skip regulations whose README.md already exists and is newer
 *                   than manifest.xml (incremental/resumable runs).
 */

import { readdirSync, mkdirSync, existsSync, appendFileSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { cpus } from "node:os";
import { Worker } from "node:worker_threads";
import {
  loadKoopRegulationHeader,
  loadOneState,
  type LoadedRegulation,
} from "../src/ingest/load-koop-regulation.ts";
import { parseWti } from "../src/ingest/parse-wti.ts";
import { parseManifest } from "../src/ingest/parse-manifest.ts";
import { loadEliIndex, type EliEntry } from "../src/ingest/eli-index.ts";
import { listBwbDirs } from "../src/ingest/list-bwb-dirs.ts";
import { regulationContext, stateMarkdown, readmeMarkdown } from "../src/markdown/regulation-summary.ts";
import { buildOneStateReg, buildReadmeReg } from "../src/markdown/state-stub.ts";
import { upsertRegulation } from "../src/ingest/upsert.ts";
import {
  typeIndexMarkdown,
  rootIndexMarkdown,
  yearIndexMarkdown,
  type RegulationSummary,
} from "../src/markdown/index-builder.ts";
import type { WorkerTask, WorkerMessage } from "../src/markdown/worker.ts";

// ------------------------------------------------------------------ CLI args

const args = (() => {
  const raw = process.argv.slice(2);
  const map: Record<string, string | boolean> = {};
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = raw[i + 1];
      if (next && !next.startsWith("--")) {
        map[key] = next;
        i++;
      } else {
        map[key] = true;
      }
    }
  }
  return map;
})();

function getArg(flag: string, def: string): string {
  const v = args[flag];
  return typeof v === "string" ? v : def;
}

const SOURCE = getArg("source", "./wetten");
const OUT = getArg("out", "./docs/eli-index");
const LIMIT_RAW = getArg("limit", "");
const BWB_FILTER = getArg("bwb", "");
const WORKERS_RAW = getArg("workers", "1");
const LIMIT = LIMIT_RAW ? parseInt(LIMIT_RAW, 10) : null;
const SKIP_EXISTING = args["skip-existing"] === true || args["skip-existing"] === "true";
// --db: also upsert each parsed state into Postgres (default off — opt in)
// --no-markdown: skip writing .md files (useful when you only want DB ingest)
const UPSERT_DB = args["db"] === true || args["db"] === "true";
const WRITE_MARKDOWN = !(args["no-markdown"] === true || args["no-markdown"] === "true");
let WORKERS = parseInt(WORKERS_RAW, 10);
if (WORKERS === 0) WORKERS = cpus().length;
if (!Number.isFinite(WORKERS) || WORKERS < 1) WORKERS = 1;

const ALLOWED_TYPES = new Set<string>(
  (typeof args["type"] === "string" ? args["type"] : "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean),
);

// ------------------------------------------------------------------ progress bar

function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h${m}m${s}s`;
  if (m > 0) return `${m}m${s}s`;
  return `${s}s`;
}

class ProgressBar {
  private startTime = Date.now();
  private lastRender = 0;
  constructor(
    private total: number,
    private label: string = "Converting",
    private typeLabel: string = "",
  ) {}

  update(current: number, skipped: number, extra?: string): void {
    const now = Date.now();
    if (current < this.total && now - this.lastRender < 50) return;
    this.lastRender = now;

    const converted = current - skipped;
    const elapsed = (now - this.startTime) / 1000;
    // Rate is based on converted (not skipped — skips are near-instant)
    const rate = elapsed > 0 ? converted / elapsed : 0;
    const remaining = this.total - current;
    const eta = rate > 0 ? remaining / rate : 0;
    const pct = (current / this.total) * 100;
    const barWidth = 30;
    const filled = Math.min(barWidth, Math.floor((current / this.total) * barWidth));
    const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);

    const typeStr = this.typeLabel ? `[${this.typeLabel}] ` : "";
    const skipStr = skipped > 0 ? ` · skipped ${skipped}` : "";
    const line = `${this.label} ${typeStr}${bar} ${current}/${this.total} (${pct.toFixed(1)}%) · ${rate.toFixed(2)}/s · ETA ${formatDuration(eta)}${skipStr}${extra ? ` · ${extra}` : ""}`;

    if (process.stdout.isTTY) {
      process.stdout.write("\r\x1b[K" + line);
    } else {
      const lastPct = Math.floor(((current - 1) / this.total) * 20);
      const curPct = Math.floor((current / this.total) * 20);
      if (curPct > lastPct) process.stdout.write(line + "\n");
    }
  }

  finish(): void {
    if (process.stdout.isTTY) process.stdout.write("\n");
  }
}

// ------------------------------------------------------------------ helpers

function ensureDir(p: string): void {
  mkdirSync(p, { recursive: true });
}

async function writeFile(path: string, content: string): Promise<void> {
  ensureDir(dirname(path));
  await Bun.write(path, content);
}

function errorEntry(bwbId: string, dir: string, err: unknown): string {
  return (
    JSON.stringify({
      bwbId,
      dir,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.split("\n").slice(0, 5).join("\n") : undefined,
      ts: new Date().toISOString(),
    }) + "\n"
  );
}

// ------------------------------------------------------------------ streaming reg stubs

// State-stub builders live in src/markdown/state-stub.ts — gedeeld met worker.ts

// ------------------------------------------------------------------ type filter

/**
 * Find the WTI file path for a BWBR directory by reading the manifest.
 * Returns null if manifest.xml is absent or unreadable.
 */
function findWtiPath(dir: string): string | null {
  const manifestPath = join(dir, "manifest.xml");
  try {
    const manifestXml = readFileSync(manifestPath, "utf-8");
    const manifest = parseManifest(manifestXml);
    return join(dir, manifest.wtiLocation);
  } catch {
    return null;
  }
}

function loadTypeIndex(sourceRoot: string): Record<string, string> | null {
  const indexPath = join(sourceRoot, ".type-index.json");
  if (!existsSync(indexPath)) return null;
  try { return JSON.parse(readFileSync(indexPath, "utf-8")) as Record<string, string>; }
  catch { return null; }
}

interface FilteredDir {
  dir: string;
  eli: EliEntry | null; // pre-resolved; null = index miss → worker falls back to live derivation
}

/**
 * Filter directories by allowed types, returning (dir, eli) pairs.
 * Prefers .eli-index.json (collision-resolved). Falls back to .type-index.json,
 * then live WTI scan as last resort.
 */
function filterByType(
  dirs: string[],
  allowedTypes: Set<string>,
  limit: number | null,
  sourceRoot: string,
): FilteredDir[] {
  const eliIndex = loadEliIndex(sourceRoot);

  if (eliIndex) {
    const result: FilteredDir[] = [];
    for (const dir of dirs) {
      const bwbId = basename(dir);
      const eli = eliIndex[bwbId] ?? null;
      if (allowedTypes.size > 0) {
        if (!eli || !allowedTypes.has(eli.type.toLowerCase())) continue;
      }
      result.push({ dir, eli });
      if (limit != null && result.length >= limit) return result;
    }
    return result;
  }

  // Fallback: .type-index.json (no collision resolution, but fast)
  const typeIndex = loadTypeIndex(sourceRoot);
  if (typeIndex) {
    const result: FilteredDir[] = [];
    for (const dir of dirs) {
      const bwbId = basename(dir);
      const soort = typeIndex[bwbId];
      if (allowedTypes.size > 0 && (!soort || !allowedTypes.has(soort.toLowerCase()))) continue;
      result.push({ dir, eli: null });
      if (limit != null && result.length >= limit) return result;
    }
    return result;
  }

  // Last resort: live WTI scan (slow; no collision resolution)
  const result: FilteredDir[] = [];
  for (const dir of dirs) {
    try {
      if (allowedTypes.size > 0) {
        const wtiPath = findWtiPath(dir);
        if (!wtiPath) continue;
        const wtiXml = readFileSync(wtiPath, "utf-8");
        const wti = parseWti(wtiXml);
        if (wti.soort == null || !allowedTypes.has(wti.soort.toLowerCase())) continue;
      }
      result.push({ dir, eli: null });
      if (limit != null && result.length >= limit) return result;
    } catch { /* skip unreadable */ }
  }
  return result;
}


/**
 * Type-filter cache: persists the filtered dir list for a given source+type combination.
 * Stored as .type-filter-cache.json in the output directory.
 * Cache is valid when the total BWBR dir count is unchanged (cheap invalidation signal).
 */
interface TypeFilterCache {
  types: string;         // sorted type key, e.g. "amvb|minr"
  totalDirs: number;     // total BWBR dir count at time of caching
  entries: FilteredDir[]; // (dir, eli) pairs
  // legacy field — kept for backward compat reads; ignored on write
  dirs?: string[];
}

function loadTypeFilterCache(cachePath: string, typeKey: string, totalDirs: number): FilteredDir[] | null {
  try {
    const raw = readFileSync(cachePath, "utf-8");
    const cache: TypeFilterCache = JSON.parse(raw);
    if (cache.types === typeKey && cache.totalDirs === totalDirs) {
      // Support legacy cache that only stored dirs[]
      if (cache.entries) return cache.entries;
      if (cache.dirs) return cache.dirs.map((d) => ({ dir: d, eli: null }));
    }
  } catch {
    // no cache or invalid — fall through to full scan
  }
  return null;
}

function saveTypeFilterCache(cachePath: string, typeKey: string, totalDirs: number, entries: FilteredDir[]): void {
  try {
    const cache: TypeFilterCache = { types: typeKey, totalDirs, entries };
    writeFileSync(cachePath, JSON.stringify(cache));
  } catch {
    // best effort
  }
}

// ------------------------------------------------------------------ conversion log

interface LogEntry {
  ts: string;
  bwbId: string;
  type?: string | undefined;
  year?: string | undefined;
  slug?: string | undefined;
  statesWritten?: number | undefined;
  action: "converted" | "skipped" | "error";
  reason?: string | undefined;
  error?: string | undefined;
}

function writeConversionLog(logPath: string, entry: LogEntry): void {
  appendFileSync(logPath, JSON.stringify(entry) + "\n");
}

// ------------------------------------------------------------------ sequential path (workers=1)

async function processSequential(
  entries: FilteredDir[],
  errorsPath: string,
  logPath: string,
  bar: ProgressBar,
): Promise<{ summaries: RegulationSummary[]; written: number; errors: number; skipped: number }> {
  const summaries: RegulationSummary[] = [];
  let written = 0;
  let errors = 0;
  let skipped = 0;

  for (let i = 0; i < entries.length; i++) {
    const { dir, eli } = entries[i]!;
    const bwbId = dir.split(/[\\/]/).pop()!;

    try {
      const header = loadKoopRegulationHeader(dir);
      if (header.states.length === 0) {
        writeConversionLog(logPath, { ts: new Date().toISOString(), bwbId, action: "skipped", reason: "no-states" });
        skipped++;
        bar.update(i + 1, skipped, bwbId);
        continue;
      }

      const yearSource = header.manifestFirstInwerkingtreding ?? header.states[0]?.validFrom ?? "0000-01-01";
      const earliestYear = yearSource.slice(0, 4);
      // regulationContext needs a LoadedRegulation shape, but with the override
      // (from .eli-index.json) it ignores everything but the override.
      const stubReg: LoadedRegulation = {
        bwbId: header.bwbId,
        ministry: header.ministry,
        citetitle: header.citetitle,
        abbreviation: header.abbreviation,
        type: header.type,
        manifestFirstInwerkingtreding: header.manifestFirstInwerkingtreding,
        states: [],
      };
      const ctx = regulationContext(stubReg, earliestYear, eli ?? undefined);
      const { type, year, slug } = ctx;
      const eliUri = `/eli/nl/${type}/${year}/${slug}`;

      const regDir = join(OUT, type, year, slug);
      const readmePath = join(regDir, "README.md");

      // --skip-existing for MARKDOWN: skip writing .md if README is newer than manifest.
      // DB upsert still runs (it's idempotent via content_hash).
      let skipMarkdown = false;
      if (SKIP_EXISTING && WRITE_MARKDOWN && existsSync(readmePath)) {
        try {
          const readmeMtime = statSync(readmePath).mtimeMs;
          const manifestMtime = statSync(join(dir, "manifest.xml")).mtimeMs;
          if (readmeMtime > manifestMtime) {
            skipMarkdown = true;
            if (!UPSERT_DB) {
              const lastInfo = header.states[header.states.length - 1]!;
              const lastParsed = loadOneState(header, lastInfo);
              summaries.push({
                bwbId: header.bwbId, title: lastParsed?.title ?? "",
                type, year, slug,
                stateCount: header.states.length,
                ministry: header.ministry, abbreviation: header.abbreviation,
              });
              skipped++;
              writeConversionLog(logPath, { ts: new Date().toISOString(), bwbId, type, year, slug, statesWritten: 0, action: "skipped", reason: "unchanged" });
              bar.update(i + 1, skipped, bwbId);
              continue;
            }
          }
        } catch { /* stat failed — proceed with conversion */ }
      }

      if (WRITE_MARKDOWN && !skipMarkdown) ensureDir(regDir);

      // Stream: parse → write markdown + upsert DB → release each state. O(1 state body) in heap.
      let latestTitle = "";
      let latestCitetitle: string | null = null;
      let statesWritten = 0;
      for (let si = 0; si < header.states.length; si++) {
        const info = header.states[si]!;
        const parsed = loadOneState(header, info);
        if (parsed === null) continue;
        const oneStateReg = buildOneStateReg(header, parsed, si);

        if (WRITE_MARKDOWN && !skipMarkdown) {
          await writeFile(join(regDir, `${info.validFrom}.md`), stateMarkdown(oneStateReg, si, ctx));
        }

        if (UPSERT_DB) {
          await upsertRegulation({
            ...parsed,
            bwbId: header.bwbId,
            eliUri,
            type: parsed.type || header.type || "wet",
            ministry: header.ministry ?? parsed.ministry,
            abbreviation: header.abbreviation ?? parsed.abbreviation,
            citetitle: header.citetitle ?? parsed.citetitle,
          });
        }

        statesWritten++;
        if (si === header.states.length - 1) {
          latestTitle = parsed.title;
          latestCitetitle = parsed.citetitle;
        }
        // parsed, oneStateReg go out of scope — GC reclaims XML tree per iteration
      }

      if (statesWritten === 0) {
        writeConversionLog(logPath, { ts: new Date().toISOString(), bwbId, action: "skipped", reason: "no-states" });
        skipped++;
        bar.update(i + 1, skipped, bwbId);
        continue;
      }

      if (WRITE_MARKDOWN && !skipMarkdown) {
        const readmeReg = buildReadmeReg(header, latestTitle, latestCitetitle);
        await writeFile(readmePath, readmeMarkdown(readmeReg, ctx));
      }

      summaries.push({
        bwbId: header.bwbId,
        title: latestTitle,
        type,
        year,
        slug,
        stateCount: header.states.length,
        ministry: header.ministry,
        abbreviation: header.abbreviation,
      });

      written++;
      writeConversionLog(logPath, { ts: new Date().toISOString(), bwbId, type, year, slug, statesWritten, action: "converted" });
    } catch (err) {
      errors++;
      appendFileSync(errorsPath, errorEntry(bwbId, dir, err));
      writeConversionLog(logPath, { ts: new Date().toISOString(), bwbId, action: "error", error: err instanceof Error ? err.message : String(err) });
      process.stderr.write(`\n[ERROR] ${bwbId}: ${err instanceof Error ? err.message : String(err)}\n`);
    }

    bar.update(i + 1, skipped, bwbId);
  }

  return { summaries, written, errors, skipped };
}

// ------------------------------------------------------------------ parallel path (workers>1)

async function processParallel(
  entries: FilteredDir[],
  errorsPath: string,
  logPath: string,
  bar: ProgressBar,
  numWorkers: number,
): Promise<{ summaries: RegulationSummary[]; written: number; errors: number; skipped: number }> {
  const summaries: RegulationSummary[] = [];
  let written = 0;
  let errors = 0;
  let skipped = 0;
  let completed = 0;

  // Queue pointer — shared across all workers
  let nextIdx = 0;

  const workerPath = new URL("../src/markdown/worker.ts", import.meta.url);

  // Recycle a worker after this many tasks — prevents unbounded heap growth on
  // long runs (large XMLs accumulate in V8 heap even after function-scope GC).
  // Spawn cost is ~50-100 ms each, so amortise across ~500 tasks for negligible overhead.
  const RECYCLE_AFTER = 500;
  const taskCount = new WeakMap<Worker, number>();

  return new Promise((resolve, reject) => {
    const activeWorkers = new Set<Worker>();

    function sendNext(worker: Worker): void {
      if (nextIdx >= entries.length) {
        // No more work for this worker
        worker.terminate();
        activeWorkers.delete(worker);
        if (activeWorkers.size === 0) {
          resolve({ summaries, written, errors, skipped });
        }
        return;
      }

      const { dir, eli } = entries[nextIdx++]!;
      const task: WorkerTask = {
        kind: "task",
        dir,
        outRoot: OUT,
        errorsPath,
        skipExisting: SKIP_EXISTING,
        manifestPath: join(dir, "manifest.xml"),
        eli: eli ?? null,
        writeMarkdown: WRITE_MARKDOWN,
        upsertDb: UPSERT_DB,
      };
      worker.postMessage(task);
    }

    function recycleWorker(old: Worker): void {
      activeWorkers.delete(old);
      old.terminate();
      // Replace with a fresh worker that picks up the next task
      spawnWorker();
    }

    function spawnWorker(): void {
      const worker = new Worker(workerPath);
      taskCount.set(worker, 0);

      worker.on("message", (msg: WorkerMessage) => {
        completed++;
        const bwbId = msg.dir.split(/[\\/]/).pop()!;

        if (msg.kind === "done") {
          if (msg.summary) {
            summaries.push(msg.summary);
          }
          if (msg.action === "skipped") {
            skipped++;
            writeConversionLog(logPath, {
              ts: new Date().toISOString(),
              bwbId,
              ...(msg.summary && { type: msg.summary.type, year: msg.summary.year, slug: msg.summary.slug }),
              statesWritten: 0,
              action: "skipped",
              reason: msg.skipReason,
            });
          } else {
            written++;
            writeConversionLog(logPath, {
              ts: new Date().toISOString(),
              bwbId,
              ...(msg.summary && { type: msg.summary.type, year: msg.summary.year, slug: msg.summary.slug }),
              statesWritten: msg.statesWritten ?? msg.summary?.stateCount,
              action: "converted",
            });
          }
        } else {
          errors++;
          writeConversionLog(logPath, {
            ts: new Date().toISOString(),
            bwbId,
            action: "error",
            error: msg.error,
          });
          process.stderr.write(`\n[ERROR] ${bwbId}: ${msg.error}\n`);
        }

        bar.update(completed, skipped, bwbId);

        const n = (taskCount.get(worker) ?? 0) + 1;
        taskCount.set(worker, n);
        // Recycle this worker if it's done its share and there's still work in queue
        if (n >= RECYCLE_AFTER && nextIdx < entries.length) {
          recycleWorker(worker);
        } else {
          sendNext(worker);
        }
      });

      worker.on("error", (err) => {
        reject(err);
      });

      activeWorkers.add(worker);
      sendNext(worker);
    }

    const count = Math.min(numWorkers, entries.length);
    for (let i = 0; i < count; i++) {
      spawnWorker();
    }

    // Edge case: entries is empty
    if (entries.length === 0) {
      resolve({ summaries, written, errors, skipped });
    }
  });
}

// ------------------------------------------------------------------ main

async function main(): Promise<void> {
  // 1. Enumerate BWB directories (BWBR/BWBV/BWBW)
  let allDirs: string[];
  try {
    allDirs = listBwbDirs(SOURCE);
  } catch (err) {
    console.error(`Cannot read source directory: ${SOURCE}`, err);
    process.exit(1);
  }

  const totalFound = allDirs.length;
  console.log(`Found ${totalFound} BWB directories`);

  // Create OUT early so the type-filter cache can be stored there
  ensureDir(OUT);
  const cachePath = join(OUT, ".type-filter-cache.json");

  let entries: FilteredDir[];

  if (BWB_FILTER) {
    const filtered = allDirs.filter((d) => d.endsWith(BWB_FILTER));
    // Still load eli for the single dir if available
    const eliIndex = loadEliIndex(SOURCE);
    entries = filtered.map((dir) => ({
      dir,
      eli: eliIndex?.[basename(dir)] ?? null,
    }));
  } else {
    // Type filter (before limit) — uses cache for fast reruns
    if (ALLOWED_TYPES.size > 0) {
      const typeKey = [...ALLOWED_TYPES].sort().join("|");
      const cached = loadTypeFilterCache(cachePath, typeKey, totalFound);
      if (cached) {
        entries = cached.filter((e) => existsSync(e.dir));
        console.log(`Filtered to ${entries.length} matching types: [${[...ALLOWED_TYPES].join(", ")}] (from cache)`);
        if (LIMIT !== null) entries = entries.slice(0, LIMIT);
      } else {
        process.stdout.write(`Filtering by type: [${[...ALLOWED_TYPES].join(", ")}] — scanning index...`);
        // Short-circuit when --limit is set: stop scanning as soon as we have enough matches.
        // Full-corpus scan only happens when --limit is null (or when building the durable cache).
        entries = filterByType(allDirs, ALLOWED_TYPES, LIMIT, SOURCE);
        process.stdout.write(`\r\x1b[K`);
        console.log(`Filtered to ${entries.length} matching types: [${[...ALLOWED_TYPES].join(", ")}]`);
        // Only persist cache for full scans — partial scans (limit) are misleading
        if (LIMIT === null) saveTypeFilterCache(cachePath, typeKey, totalFound, entries);
      }
    } else {
      // No type filter — include all, attach eli where available
      const eliIndex = loadEliIndex(SOURCE);
      const slice = LIMIT !== null ? allDirs.slice(0, LIMIT) : allDirs;
      entries = slice.map((dir) => ({
        dir,
        eli: eliIndex?.[basename(dir)] ?? null,
      }));
    }
  }

  console.log(`Processing ${entries.length} regulation directories from ${SOURCE}`);
  console.log(`Output → ${OUT}`);
  console.log(`Workers: ${WORKERS}`);
  if (SKIP_EXISTING) console.log(`Mode: incremental (--skip-existing)`);

  const errorsPath = join(OUT, "errors.jsonl");
  const logPath = join(OUT, ".conversion-log.jsonl");
  await Bun.write(errorsPath, "");
  // Do NOT truncate the conversion log — it accumulates across runs

  const typeLabel = ALLOWED_TYPES.size === 1 ? [...ALLOWED_TYPES][0]! : ALLOWED_TYPES.size > 1 ? [...ALLOWED_TYPES].join(",") : "";
  const bar = new ProgressBar(entries.length, "Converting", typeLabel);

  const { summaries, written, errors, skipped } =
    WORKERS === 1
      ? await processSequential(entries, errorsPath, logPath, bar)
      : await processParallel(entries, errorsPath, logPath, bar, WORKERS);

  bar.finish();

  // 2. Write index files
  console.log(`\nWriting index files...`);

  const byType: Record<string, RegulationSummary[]> = {};
  for (const s of summaries) {
    (byType[s.type] ??= []).push(s);
  }

  const byTypeYear: Record<string, Record<string, RegulationSummary[]>> = {};
  for (const s of summaries) {
    (byTypeYear[s.type] ??= {});
    (byTypeYear[s.type]![s.year] ??= []).push(s);
  }

  for (const [type, typeSummaries] of Object.entries(byType)) {
    const yearMap = byTypeYear[type]!;
    for (const [year, yearSummaries] of Object.entries(yearMap)) {
      if (yearSummaries.length > 0) {
        await writeFile(join(OUT, type, year, "INDEX.md"), yearIndexMarkdown(type, year, yearSummaries));
      }
    }
    await writeFile(join(OUT, type, "INDEX.md"), typeIndexMarkdown(type, typeSummaries));
  }

  await writeFile(join(OUT, "INDEX.md"), rootIndexMarkdown(byType));

  console.log(`\nDone.`);
  console.log(`  Regulations converted : ${written}`);
  console.log(`  Regulations skipped   : ${skipped}`);
  console.log(`  Errors                : ${errors}`);
  if (errors > 0) {
    console.log(`  Error log             : ${errorsPath}`);
  }
  console.log(`  Conversion log        : ${logPath}`);
}

main()
  .then(() => {
    // Explicit exit guarantees worker_threads / pending IPC handles are released
    // even if any reference is still alive in the event loop.
    process.exit(0);
  })
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
