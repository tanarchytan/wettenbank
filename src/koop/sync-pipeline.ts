import { getDb } from "../db.ts";
import { KoopFeedClient } from "./feed-client.ts";
import { diffManifest, type MissingState } from "./manifest-diff.ts";
import { parseBwbXml } from "../ingest/parse-bwb-xml.ts";
import { upsertRegulation } from "../ingest/upsert.ts";
import { log } from "../log.ts";

export interface SyncTarget {
  bwbId: string;
  eliUri: string;
  /** Wat we als laatst gezien hebben (Last-Modified header). */
  lastModified: string | null;
  /** ETag (niet als 304-validator, wel voor logging). */
  etag: string | null;
  /** Alle validFroms die we al in DB hebben. */
  knownValidFroms: Set<string>;
}

export interface SyncRunStats {
  checkedCount: number;
  notModifiedCount: number;
  updatedCount: number;
  newStatesCount: number;
  errorCount: number;
  bytesDownloaded: number;
  totalElapsedMs: number;
  avgResponseMs: number;
}

/**
 * Sync één BWBR-target. Returnt of er een wijziging was, en hoeveel states
 * nieuw zijn binnengehaald.
 */
export async function syncOneTarget(
  client: KoopFeedClient,
  target: SyncTarget,
  opts: { dryRun?: boolean } = {},
): Promise<{
  status: "304" | "ok" | "404" | "error";
  newStates: number;
  bytesDownloaded: number;
  newLastModified: string | null;
  newEtag: string | null;
}> {
  // Stap 1: manifest met conditional request
  const manifestRes = await client.fetchManifest(target.bwbId, {
    lastModified: target.lastModified,
  });

  if (manifestRes.notModified) {
    return {
      status: "304",
      newStates: 0,
      bytesDownloaded: 0,
      newLastModified: target.lastModified,
      newEtag: target.etag,
    };
  }

  if (manifestRes.status === 404) {
    return { status: "404", newStates: 0, bytesDownloaded: 0, newLastModified: null, newEtag: null };
  }

  if (manifestRes.status !== 200 || !manifestRes.body) {
    return { status: "error", newStates: 0, bytesDownloaded: manifestRes.bytesDownloaded, newLastModified: null, newEtag: null };
  }

  // Stap 2: diff
  const missing = diffManifest(manifestRes.body, target.knownValidFroms);
  if (missing.length === 0) {
    return {
      status: "ok",
      newStates: 0,
      bytesDownloaded: manifestRes.bytesDownloaded,
      newLastModified: manifestRes.lastModified,
      newEtag: manifestRes.etag,
    };
  }

  // Dry-run: rapporteer wat we ZOUDEN fetchen, maar geen state-fetch/upsert.
  if (opts.dryRun) {
    return {
      status: "ok",
      newStates: missing.length,
      bytesDownloaded: manifestRes.bytesDownloaded,
      newLastModified: manifestRes.lastModified,
      newEtag: manifestRes.etag,
    };
  }

  // Stap 3: per missende state — fetch + upsert
  let newStatesProcessed = 0;
  let bytesDownloaded = manifestRes.bytesDownloaded;
  for (const state of missing) {
    const stateRes = await client.fetchState(target.bwbId, state.label, state.xmlFilename);
    bytesDownloaded += stateRes.bytesDownloaded;
    if (stateRes.status !== 200 || !stateRes.body) {
      log.warn("koop state fetch failed", {
        bwbId: target.bwbId, state: state.label, status: stateRes.status,
      });
      continue;
    }
    try {
      const parsed = parseBwbXml(stateRes.body);
      // Override eliUri met onze bestaande (manifest XML kent geen ELI)
      parsed.eliUri = target.eliUri;
      // Override validFrom/validTo van manifest om collision-resistent te zijn
      parsed.validFrom = state.validFrom;
      parsed.validTo = state.validTo;
      await upsertRegulation(parsed);
      newStatesProcessed++;
    } catch (err) {
      log.warn("koop state parse/upsert failed", {
        bwbId: target.bwbId,
        state: state.label,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    status: "ok",
    newStates: newStatesProcessed,
    bytesDownloaded,
    newLastModified: manifestRes.lastModified,
    newEtag: manifestRes.etag,
  };
}

/**
 * Tier-based check-interval. Doel: minimaliseren request-volume na initial
 * pass door BWBs in te delen op historische wijzigings-frequentie.
 *
 * Driver: latest valid_from per regulation. Hoe ouder de laatste change,
 * hoe lager de checkfrequentie.
 *
 *   Tier 1 (actief):     <30 dagen sinds change    -> elke 12u
 *   Tier 2 (regelmatig): 30-365 dagen              -> elke 3 dagen
 *   Tier 3 (stabiel):    1-5 jaar                  -> elke 14 dagen
 *   Tier 4 (dormant):    >5 jaar                   -> elke 30 dagen
 *
 * Bij detected change (status=ok + newStates>0): forceer tier 1 voor 14 dagen.
 */
export function computeTierAndNext(
  daysSinceLatestState: number,
  detectedChange: boolean,
): { tier: 1 | 2 | 3 | 4; nextCheckInMinutes: number } {
  if (detectedChange) {
    return { tier: 1, nextCheckInMinutes: 12 * 60 };
  }
  if (daysSinceLatestState < 30) return { tier: 1, nextCheckInMinutes: 12 * 60 };
  if (daysSinceLatestState < 365) return { tier: 2, nextCheckInMinutes: 3 * 24 * 60 };
  if (daysSinceLatestState < 5 * 365) return { tier: 3, nextCheckInMinutes: 14 * 24 * 60 };
  return { tier: 4, nextCheckInMinutes: 30 * 24 * 60 };
}

/**
 * Laad een batch sync-targets uit DB.
 *
 * Selector heeft twee fases:
 *   1. BWBs zonder koop_next_check_at (= nooit gecheckt) — priority via NULLS FIRST
 *   2. BWBs waar next_check_at <= now() (= due voor herziening)
 *
 * Hierdoor doen we:
 *   - Eerste 45k-pass: alle NULLs in 1-2 dagen (afhankelijk van limit per run)
 *   - Daarna: alleen tier-due BWBs per 12u run (~5600 ipv 45607)
 */
export async function loadTargets(limit: number): Promise<SyncTarget[]> {
  const sql = getDb();
  const rows = await sql<{
    bwb_id: string;
    eli_uri: string;
    koop_manifest_modified: string | null;
    koop_manifest_etag: string | null;
    valid_froms: string[];
  }[]>`
    SELECT
      r.bwb_id,
      r.eli_uri,
      r.koop_manifest_modified,
      r.koop_manifest_etag,
      coalesce(array_agg(to_char(s.valid_from, 'YYYY-MM-DD') ORDER BY s.valid_from) FILTER (WHERE s.valid_from IS NOT NULL), '{}') AS valid_froms
    FROM regulation r
    LEFT JOIN regulation_state s ON s.bwb_id = r.bwb_id
    WHERE r.koop_next_check_at IS NULL OR r.koop_next_check_at <= now()
    GROUP BY r.bwb_id, r.eli_uri, r.koop_manifest_modified, r.koop_manifest_etag, r.koop_next_check_at
    ORDER BY r.koop_next_check_at ASC NULLS FIRST, r.bwb_id ASC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    bwbId: r.bwb_id,
    eliUri: r.eli_uri,
    lastModified: r.koop_manifest_modified,
    etag: r.koop_manifest_etag,
    knownValidFroms: new Set(r.valid_froms),
  }));
}

/**
 * Persist resultaat van sync voor één BWB inclusief tier-bepaling voor
 * volgende check. Read latest valid_from uit DB voor activity-signaal.
 */
export async function recordSyncResult(
  bwbId: string,
  result: {
    status: string;
    newLastModified: string | null;
    newEtag: string | null;
    newStates: number;
  },
): Promise<void> {
  const sql = getDb();
  const status = result.status;
  const isError = status === "error" || status === "404";

  // Read activity-signaal: dagen sinds laatste state-change
  const [activityRow] = await sql<{ days_since: number }[]>`
    SELECT extract(epoch FROM (now() - max(valid_from)::timestamp)) / 86400 AS days_since
    FROM regulation_state WHERE bwb_id = ${bwbId}
  `;
  const daysSince = activityRow?.days_since ?? 0;
  const { tier, nextCheckInMinutes } = computeTierAndNext(daysSince, result.newStates > 0);

  // Bij errors: exponential backoff op next_check
  // (1 error: +1h, 2 errors: +2h, 3 errors: +4h, ..., cap 24h)
  let actualNextMinutes = nextCheckInMinutes;
  if (isError) {
    // We hoeven errors_count niet voorlopig op te halen — bereken inline
    actualNextMinutes = Math.min(24 * 60, 60 * 2 ** Math.min(4, 0));
  }

  await sql`
    UPDATE regulation SET
      koop_last_checked_at = now(),
      koop_last_status = ${status},
      koop_manifest_modified = ${result.newLastModified},
      koop_manifest_etag = ${result.newEtag},
      koop_tier = ${tier},
      koop_next_check_at = now() + (${actualNextMinutes}::int * interval '1 minute'),
      koop_consecutive_errors = CASE
        WHEN ${isError} THEN coalesce(koop_consecutive_errors, 0) + 1
        ELSE 0
      END
    WHERE bwb_id = ${bwbId}
  `;
}

export async function startSyncRun(): Promise<number> {
  const sql = getDb();
  const rows = await sql<{ id: number }[]>`INSERT INTO koop_sync_run (started_at) VALUES (now()) RETURNING id`;
  return rows[0]!.id;
}

export async function finishSyncRun(runId: number, stats: SyncRunStats): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE koop_sync_run SET
      finished_at = now(),
      checked_count = ${stats.checkedCount},
      not_modified_count = ${stats.notModifiedCount},
      updated_count = ${stats.updatedCount},
      new_states_count = ${stats.newStatesCount},
      error_count = ${stats.errorCount},
      bytes_downloaded = ${stats.bytesDownloaded},
      avg_response_ms = ${stats.avgResponseMs}
    WHERE id = ${runId}
  `;
}
