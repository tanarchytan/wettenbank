#!/usr/bin/env bun
import { getDb, closeDb } from "../src/db.ts";
import { iterateRecords, fetchRegulationXml } from "../src/sru/client.ts";
import { parseBwbXml } from "../src/ingest/parse-bwb-xml.ts";
import { upsertRegulation } from "../src/ingest/upsert.ts";
import { purgeRegulations } from "../src/cloudflare/purge.ts";
import { loadConfig } from "../src/config.ts";
import { log } from "../src/log.ts";

async function lastSuccessfulCursor(): Promise<Date> {
  const sql = getDb();
  const [row] = await sql<{ cursor: Date | null }[]>`
    SELECT cursor FROM sync_log
    WHERE kind = 'delta' AND finished_at IS NOT NULL
    ORDER BY id DESC LIMIT 1
  `;
  return row?.cursor ?? new Date("2000-01-01T00:00:00Z");
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function runDelta(): Promise<void> {
  const cfg = loadConfig();
  const sql = getDb();

  const lastCursor = await lastSuccessfulCursor();
  const sinceDate = toIsoDate(lastCursor);
  const query = `dt.modified>=${sinceDate}`;
  log.info("delta sync starting", { sinceDate });

  const runRows = await sql<{ id: number }[]>`
    INSERT INTO sync_log (started_at, kind, cursor)
    VALUES (now(), 'delta', ${lastCursor})
    RETURNING id
  `;
  const runId = runRows[0]!.id;

  let upserted = 0;
  let maxModified: Date = lastCursor;
  const errors: Array<{ bwbId: string; error: string }> = [];
  const changedRegBwbIds = new Set<string>();

  try {
    for await (const rec of iterateRecords(cfg.sruBaseUrl, query, 200)) {
      try {
        const xml = await fetchRegulationXml(rec.url);
        const parsed = parseBwbXml(xml);
        const r = await upsertRegulation(parsed);
        if (r.stateInserted) {
          upserted++;
          changedRegBwbIds.add(parsed.bwbId);
        }
        const modDate = new Date(rec.modified);
        if (!isNaN(modDate.getTime()) && modDate > maxModified) maxModified = modDate;
      } catch (err) {
        const msg = (err as Error).message;
        errors.push({ bwbId: rec.bwbId, error: msg });
        log.warn("record failed", { bwbId: rec.bwbId, error: msg });
      }
    }

    if (changedRegBwbIds.size > 0) {
      // Verzamel per BWB-id: eli_uri + alle valid_from waarden van de gepubliceerde
      // states zodat ook datum-pinned permalinks geïnvalideerd worden (anders
      // serveert Cloudflare 24u lang nog een oude versie aan citers met /YYYY-MM-DD).
      const bwbIdList = Array.from(changedRegBwbIds);
      const rows = await sql<{ bwb_id: string; eli_uri: string; valid_from: Date }[]>`
        SELECT r.bwb_id, r.eli_uri, s.valid_from
        FROM regulation r
        JOIN regulation_state s ON s.bwb_id = r.bwb_id
        WHERE r.bwb_id = ANY(${bwbIdList})
      `;
      const byBwb = new Map<string, { eliUri: string; validFroms: Set<string> }>();
      for (const r of rows) {
        const key = r.bwb_id;
        const existing = byBwb.get(key);
        const vf = r.valid_from.toISOString().slice(0, 10);
        if (existing) existing.validFroms.add(vf);
        else byBwb.set(key, { eliUri: r.eli_uri, validFroms: new Set([vf]) });
      }
      const targets = [...byBwb.entries()].map(([bwbId, v]) => ({
        bwbId,
        eliUri: v.eliUri,
        validFroms: [...v.validFroms],
      }));
      const baseDomain = process.env.PUBLIC_BASE_URL ?? "https://wettenbank.online";
      const purge = await purgeRegulations(targets, baseDomain);
      if (purge.errors.length > 0) {
        for (const e of purge.errors) errors.push({ bwbId: "(cf-purge)", error: e });
      }
      log.info("cf purge", { regulations: targets.length, urlsPurged: purge.urlsPurged, skipped: purge.skipped });
    }
  } finally {
    await sql`
      UPDATE sync_log SET
        finished_at = now(),
        cursor = ${maxModified},
        rows_upserted = ${upserted},
        errors = ${JSON.stringify(errors)}::jsonb
      WHERE id = ${runId}
    `;
  }

  log.info("delta sync complete", { upserted, errors: errors.length, newCursor: maxModified.toISOString() });
}

if (import.meta.main) {
  try {
    await runDelta();
  } finally {
    await closeDb();
  }
}
