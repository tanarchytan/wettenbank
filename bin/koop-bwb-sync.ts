#!/usr/bin/env bun
/**
 * KOOP BWB delta-sync — twice daily updater.
 *
 * Endpoint: https://repository.officiele-overheidspublicaties.nl/bwb/<BWBR>
 *
 * Flow per BWB:
 *   1. GET manifest.xml met If-Modified-Since header
 *   2. 304 -> done (95% of cases)
 *   3. 200 -> diff manifest.expressions vs DB.regulation_state.valid_from
 *   4. Voor missende states: GET XML -> parseBwbXml -> upsertRegulation
 *   5. Update koop_* tracking-kolommen
 *
 * Usage:
 *   bun run bin/koop-bwb-sync.ts [--limit N] [--concurrency N] [--prefix BWBR] [--dry-run]
 *
 * --limit:       max aantal BWBs deze run (default: alle, ~45607)
 * --concurrency: parallel workers (default 4, max 10)
 * --prefix:      filter op BWBR/BWBV/BWBW (default: alle)
 * --dry-run:     fetch manifests + diff, GEEN state-fetch/upsert/DB-writes.
 *                Rapporteert wat een echte run zou wijzigen. Gebruik met --limit.
 */
import { parseArgs } from "node:util";
import { closeDb } from "../src/db.ts";
import { KoopFeedClient } from "../src/koop/feed-client.ts";
import {
  loadTargets, syncOneTarget, recordSyncResult,
  startSyncRun, finishSyncRun, type SyncRunStats,
} from "../src/koop/sync-pipeline.ts";
import { ProgressBar } from "./_progress.ts";
import { log } from "../src/log.ts";

interface Args {
  limit: number | null;
  concurrency: number;
  prefix: string | null;
  dryRun: boolean;
}

function parseCli(): Args {
  const { values } = parseArgs({
    options: {
      limit: { type: "string" },
      concurrency: { type: "string", default: "4" },
      prefix: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
    strict: true,
  });
  return {
    limit: values.limit ? parseInt(values.limit as string, 10) : null,
    concurrency: Math.max(1, Math.min(10, parseInt(values.concurrency as string, 10) || 4)),
    prefix: (values.prefix as string) || null,
    dryRun: values["dry-run"] as boolean,
  };
}

async function main(): Promise<void> {
  const args = parseCli();
  const runId = args.dryRun ? 0 : await startSyncRun();
  log.info(`koop sync starting${args.dryRun ? " (DRY RUN — geen writes)" : ""}`, { runId, args });

  // Load targets (volg de "stale-first" policy uit sync-pipeline)
  const allTargets = await loadTargets(args.limit ?? 999_999);
  const targets = args.prefix
    ? allTargets.filter((t) => t.bwbId.toUpperCase().startsWith(args.prefix!.toUpperCase()))
    : allTargets;
  log.info("targets loaded", { count: targets.length });

  const client = new KoopFeedClient({ concurrency: args.concurrency });
  const bar = new ProgressBar(targets.length, "koop-sync");

  const stats: SyncRunStats = {
    checkedCount: 0,
    notModifiedCount: 0,
    updatedCount: 0,
    newStatesCount: 0,
    errorCount: 0,
    bytesDownloaded: 0,
    totalElapsedMs: 0,
    avgResponseMs: 0,
  };
  const latencies: number[] = [];

  let nextIdx = 0;
  async function worker(): Promise<void> {
    while (true) {
      const idx = nextIdx++;
      if (idx >= targets.length) return;
      const target = targets[idx]!;
      const startMs = Date.now();
      try {
        const result = await syncOneTarget(client, target, { dryRun: args.dryRun });
        if (!args.dryRun) await recordSyncResult(target.bwbId, result);
        stats.checkedCount++;
        if (result.status === "304") stats.notModifiedCount++;
        if (result.status === "ok") stats.updatedCount++;
        if (result.status === "404" || result.status === "error") stats.errorCount++;
        stats.newStatesCount += result.newStates;
        stats.bytesDownloaded += result.bytesDownloaded;
        latencies.push(Date.now() - startMs);
      } catch (err) {
        stats.errorCount++;
        log.warn("target failed", { bwbId: target.bwbId, error: err instanceof Error ? err.message : String(err) });
      }
      const limStats = client.getStats();
      bar.update(stats.checkedCount, `${target.bwbId} · ${stats.notModifiedCount}×304 · ${stats.newStatesCount} new · ${limStats.rps.toFixed(1)} rps`);
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < args.concurrency; i++) workers.push(worker());
  await Promise.all(workers);
  bar.finish();

  stats.totalElapsedMs = latencies.reduce((a, b) => a + b, 0);
  stats.avgResponseMs = latencies.length > 0 ? Math.round(stats.totalElapsedMs / latencies.length) : 0;
  if (!args.dryRun) await finishSyncRun(runId, stats);

  console.log(`\nDone.${args.dryRun ? "  (DRY RUN — niets geschreven)" : ""}`);
  console.log(`  Run ID                : ${args.dryRun ? "n/a (dry-run)" : runId}`);
  console.log(`  Checked               : ${stats.checkedCount}`);
  console.log(`  Not modified (304)    : ${stats.notModifiedCount}  (${(100 * stats.notModifiedCount / Math.max(1, stats.checkedCount)).toFixed(1)}%)`);
  console.log(`  Updated               : ${stats.updatedCount}`);
  console.log(`  New states ${args.dryRun ? "(zou fetchen)" : "binnen     "} : ${stats.newStatesCount}`);
  console.log(`  Errors                : ${stats.errorCount}`);
  console.log(`  Bytes downloaded      : ${(stats.bytesDownloaded / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  Avg response time     : ${stats.avgResponseMs} ms`);
}

if (import.meta.main) {
  try {
    await main();
  } finally {
    await closeDb();
  }
  process.exit(0);
}
