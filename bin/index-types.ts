#!/usr/bin/env bun
/**
 * bin/index-types.ts — compatibility shim.
 * Delegates to bin/index-eli.ts, then writes .type-index.json as a projection
 * of .eli-index.json for callers that still read the old format.
 *
 * Usage:
 *   bun run bin/index-types.ts [--source ./wetten]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const SOURCE = process.argv.includes("--source")
  ? process.argv[process.argv.indexOf("--source") + 1]!
  : "./wetten";

// Run the real indexer
const result = spawnSync(
  process.execPath,  // bun
  [join(import.meta.dirname, "index-eli.ts"), "--source", SOURCE],
  { stdio: "inherit" },
);

if (result.status !== 0) process.exit(result.status ?? 1);

// Project eli-index → type-index (bwbId → soort string)
const eliIndexPath = join(SOURCE, ".eli-index.json");
if (!existsSync(eliIndexPath)) {
  console.error("eli-index.json not found after indexing — type-index not written");
  process.exit(1);
}

const eliIndex = JSON.parse(readFileSync(eliIndexPath, "utf-8")) as Record<string, { type: string; year: string; slug: string }>;
const typeIndex: Record<string, string> = {};
for (const [bwbId, entry] of Object.entries(eliIndex)) {
  typeIndex[bwbId] = entry.type;
}

writeFileSync(join(SOURCE, ".type-index.json"), JSON.stringify(typeIndex));
console.log(`type-index.json written (${Object.keys(typeIndex).length} entries)`);
