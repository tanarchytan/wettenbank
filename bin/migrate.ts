#!/usr/bin/env bun
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDb, closeDb } from "../src/db.ts";
import { log } from "../src/log.ts";

const MIGRATIONS_DIR = join(import.meta.dir, "..", "migrations");

export async function runMigrations(): Promise<void> {
  const sql = getDb();

  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const filename of files) {
    const exists = await sql<{ filename: string }[]>`
      SELECT filename FROM _migrations WHERE filename = ${filename}
    `;
    if (exists.length > 0) {
      log.debug("migration already applied", { filename });
      continue;
    }

    const body = readFileSync(join(MIGRATIONS_DIR, filename), "utf-8");
    log.info("applying migration", { filename });

    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO _migrations (filename) VALUES (${filename})`;
    });
  }
}

if (import.meta.main) {
  try {
    await runMigrations();
    log.info("migrations complete");
  } finally {
    await closeDb();
  }
}
