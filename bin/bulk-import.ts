#!/usr/bin/env bun
import { basename } from "node:path";
import { parseArgs } from "node:util";
import { getDb, closeDb } from "../src/db.ts";
import {
  loadKoopRegulationHeader,
  loadOneState,
  type RegulationHeader,
  type LoadedState,
} from "../src/ingest/load-koop-regulation.ts";
import { upsertRegulation } from "../src/ingest/upsert.ts";
import type { ParsedRegulation } from "../src/ingest/parse-bwb-xml.ts";
import { listBwbDirs } from "../src/ingest/list-bwb-dirs.ts";
import { loadEliIndex } from "../src/ingest/eli-index.ts";
import { log } from "../src/log.ts";
import { ProgressBar } from "./_progress.ts";

interface Args {
  dir: string;
  limit: number | null;
  type: string | null;
  skipExisting: boolean;
  concurrency: number;
}

function parseCliArgs(): Args {
  const { values } = parseArgs({
    options: {
      dir: { type: "string", short: "d" },
      limit: { type: "string" },
      type: { type: "string" },
      "skip-existing": { type: "boolean", default: false },
      concurrency: { type: "string", default: "8" },
    },
    strict: true,
  });
  if (!values.dir) {
    console.error("Usage: bun run bin/bulk-import.ts --dir <wetten-root> [--limit N] [--type wet,amvb] [--skip-existing] [--concurrency N]");
    process.exit(2);
  }
  return {
    dir: values.dir as string,
    limit: values.limit ? parseInt(values.limit as string, 10) : null,
    type: (values.type as string) ?? null,
    skipExisting: values["skip-existing"] === true,
    concurrency: Math.max(1, Math.min(32, parseInt(values.concurrency as string, 10) || 8)),
  };
}

/**
 * Merge a streamed state with header WTI metadata + an ELI URI (from index or derived)
 * into the ParsedRegulation shape that upsertRegulation expects.
 */
function buildUpsertInput(
  header: RegulationHeader,
  state: LoadedState,
  eliUri: string,
): ParsedRegulation {
  // ParsedRegulation type covers everything upsertRegulation needs.
  // state already has body/articles/citations; merge WTI bits + the resolved eli.
  return {
    ...state,
    bwbId: header.bwbId,
    eliUri,
    type: state.type || header.type || "wet",
    ministry: header.ministry ?? state.ministry,
    abbreviation: header.abbreviation ?? state.abbreviation,
    citetitle: header.citetitle ?? state.citetitle,
    // validFrom/validTo already overridden by loadOneState from manifest
  };
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const sql = getDb();
  const eliIndex = loadEliIndex(args.dir);
  const allowedTypes = args.type
    ? new Set(args.type.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))
    : null;

  const insertedRows = await sql<{ id: number }[]>`
    INSERT INTO sync_log (started_at, kind) VALUES (now(), 'bulk') RETURNING id
  `;
  const runId = insertedRows[0]!.id;

  log.info("listing BWBR directories", { dir: args.dir });
  let dirs = listBwbDirs(args.dir);
  log.info("BWBR dirs found", { count: dirs.length });

  if (allowedTypes && eliIndex) {
    const before = dirs.length;
    dirs = dirs.filter((d) => {
      const e = eliIndex[basename(d)];
      return e && allowedTypes.has(e.type.toLowerCase());
    });
    log.info("filtered by type", { types: [...allowedTypes].join(","), kept: dirs.length, dropped: before - dirs.length });
  }

  if (args.limit !== null) dirs = dirs.slice(0, args.limit);

  // OPTIMIZATION: pre-load the set of already-imported regulations and their max valid_from
  // in ONE query instead of 42,255 individual SELECTs during the loop. Saves ~30 min
  // on full-corpus --skip-existing reruns where most regs are already present.
  const existingState = new Map<string, string>();
  if (args.skipExisting) {
    log.info("pre-loading existing regulations from DB...");
    const t0 = performance.now();
    const rows = await sql<{ bwb_id: string; mvf: string }[]>`
      SELECT bwb_id, to_char(max(valid_from), 'YYYY-MM-DD') AS mvf
      FROM regulation_state GROUP BY bwb_id
    `;
    for (const r of rows) existingState.set(r.bwb_id, r.mvf);
    log.info("pre-loaded existing", { count: existingState.size, elapsed_ms: Math.round(performance.now() - t0) });
  }

  const bar = new ProgressBar(dirs.length, "bulk-import");

  let regsUpserted = 0;
  let statesUpserted = 0;
  let skippedNoStates = 0;
  let skippedExisting = 0;
  let completed = 0;
  const errors: Array<{ bwbId: string; error: string }> = [];

  async function processOne(dir: string): Promise<void> {
    const bwbId = basename(dir);
    try {
      const header = loadKoopRegulationHeader(dir);
      if (header.states.length === 0) {
        skippedNoStates++;
        return;
      }

      // --skip-existing: O(1) lookup against the pre-loaded map
      if (args.skipExisting) {
        const latestInManifest = header.states[header.states.length - 1]!.validFrom;
        const existingMax = existingState.get(bwbId);
        if (existingMax === latestInManifest) {
          skippedExisting++;
          return;
        }
      }

      const eliEntry = eliIndex?.[bwbId];
      const slug = eliEntry?.slug ?? bwbId.toLowerCase();
      const year = eliEntry?.year ?? (header.manifestFirstInwerkingtreding ?? "0000-01-01").slice(0, 4);
      const typeForEli = eliEntry?.type ?? header.type ?? "wet";
      const eliUri = `/eli/nl/${typeForEli}/${year}/${slug}`;

      let upsertedAny = false;
      for (const stateInfo of header.states) {
        const parsed = loadOneState(header, stateInfo);
        if (parsed === null) continue;
        const input = buildUpsertInput(header, parsed, eliUri);
        const r = await upsertRegulation(input);
        if (r.stateInserted) {
          statesUpserted++;
          upsertedAny = true;
        }
        // state objects go out of scope here — GC reclaims XML tree
      }

      if (upsertedAny) regsUpserted++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ bwbId, error: msg });
      log.warn("bwb failed", { bwbId, error: msg });
    } finally {
      completed++;
      bar.update(completed, bwbId);
    }
  }

  // Concurrent worker pool. Postgres handles N concurrent transactions cheaply;
  // CPU bottleneck is XML parsing on the Node side, scales well with concurrency.
  let nextIdx = 0;
  async function worker(): Promise<void> {
    while (true) {
      const idx = nextIdx++;
      if (idx >= dirs.length) return;
      await processOne(dirs[idx]!);
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < args.concurrency; i++) workers.push(worker());
  await Promise.all(workers);

  bar.finish();

  await sql`
    UPDATE sync_log SET
      finished_at = now(),
      rows_upserted = ${statesUpserted},
      errors = ${JSON.stringify(errors)}::jsonb
    WHERE id = ${runId}
  `;

  console.log(`\nDone.`);
  console.log(`  Regulations with state upserted : ${regsUpserted}`);
  console.log(`  States upserted total            : ${statesUpserted}`);
  console.log(`  Skipped — no states              : ${skippedNoStates}`);
  console.log(`  Skipped — already up to date     : ${skippedExisting}`);
  console.log(`  Errors                           : ${errors.length}`);
}

if (import.meta.main) {
  try {
    await main();
  } finally {
    await closeDb();
  }
  process.exit(0);
}
