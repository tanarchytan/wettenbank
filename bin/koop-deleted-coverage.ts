#!/usr/bin/env bun
/**
 * Completeness-check: verliezen we wetversies door ingetrokken (_deleted)
 * manifest-expressies? One-shot, offline (lokale dump + 1 DB-query, GEEN KOOP).
 *
 * Per BWB in de dump:
 *   - parse manifest -> deleted vs niet-deleted expressies
 *   - voor elke deleted expressie [vf, vt]:
 *       inDb    = hebben we die exacte validFrom in regulation_state?
 *       covered = wordt de periode [vf, vt] volledig gedekt door de UNIE van
 *                 onze DB-states voor die BWB (met dag-aansluiting)? KOOP splitst
 *                 een grove expressie vaak op in fijnere; die hebben we los, dus
 *                 single-interval matchen onderschat de dekking.
 *   - GAP = deleted EN !covered  -> een periode die onze mirror echt mist.
 *
 * Usage: bun run bin/koop-deleted-coverage.ts [--dir wetten] [--limit N]
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { getDb, closeDb } from "../src/db.ts";
import { parseManifest } from "../src/ingest/parse-manifest.ts";
import { ProgressBar } from "./_progress.ts";

const { values } = parseArgs({
  options: { dir: { type: "string", default: "wetten" }, limit: { type: "string" } },
  strict: true,
});
const ROOT = values.dir as string;
const LIMIT = values.limit ? parseInt(values.limit as string, 10) : null;

/** YYYY-MM-DD -> epoch-dag (UTC). */
function day(d: string): number {
  return Math.floor(Date.parse(d + "T00:00:00Z") / 86_400_000);
}

/**
 * Wordt [vf, vt] volledig gedekt door de unie van `intervals` (inclusief
 * dag-aansluiting: een interval dat eindigt op X sluit aan op één dat begint
 * op X+1)? Intervallen zijn inclusief [start, end] in dagen.
 */
function coveredByUnion(vf: string, vt: string, intervals: Array<[number, number]>): boolean {
  if (intervals.length === 0) return false;
  const need0 = day(vf);
  const need1 = day(vt);
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let cursor = need0;
  for (const [s, e] of sorted) {
    if (s > cursor + 1) break;        // gat vóór cursor -> niet doorlopend
    if (e >= cursor) cursor = e + 1;  // schuif door tot na dit interval
    if (cursor > need1) return true;  // hele periode gedekt
  }
  return cursor > need1;
}

async function main(): Promise<void> {
  const sql = getDb();
  // Alle states in één keer: Map<bwbId, {froms:Set, intervals:[[day,day]]}>
  console.log("DB states laden ...");
  const rows = await sql<{ bwb_id: string; vf: string; vt: string }[]>`
    SELECT bwb_id, to_char(valid_from, 'YYYY-MM-DD') AS vf,
           to_char(valid_to, 'YYYY-MM-DD') AS vt
    FROM regulation_state
  `;
  const dbStates = new Map<string, { froms: Set<string>; intervals: Array<[number, number]> }>();
  for (const r of rows) {
    let s = dbStates.get(r.bwb_id);
    if (!s) { s = { froms: new Set(), intervals: [] }; dbStates.set(r.bwb_id, s); }
    s.froms.add(r.vf);
    s.intervals.push([day(r.vf), day(r.vt)]);
  }
  console.log(`  ${rows.length} states over ${dbStates.size} BWBs`);

  let dirs = readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("BWB"))
    .map((d) => d.name);
  if (LIMIT) dirs = dirs.slice(0, LIMIT);

  const bar = new ProgressBar(dirs.length, "deleted-coverage");
  let totalDeleted = 0, inDbCount = 0, coveredCount = 0, preHistoryCount = 0;
  const gaps: Array<{ bwbId: string; vf: string; vt: string; label: string }> = [];
  let manifestsWithDeleted = 0;
  let done = 0;

  for (const bwbId of dirs) {
    const mPath = join(ROOT, bwbId, "manifest.xml");
    done++;
    if (!existsSync(mPath)) { bar.update(done); continue; }
    let parsed;
    try { parsed = parseManifest(readFileSync(mPath, "utf-8")); }
    catch { bar.update(done); continue; }

    const deleted = parsed.states.filter((s) => s.deleted);
    if (deleted.length > 0) manifestsWithDeleted++;
    const have = dbStates.get(parsed.bwbId) ?? { froms: new Set<string>(), intervals: [] };

    for (const d of deleted) {
      totalDeleted++;
      const inDb = have.froms.has(d.validFrom);
      const cov = coveredByUnion(d.validFrom, d.validTo, have.intervals);
      if (inDb) { inDbCount++; continue; }
      if (cov) { coveredCount++; continue; }
      // Niet gedekt. Echte gap alleen als onze timeline een voortzetting
      // VERWACHT: een DB-state eindigt op exact (validFrom - 1). Anders is het
      // verwijderde pre-historie die ook KOOP's canonieke timeline niet heeft.
      const expectedFrom = day(d.validFrom) - 1;
      const expected = have.intervals.some(([, e]) => e === expectedFrom);
      if (expected) gaps.push({ bwbId: parsed.bwbId, vf: d.validFrom, vt: d.validTo, label: d.label });
      else preHistoryCount++;
    }
    bar.update(done, `${manifestsWithDeleted} met deleted · ${gaps.length} gaps`);
  }
  bar.finish();

  console.log("\n=== Deleted-expressie coverage (lokale dump) ===");
  console.log(`  BWBs gescand              : ${dirs.length}`);
  console.log(`  Manifests met deleted     : ${manifestsWithDeleted}`);
  console.log(`  Deleted expressies totaal : ${totalDeleted}`);
  console.log(`    - exacte validFrom in DB  : ${inDbCount}`);
  console.log(`    - periode gedekt (DB-unie): ${coveredCount}`);
  console.log(`    - verwijderde pre-historie: ${preHistoryCount}  (KOOP-canon heeft 't ook niet)`);
  console.log(`    - ECHTE GAPS (verwacht)   : ${gaps.length}  (DB-state eindigt op vf-1, voortzetting mist)`);
  if (gaps.length > 0) {
    console.log("\n  Voorbeelden (max 25):");
    for (const g of gaps.slice(0, 25)) {
      console.log(`    ${g.bwbId}  ${g.vf} -> ${g.vt}  (${g.label})`);
    }
  }
}

if (import.meta.main) {
  try { await main(); } finally { await closeDb(); }
  process.exit(0);
}
