#!/usr/bin/env bun
/**
 * bin/index-eli.ts
 * One-shot scan of all KOOP BWBR directories to build a deterministic ELI index.
 * Resolves slug collisions by appending the BWB-id to all members of a colliding group.
 * Writes <source>/.eli-index.json.
 *
 * Usage:
 *   bun run bin/index-eli.ts [--source ./wetten]
 */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { parseWti } from "../src/ingest/parse-wti.ts";
import { parseManifest } from "../src/ingest/parse-manifest.ts";
import { slugify } from "../src/markdown/eli-path.ts";

const SOURCE = process.argv.includes("--source")
  ? process.argv[process.argv.indexOf("--source") + 1]!
  : "./wetten";

const OUT = join(SOURCE, ".eli-index.json");

// ------------------------------------------------------------------ helpers

function findWtiPath(dir: string): string | null {
  const bwbId = basename(dir);
  const direct = join(dir, `${bwbId}.WTI`);
  if (existsSync(direct)) return direct;
  try {
    const manifestPath = join(dir, "manifest.xml");
    if (!existsSync(manifestPath)) return null;
    const manifest = parseManifest(readFileSync(manifestPath, "utf-8"));
    const p = join(dir, manifest.wtiLocation);
    return existsSync(p) ? p : null;
  } catch { return null; }
}

function findManifestFirstInwerkingtreding(dir: string): string | null {
  try {
    const manifestPath = join(dir, "manifest.xml");
    if (!existsSync(manifestPath)) return null;
    const manifest = parseManifest(readFileSync(manifestPath, "utf-8"));
    return manifest.firstInwerkingtreding ?? null;
  } catch { return null; }
}

// ------------------------------------------------------------------ scan

const start = performance.now();
const entries = readdirSync(SOURCE)
  // BWBR = regelingen, BWBV = verdragen, BWBW = wijzigingen
  .filter((e) => /^BWB[A-Z]\d+$/i.test(e))
  .map((e) => join(SOURCE, e))
  .filter((p) => {
    try { return statSync(p).isDirectory(); } catch { return false; }
  });

console.log(`Scanning ${entries.length} BWBR directories under ${SOURCE}...`);

interface RawEntry {
  bwbId: string;
  type: string;
  year: string;
  baseSlug: string;
}

const raw: RawEntry[] = [];
let skipped = 0;
const total = entries.length;

for (let i = 0; i < total; i++) {
  const dir = entries[i]!;
  const bwbId = basename(dir);
  try {
    const wtiPath = findWtiPath(dir);
    if (!wtiPath) { skipped++; continue; }
    const wti = parseWti(readFileSync(wtiPath, "utf-8"));
    if (!wti.soort) { skipped++; continue; }

    const type = wti.soort.toLowerCase();

    // Year: prefer manifest firstInwerkingtreding, fallback to WTI or "0000"
    const fiDate = findManifestFirstInwerkingtreding(dir);
    const year = fiDate ? fiDate.slice(0, 4) : "0000";

    const citetitle = wti.citetitle ?? null;
    const baseSlug = citetitle ? slugify(citetitle) : bwbId.toLowerCase();

    raw.push({ bwbId, type, year, baseSlug });
  } catch { skipped++; }

  if (process.stdout.isTTY && (i + 1) % 500 === 0) {
    const pct = ((i + 1) / total * 100).toFixed(1);
    const elapsed = (performance.now() - start) / 1000;
    const rate = (i + 1) / elapsed;
    const eta = (total - i - 1) / rate;
    process.stdout.write(`\r\x1b[K  ${i + 1}/${total} (${pct}%) · ${rate.toFixed(0)}/s · ETA ${Math.ceil(eta)}s`);
  }
}
if (process.stdout.isTTY) process.stdout.write("\n");

// ------------------------------------------------------------------ collision resolution

// Group by (type, year, baseSlug)
const groups = new Map<string, RawEntry[]>();
for (const entry of raw) {
  const key = `${entry.type}\x00${entry.year}\x00${entry.baseSlug}`;
  const g = groups.get(key);
  if (g) {
    g.push(entry);
  } else {
    groups.set(key, [entry]);
  }
}

// Build final index: colliders get BWB-id suffix
const index: Record<string, { type: string; year: string; slug: string }> = {};

let collisionGroups = 0;
let collisionRegs = 0;
let largestGroupSize = 0;
let largestGroupSlug = "";

for (const [, group] of groups) {
  if (group.length === 1) {
    const e = group[0]!;
    index[e.bwbId] = { type: e.type, year: e.year, slug: e.baseSlug };
  } else {
    // All members get BWB-id suffix for determinism
    collisionGroups++;
    collisionRegs += group.length;
    if (group.length > largestGroupSize) {
      largestGroupSize = group.length;
      largestGroupSlug = group[0]!.baseSlug;
    }
    for (const e of group) {
      index[e.bwbId] = {
        type: e.type,
        year: e.year,
        slug: `${e.baseSlug}-${e.bwbId.toLowerCase()}`,
      };
    }
  }
}

// ------------------------------------------------------------------ persist

writeFileSync(OUT, JSON.stringify(index));

const elapsed = ((performance.now() - start) / 1000).toFixed(0);
const indexedCount = Object.keys(index).length;
const fileSizeKb = (Buffer.byteLength(JSON.stringify(index)) / 1024).toFixed(0);
const fileSizeMb = (Buffer.byteLength(JSON.stringify(index)) / 1024 / 1024).toFixed(1);

console.log(`Indexed ${indexedCount} regulations in ${elapsed}s (${skipped} skipped)`);
if (collisionGroups > 0) {
  console.log(`Collisions detected: ${collisionRegs} regulations across ${collisionGroups} colliding slugs`);
  console.log(`  Largest collision group: ${largestGroupSize} regulations sharing slug "${largestGroupSlug}"`);
} else {
  console.log(`Collisions detected: 0`);
}
console.log(`Index written to ${OUT} (${fileSizeMb} MB)`);
