/**
 * HTTP-client voor de KOOP BWB FRBR-feed met conditional requests, rate
 * limiting, retry, en adaptive concurrency.
 *
 * Endpoint: https://repository.officiele-overheidspublicaties.nl/bwb/<BWBR>
 *
 * Werkt met `If-Modified-Since`-header (ETag wordt door server uitgegeven
 * maar niet als 304-validator gerespecteerd). Bij 304 retourneren we
 * `notModified: true` zonder body — kern van de load-besparing.
 */
import { log } from "../log.ts";

const KOOP_BASE = "https://repository.officiele-overheidspublicaties.nl/bwb";

/** UA waarmee we ons identificeren - so KOOP can ban us if needed */
const USER_AGENT = "Wettenbank.online/1.0 (mirror; David@Gillot.EU)";

export interface FeedResponse {
  status: number;
  notModified: boolean;
  body: string | null;
  lastModified: string | null;
  etag: string | null;
  bytesDownloaded: number;
  elapsedMs: number;
}

export interface RateLimiterConfig {
  /** Initiële requests per second. Default 2. */
  initialRps: number;
  /** Max rps cap. Default 5. */
  maxRps: number;
  /** Min rps (na error-backoff). Default 0.5. */
  minRps: number;
  /** Concurrent connections. Default 4. */
  concurrency: number;
  /** Backoff base (ms) bij errors. Default 1000. */
  backoffBaseMs: number;
  /** Max retries voor 5xx/429. Default 3. */
  maxRetries: number;
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  initialRps: 2,
  maxRps: 5,
  minRps: 0.5,
  concurrency: 4,
  backoffBaseMs: 1000,
  maxRetries: 3,
};

/**
 * Adaptive rate-limiter — schaalt automatisch op/af op basis van error-rate
 * en response-times. Conservatief in productie zodat we KOOP niet platleggen.
 */
class AdaptiveLimiter {
  private currentRps: number;
  private slot = 0;
  private lastTick = Date.now();
  private activeRequests = 0;
  private recentLatencies: number[] = [];
  private recentErrors: boolean[] = [];

  constructor(private cfg: RateLimiterConfig) {
    this.currentRps = cfg.initialRps;
  }

  async acquire(): Promise<void> {
    while (this.activeRequests >= this.cfg.concurrency) {
      await new Promise((r) => setTimeout(r, 20));
    }
    const now = Date.now();
    const minInterval = 1000 / this.currentRps;
    const waitFor = Math.max(0, this.slot - now);
    if (waitFor > 0) await new Promise((r) => setTimeout(r, waitFor));
    this.slot = Math.max(now, this.slot) + minInterval;
    this.activeRequests++;
  }

  release(latencyMs: number, isError: boolean): void {
    this.activeRequests--;
    this.recentLatencies.push(latencyMs);
    this.recentErrors.push(isError);
    if (this.recentLatencies.length > 50) {
      this.recentLatencies.shift();
      this.recentErrors.shift();
    }
    if (this.recentLatencies.length >= 20) this.adapt();
  }

  private adapt(): void {
    const errorRate = this.recentErrors.filter(Boolean).length / this.recentErrors.length;
    const avgLatency = this.recentLatencies.reduce((a, b) => a + b, 0) / this.recentLatencies.length;
    const prevRps = this.currentRps;

    // > 2% errors of > 2s avg latency: halveren
    if (errorRate > 0.02 || avgLatency > 2000) {
      this.currentRps = Math.max(this.cfg.minRps, this.currentRps * 0.5);
    }
    // < 0.5% errors en < 500ms: voorzichtig verhogen (+20%)
    else if (errorRate < 0.005 && avgLatency < 500) {
      this.currentRps = Math.min(this.cfg.maxRps, this.currentRps * 1.2);
    }
    if (Math.abs(this.currentRps - prevRps) > 0.05) {
      log.debug("rate-limiter adapted", {
        prevRps: prevRps.toFixed(2),
        currentRps: this.currentRps.toFixed(2),
        errorRate: errorRate.toFixed(3),
        avgLatencyMs: Math.round(avgLatency),
      });
    }
  }

  getStats(): { rps: number; concurrency: number; active: number } {
    return { rps: this.currentRps, concurrency: this.cfg.concurrency, active: this.activeRequests };
  }
}

export class KoopFeedClient {
  private limiter: AdaptiveLimiter;

  constructor(cfg: Partial<RateLimiterConfig> = {}) {
    this.limiter = new AdaptiveLimiter({ ...DEFAULT_CONFIG, ...cfg });
  }

  /**
   * Fetch een resource met conditional headers. Server retourneert 304 als
   * onveranderd sinds last-modified — dan body=null en notModified=true.
   */
  async fetchResource(
    path: string,
    conditional?: { lastModified?: string | null; etag?: string | null },
  ): Promise<FeedResponse> {
    const url = `${KOOP_BASE}${path}`;
    return this.tryFetch(url, conditional, 0);
  }

  /** Convenience: manifest van een BWBR. */
  fetchManifest(bwbId: string, conditional?: { lastModified?: string | null }): Promise<FeedResponse> {
    return this.fetchResource(`/${bwbId}/manifest.xml`, conditional);
  }

  /** Convenience: specifieke state-XML. */
  fetchState(bwbId: string, expressionLabel: string, fileName: string): Promise<FeedResponse> {
    return this.fetchResource(`/${bwbId}/${expressionLabel}/xml/${fileName}`);
  }

  getStats(): { rps: number; concurrency: number; active: number } {
    return this.limiter.getStats();
  }

  private async tryFetch(
    url: string,
    conditional: { lastModified?: string | null; etag?: string | null } | undefined,
    attempt: number,
  ): Promise<FeedResponse> {
    await this.limiter.acquire();
    const startMs = Date.now();
    let isError = false;
    try {
      const headers: Record<string, string> = { "User-Agent": USER_AGENT };
      if (conditional?.lastModified) headers["If-Modified-Since"] = conditional.lastModified;
      // ETag wordt niet als 304-validator gerespecteerd, maar wel meesturen voor toekomst
      if (conditional?.etag) headers["If-None-Match"] = conditional.etag;

      const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
      const elapsedMs = Date.now() - startMs;

      // 304 Not Modified — happy path, geen body
      if (res.status === 304) {
        this.limiter.release(elapsedMs, false);
        return {
          status: 304,
          notModified: true,
          body: null,
          lastModified: conditional?.lastModified ?? null,
          etag: conditional?.etag ?? null,
          bytesDownloaded: 0,
          elapsedMs,
        };
      }

      // 200 OK — body lezen
      if (res.status === 200) {
        const body = await res.text();
        this.limiter.release(elapsedMs, false);
        return {
          status: 200,
          notModified: false,
          body,
          lastModified: res.headers.get("last-modified"),
          etag: res.headers.get("etag"),
          bytesDownloaded: body.length,
          elapsedMs,
        };
      }

      // 404 — niet retry
      if (res.status === 404) {
        this.limiter.release(elapsedMs, false);
        return {
          status: 404, notModified: false, body: null, lastModified: null, etag: null,
          bytesDownloaded: 0, elapsedMs,
        };
      }

      // 429 / 5xx — retry met exponential backoff
      if (res.status === 429 || res.status >= 500) {
        isError = true;
        this.limiter.release(elapsedMs, true);
        if (attempt < DEFAULT_CONFIG.maxRetries) {
          const backoff = Math.min(60_000, DEFAULT_CONFIG.backoffBaseMs * 2 ** attempt);
          log.warn("KOOP retry-after-error", { url, status: res.status, attempt, backoff });
          await new Promise((r) => setTimeout(r, backoff));
          return this.tryFetch(url, conditional, attempt + 1);
        }
        return {
          status: res.status, notModified: false, body: null, lastModified: null, etag: null,
          bytesDownloaded: 0, elapsedMs,
        };
      }

      // Andere statuscodes — log + return
      this.limiter.release(elapsedMs, true);
      return {
        status: res.status, notModified: false, body: null, lastModified: null, etag: null,
        bytesDownloaded: 0, elapsedMs,
      };
    } catch (err) {
      const elapsedMs = Date.now() - startMs;
      isError = true;
      this.limiter.release(elapsedMs, true);
      if (attempt < DEFAULT_CONFIG.maxRetries) {
        const backoff = Math.min(60_000, DEFAULT_CONFIG.backoffBaseMs * 2 ** attempt);
        log.warn("KOOP retry-after-exception", {
          url, attempt, backoff, error: err instanceof Error ? err.message : String(err),
        });
        await new Promise((r) => setTimeout(r, backoff));
        return this.tryFetch(url, conditional, attempt + 1);
      }
      return {
        status: 0, notModified: false, body: null, lastModified: null, etag: null,
        bytesDownloaded: 0, elapsedMs,
      };
    }
  }
}
