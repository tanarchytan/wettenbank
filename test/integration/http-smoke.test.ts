import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { runMigrations } from "../../bin/migrate.ts";
import { getDb, closeDb } from "../../src/db.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseBwbXml } from "../../src/ingest/parse-bwb-xml.ts";
import { upsertRegulation } from "../../src/ingest/upsert.ts";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "bwb-sample.xml");
const ROOT = join(import.meta.dir, "..", "..");

let server: ChildProcess | null = null;
let baseUrl = "";

async function waitForServer(url: string, timeoutMs = 90_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status === 500) return; // 500 also OK — server is up
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server at ${url} did not come up within ${timeoutMs}ms`);
}

beforeAll(async () => {
  await runMigrations();
  const sql = getDb();
  await sql`TRUNCATE regulation_state, article, citation, regulation CASCADE`;
  await upsertRegulation(parseBwbXml(readFileSync(FIXTURE, "utf-8")));

  const port = 3100 + Math.floor(Math.random() * 100);
  baseUrl = `http://127.0.0.1:${port}`;

  // Use 'next start' if a production build exists, otherwise build first.
  // This avoids the Next.js 16 single-dev-server-per-directory guard.
  const hasBuild = existsSync(join(ROOT, ".next", "BUILD_ID"));
  if (!hasBuild) {
    execSync("bun --bun next build", {
      cwd: ROOT,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: "pipe",
    });
  }

  server = spawn("bun", ["--bun", "next", "start", "-p", String(port)], {
    cwd: ROOT,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", NODE_ENV: "production" },
    stdio: "pipe",
  });
  await waitForServer(`${baseUrl}/api/health`);
}, 120_000);

afterAll(async () => {
  if (server) server.kill();
  await closeDb();
});

describe("HTTP smoke", () => {
  test("/api/health returns 200 ok", async () => {
    const r = await fetch(`${baseUrl}/api/health`);
    expect(r.status).toBe(200);
    const j = await r.json() as { ok: boolean; dbOk: boolean };
    expect(j.dbOk).toBe(true);
  });

  test("/api/search returns hits", async () => {
    const r = await fetch(`${baseUrl}/api/search?q=grondwet`);
    expect(r.status).toBe(200);
    const j = await r.json() as { total: number };
    expect(j.total).toBeGreaterThan(0);
  });

  test("/api/eli/... returns XML when requested", async () => {
    const sql = getDb();
    const [reg] = await sql<{ eli_uri: string }[]>`SELECT eli_uri FROM regulation LIMIT 1`;
    // After Task 9 refactor: XML/JSON-LD lives at /api/eli/*; /eli/* is the HTML page
    const apiPath = reg!.eli_uri.replace(/^\/eli\//, "/api/eli/");
    const r = await fetch(`${baseUrl}${apiPath}`, { headers: { Accept: "application/xml" } });
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toContain("application/xml");
  });
});
