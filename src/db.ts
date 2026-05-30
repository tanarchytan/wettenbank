import { SQL } from "bun";
import { loadConfig } from "./config.ts";

let _sql: SQL | null = null;

export function getDb(): SQL {
  if (_sql) return _sql;
  const cfg = loadConfig();
  const maxConns = parseInt(process.env.DB_POOL_MAX ?? "10", 10);
  const idleTimeout = parseInt(process.env.DB_IDLE_TIMEOUT ?? "300", 10);
  _sql = new SQL(cfg.databaseUrl, {
    max: maxConns,
    // 300s (was 30s). Long batch jobs hold connections beyond 30s; closing them
    // mid-flight produced "Idle timeout reached after 30s" errors during bulk-import.
    // Override via DB_IDLE_TIMEOUT=0 to disable entirely.
    idleTimeout,
    // GEEN onclose-handler die _sql=null zet: die fired per gesloten pool-
    // connectie (idle-timeout / server-reap), niet alleen bij volledige
    // pool-sluiting. Het nullen zorgde dat de volgende getDb() een NIEUWE pool
    // bouwde en de oude connecties verweesde -> connectie-accumulatie tot
    // "too many clients" in langlopende processen. Bun.SQL's pool reconnect
    // dode connecties zelf op de volgende query. closeDb() nullt expliciet.
  });
  return _sql;
}

export async function closeDb(): Promise<void> {
  if (_sql) {
    await _sql.close();
    _sql = null;
  }
}

/**
 * Bun.sql encodeert JS string-arrays niet als PG array literals (een array
 * wordt geserialiseerd als eerste-element-string → "malformed array literal").
 * Deze helper bouwt het standaard `{"a","b"}` literaal met quote/backslash
 * escape. Gebruik met expliciete cast:
 *
 *   sql`UPDATE t SET tags = ${pgTextArray(arr)}::text[] WHERE id = ${id}`
 */
export function pgTextArray(arr: readonly string[]): string {
  if (arr.length === 0) return "{}";
  const escaped = arr.map(
    (s) => '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"',
  );
  return "{" + escaped.join(",") + "}";
}
