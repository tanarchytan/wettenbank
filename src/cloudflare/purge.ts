import { log } from "../log.ts";

export interface PurgeResult {
  skipped: boolean;
  urlsPurged: number;
  errors: string[];
}

// Cloudflare Free/Pro/Business limiet: 100 URLs per purge call.
// (Enterprise 500.) Was 30 = waste van API-calls.
const BATCH = 100;

export interface RegulationPurgeTarget {
  bwbId: string;
  eliUri: string;
  /** Datum-pinned varianten (`/eli/.../<validFrom>`) die ook gecachet kunnen zijn. */
  validFroms?: string[];
}

/**
 * Bouw de set Cloudflare edge-URLs die geinvalideerd moet worden zodra een
 * regeling een nieuwe state krijgt. We purgen:
 *   - de "current" ELI viewer-URL
 *   - de JSON-API equivalent
 *   - alle datum-pinned varianten (caller geeft validFroms door)
 */
export function buildRegulationPurgeUrls(target: RegulationPurgeTarget, baseUrl: string): string[] {
  const b = baseUrl.replace(/\/$/, "");
  const urls = new Set<string>();
  urls.add(`${b}${target.eliUri}`);
  urls.add(`${b}/api${target.eliUri}`);
  for (const vf of target.validFroms ?? []) {
    urls.add(`${b}${target.eliUri}/${vf}`);
  }
  return [...urls];
}

export async function purgeRegulations(
  targets: ReadonlyArray<RegulationPurgeTarget>,
  baseUrl: string,
): Promise<PurgeResult> {
  if (targets.length === 0) return { skipped: false, urlsPurged: 0, errors: [] };
  const all: string[] = [];
  for (const t of targets) {
    for (const u of buildRegulationPurgeUrls(t, baseUrl)) all.push(u);
  }
  return purgeUrls(all);
}

export async function purgeUrls(urls: string[]): Promise<PurgeResult> {
  const token = process.env.CF_API_TOKEN;
  const zone = process.env.CF_ZONE_ID;

  if (!token || !zone) {
    log.debug("CF purge skipped — no credentials", { count: urls.length });
    return { skipped: true, urlsPurged: 0, errors: [] };
  }

  if (urls.length === 0) {
    return { skipped: false, urlsPurged: 0, errors: [] };
  }

  const errors: string[] = [];
  let purged = 0;

  for (let i = 0; i < urls.length; i += BATCH) {
    const batch = urls.slice(i, i + BATCH);
    try {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${zone}/purge_cache`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ files: batch }),
        },
      );
      const json = (await res.json()) as { success: boolean; errors?: Array<{ message: string }> };
      if (!res.ok || !json.success) {
        const msgs = (json.errors ?? []).map((e) => e.message).join("; ");
        errors.push(`batch ${i / BATCH}: ${res.status} ${msgs}`);
        log.warn("CF purge batch failed", { status: res.status, errors: msgs });
      } else {
        purged += batch.length;
      }
    } catch (err) {
      errors.push(`batch ${i / BATCH}: ${(err as Error).message}`);
      log.warn("CF purge batch threw", { error: (err as Error).message });
    }
  }

  return { skipped: false, urlsPurged: purged, errors };
}
