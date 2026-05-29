import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { spawn } from "node:child_process";
import { mkdtempSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDb, closeDb } from "../../src/db.ts";
import { runMigrations } from "../../bin/migrate.ts";

function run(cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { env: process.env });
    let stdout = "", stderr = "";
    p.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    p.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    p.on("close", (code: number | null) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

let tmpDir = "";

beforeAll(async () => {
  await runMigrations();
  tmpDir = mkdtempSync(join(tmpdir(), "wetten-smoke-"));
  cpSync(
    join(import.meta.dir, "..", "fixtures", "bwb-sample.xml"),
    join(tmpDir, "bwb-sample.xml"),
  );
  const sql = getDb();
  await sql`TRUNCATE regulation_state, article, citation, regulation CASCADE`;
});

afterAll(async () => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  await closeDb();
});

describe("bulk import smoke", () => {
  test("imports the fixture and a full-text search returns it", async () => {
    const r = await run("bun", ["run", "bin/bulk-import.ts", "--dir", tmpDir]);
    expect(r.code).toBe(0);

    const sql = getDb();
    const hits = await sql<{ bwb_id: string; title_snapshot: string }[]>`
      SELECT s.bwb_id, s.title_snapshot
      FROM regulation_state s
      WHERE s.tsv @@ to_tsquery('dutch', 'grondwet')
    `;
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.bwb_id).toBe("BWBR0001840");
  });
});
