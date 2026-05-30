export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Config {
  databaseUrl: string;
  cfApiToken: string | null;
  cfZoneId: string | null;
  logLevel: LogLevel;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string): string | null {
  const v = process.env[name];
  return v && v.length > 0 ? v : null;
}

export function loadConfig(): Config {
  const lvl = (process.env.LOG_LEVEL ?? "info") as LogLevel;
  return {
    databaseUrl: required("DATABASE_URL"),
    cfApiToken: optional("CF_API_TOKEN"),
    cfZoneId: optional("CF_ZONE_ID"),
    logLevel: lvl,
  };
}
