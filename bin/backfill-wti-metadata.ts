#!/usr/bin/env bun
/**
 * Backfill the new uitgebreid_zoeken metadata kolommen op `regulation`:
 *   rechtsgebied[], overheidsdomein[], wetsfamilie, kamerstukken[],
 *   ondertekening_datum, publicatie_(bron|jaar|nummer), ministerie_code,
 *   zbo_code, pbo_code, juriconnect_id.
 *
 * Leest per BWB-folder alleen het WTI-bestand (snel, ~10–500 KB elk) en doet
 * een gerichte UPDATE. Re-parsed dus NIET de state-XMLs of de articles.
 *
 * Gebruik:
 *   bun run bin/backfill-wti-metadata.ts --dir <wetten-root> [--limit N] [--concurrency N]
 */
import { readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { parseArgs } from "node:util";
import { getDb, closeDb, pgTextArray } from "../src/db.ts";
import { parseManifest } from "../src/ingest/parse-manifest.ts";
import { parseWti } from "../src/ingest/parse-wti.ts";
import { listBwbDirs } from "../src/ingest/list-bwb-dirs.ts";
import { log } from "../src/log.ts";
import { ProgressBar } from "./_progress.ts";

interface Args {
  dir: string;
  limit: number | null;
  concurrency: number;
  prefix: string | null;
}

function parseCliArgs(): Args {
  const { values } = parseArgs({
    options: {
      dir: { type: "string", short: "d" },
      limit: { type: "string" },
      concurrency: { type: "string", default: "8" },
      prefix: { type: "string" },
    },
    strict: true,
  });
  if (!values.dir) {
    console.error("Usage: bun run bin/backfill-wti-metadata.ts --dir <wetten-root> [--limit N] [--concurrency N] [--prefix BWBV]");
    process.exit(2);
  }
  return {
    dir: values.dir as string,
    limit: values.limit ? parseInt(values.limit as string, 10) : null,
    concurrency: Math.max(1, Math.min(32, parseInt(values.concurrency as string, 10) || 8)),
    prefix: (values.prefix as string) || null,
  };
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const sql = getDb();

  log.info("listing BWB directories", { dir: args.dir });
  let dirs = listBwbDirs(args.dir);
  log.info("BWB dirs found", { count: dirs.length });

  if (args.prefix) {
    const p = args.prefix.toUpperCase();
    dirs = dirs.filter((d) => basename(d).toUpperCase().startsWith(p));
    log.info("filtered by prefix", { prefix: p, kept: dirs.length });
  }

  if (args.limit !== null) dirs = dirs.slice(0, args.limit);

  // Pre-load which bwb-ids are already in DB — anything else is skipped.
  const existingRows = await sql<{ bwb_id: string }[]>`SELECT bwb_id FROM regulation`;
  const existing = new Set(existingRows.map((r) => r.bwb_id));
  log.info("regulations in DB", { count: existing.size });

  const bar = new ProgressBar(dirs.length, "backfill-wti");
  let updated = 0;
  let notInDb = 0;
  let parseFailed = 0;
  let completed = 0;
  const errors: Array<{ bwbId: string; error: string }> = [];

  async function processOne(dir: string): Promise<void> {
    const bwbId = basename(dir);
    try {
      if (!existing.has(bwbId)) {
        notInDb++;
        return;
      }
      const manifestPath = join(dir, "manifest.xml");
      if (!existsSync(manifestPath)) {
        parseFailed++;
        return;
      }
      const manifest = parseManifest(readFileSync(manifestPath, "utf-8"));
      const wtiPath = join(dir, manifest.wtiLocation);
      if (!existsSync(wtiPath)) {
        parseFailed++;
        return;
      }
      const wti = parseWti(readFileSync(wtiPath, "utf-8"));

      const jci = `jci1.3:c:${bwbId}`;

      // Update ook ministry/abbreviation/citetitle. Bulk-import had deze
      // historisch niet altijd correct ingelezen (parser is sindsdien
      // verbeterd); coalesce zorgt dat we bestaande non-null waarden
      // niet overschrijven met null als de huidige parse niets geeft.
      await sql`
        UPDATE regulation SET
          ministry            = coalesce(${wti.ministry}, ministry),
          abbreviation        = coalesce(${wti.abbreviation}, abbreviation),
          citetitle           = coalesce(${wti.citetitle}, citetitle),
          rechtsgebied        = ${pgTextArray(wti.rechtsgebied)}::text[],
          overheidsdomein     = ${pgTextArray(wti.overheidsdomein)}::text[],
          wetsfamilie         = ${wti.wetsfamilie},
          ondertekening_datum = ${wti.ondertekeningDatum},
          publicatie_bron     = ${wti.oorspronkelijkePublicatie.bron},
          publicatie_jaar     = ${wti.oorspronkelijkePublicatie.jaar},
          publicatie_nummer   = ${wti.oorspronkelijkePublicatie.nummer},
          kamerstukken        = ${pgTextArray(wti.kamerstukken)}::text[],
          ministerie_code     = ${wti.ministerieCode},
          zbo_code            = ${wti.zboCode},
          pbo_code            = ${wti.pboCode},
          juriconnect_id      = ${jci}
        WHERE bwb_id = ${bwbId}
      `;
      updated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ bwbId, error: msg });
      log.warn("bwb backfill failed", { bwbId, error: msg });
    } finally {
      completed++;
      bar.update(completed, bwbId);
    }
  }

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
  console.log(`\nDone.`);
  console.log(`  Regulations updated  : ${updated}`);
  console.log(`  Not in DB (skipped)  : ${notInDb}`);
  console.log(`  Parse failed         : ${parseFailed}`);
  console.log(`  Errors               : ${errors.length}`);
}

if (import.meta.main) {
  try {
    await main();
  } finally {
    await closeDb();
  }
  process.exit(0);
}
