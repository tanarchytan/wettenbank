#!/usr/bin/env bun
/**
 * KOOP drift-sampler — one-shot analyse, GEEN writes.
 *
 * Doel: vóór de eerste volle 45k-pass meten hoeveel drift (= nieuwe states
 * sinds de dump van 2025-09-03) er per activiteits-tier zit. Trekt een random
 * sample per tier, fetcht alleen manifests (read-only), diff't tegen DB, en
 * rapporteert per tier:
 *   - hoeveel BWBs drift hebben
 *   - totaal aantal nieuwe states dat een echte run zou fetchen
 *   - error-rate
 *
 * Tiers o.b.v. dagen sinds laatste state (zie computeTierAndNext):
 *   1 <30d · 2 30-365d · 3 1-5jr · 4 >5jr
 *
 * Usage:
 *   bun run bin/koop-drift-sample.ts [--per-tier N] [--concurrency N]
 */
import { parseArgs } from "node:util";
import { getDb, closeDb } from "../src/db.ts";
import { KoopFeedClient } from "../src/koop/feed-client.ts";
import { syncOneTarget, type SyncTarget } from "../src/koop/sync-pipeline.ts";
import { log } from "../src/log.ts";

interface TierDef { tier: 1 | 2 | 3 | 4; loBound: string; hiBound: string | null; }

// Window-grenzen als intervallen "sinds laatste state".
const TIERS: TierDef[] = [
  { tier: 1, loBound: "0 days",    hiBound: "30 days" },
  { tier: 2, loBound: "30 days",   hiBound: "365 days" },
  { tier: 3, loBound: "365 days",  hiBound: "1825 days" },
  { tier: 4, loBound: "1825 days", hiBound: null },
];

async function sampleTier(perTier: number, t: TierDef): Promise<SyncTarget[]> {
  const sql = getDb();
  const hiClause = t.hiBound
    ? sql`AND now() - latest.lv >= (${t.loBound}::interval) AND now() - latest.lv < (${t.hiBound}::interval)`
    : sql`AND now() - latest.lv >= (${t.loBound}::interval)`;
  const rows = await sql<{
    bwb_id: string;
    eli_uri: string;
    koop_manifest_modified: string | null;
    koop_manifest_etag: string | null;
    valid_froms: string[];
  }[]>`
    WITH latest AS (
      SELECT bwb_id, max(valid_from) AS lv FROM regulation_state GROUP BY bwb_id
    ),
    pick AS (
      SELECT r.bwb_id
      FROM regulation r JOIN latest ON latest.bwb_id = r.bwb_id
      WHERE true ${hiClause}
      ORDER BY md5(r.bwb_id)
      LIMIT ${perTier}
    )
    SELECT
      r.bwb_id, r.eli_uri, r.koop_manifest_modified, r.koop_manifest_etag,
      coalesce(array_agg(to_char(s.valid_from, 'YYYY-MM-DD') ORDER BY s.valid_from)
               FILTER (WHERE s.valid_from IS NOT NULL), '{}') AS valid_froms
    FROM pick
    JOIN regulation r ON r.bwb_id = pick.bwb_id
    LEFT JOIN regulation_state s ON s.bwb_id = r.bwb_id
    GROUP BY r.bwb_id, r.eli_uri, r.koop_manifest_modified, r.koop_manifest_etag
  `;
  return rows.map((r) => ({
    bwbId: r.bwb_id,
    eliUri: r.eli_uri,
    lastModified: r.koop_manifest_modified,
    etag: r.koop_manifest_etag,
    knownValidFroms: new Set(r.valid_froms),
  }));
}

interface TierResult {
  tier: number; sampled: number; reachable: number; errors: number;
  driftBwbs: number; newStates: number;
}

async function runTier(
  client: KoopFeedClient, t: TierDef, targets: SyncTarget[], concurrency: number,
): Promise<TierResult> {
  const res: TierResult = { tier: t.tier, sampled: targets.length, reachable: 0, errors: 0, driftBwbs: 0, newStates: 0 };
  let idx = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = idx++;
      if (i >= targets.length) return;
      try {
        const r = await syncOneTarget(client, targets[i]!, { dryRun: true });
        if (r.status === "error" || r.status === "404") { res.errors++; continue; }
        res.reachable++;
        if (r.newStates > 0) { res.driftBwbs++; res.newStates += r.newStates; }
      } catch {
        res.errors++;
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return res;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "per-tier": { type: "string", default: "100" },
      concurrency: { type: "string", default: "3" },
    },
    strict: true,
  });
  const perTier = parseInt(values["per-tier"] as string, 10) || 100;
  const concurrency = Math.max(1, Math.min(8, parseInt(values.concurrency as string, 10) || 3));
  log.info("drift-sample starting (DRY RUN)", { perTier, concurrency });

  const client = new KoopFeedClient({ concurrency });
  const results: TierResult[] = [];
  for (const t of TIERS) {
    const targets = await sampleTier(perTier, t);
    if (targets.length === 0) {
      console.log(`Tier ${t.tier}: geen BWBs in DB, skip.`);
      results.push({ tier: t.tier, sampled: 0, reachable: 0, errors: 0, driftBwbs: 0, newStates: 0 });
      continue;
    }
    process.stdout.write(`Tier ${t.tier}: sampling ${targets.length} BWBs ... `);
    const r = await runTier(client, t, targets, concurrency);
    results.push(r);
    console.log(`done. drift ${r.driftBwbs}/${r.reachable}, +${r.newStates} states, ${r.errors} err`);
  }

  console.log("\n=== Drift-sample resultaat (dry-run, geen writes) ===\n");
  console.log("Tier | Sampled | Reachable | Drift BWBs | Drift% | New states | Errors");
  console.log("-----+---------+-----------+------------+--------+------------+-------");
  for (const r of results) {
    const pct = r.reachable > 0 ? (100 * r.driftBwbs / r.reachable).toFixed(1) : "0.0";
    console.log(
      `  ${r.tier}  | ${String(r.sampled).padStart(7)} | ${String(r.reachable).padStart(9)} | ` +
      `${String(r.driftBwbs).padStart(10)} | ${pct.padStart(5)}% | ${String(r.newStates).padStart(10)} | ${String(r.errors).padStart(6)}`,
    );
  }

  // Extrapolatie naar volledige populatie
  const POP: Record<number, number> = { 1: 0, 2: 780, 3: 6985, 4: 37842 };
  let estStates = 0, estBwbs = 0;
  for (const r of results) {
    if (r.reachable === 0) continue;
    const pop = POP[r.tier] ?? 0;
    estBwbs += (r.driftBwbs / r.reachable) * pop;
    estStates += (r.newStates / r.reachable) * pop;
  }
  console.log(`\nGeschatte volledige pass (45607 BWBs):`);
  console.log(`  BWBs met drift   : ~${Math.round(estBwbs)}`);
  console.log(`  Nieuwe states    : ~${Math.round(estStates)}`);
}

if (import.meta.main) {
  try {
    await main();
  } finally {
    await closeDb();
  }
  process.exit(0);
}
