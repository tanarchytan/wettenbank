import { loadConfig, type LogLevel } from "./config.ts";

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function levelEnabled(target: LogLevel, current: LogLevel): boolean {
  return ORDER[target] >= ORDER[current];
}

function emit(level: LogLevel, msg: string, fields?: Record<string, unknown>): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...(fields ?? {}),
  });
  if (level === "error" || level === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }
}

let currentLevel: LogLevel = "info";
try {
  currentLevel = loadConfig().logLevel;
} catch {
  // config not loadable yet (e.g. tests) — default to info
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) =>
    levelEnabled("debug", currentLevel) && emit("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) =>
    levelEnabled("info", currentLevel) && emit("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) =>
    levelEnabled("warn", currentLevel) && emit("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) =>
    levelEnabled("error", currentLevel) && emit("error", msg, fields),
};
