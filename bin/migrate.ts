#!/usr/bin/env bun
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDb, closeDb } from "../src/db.ts";
import { log } from "../src/log.ts";

const MIGRATIONS_DIR = join(import.meta.dir, "..", "migrations");

// Vaste sleutel voor de transactie-advisory-lock. Serialiseert gelijktijdige
// migrate-runs (bv. app + worker die tegelijk booten) zodat ze niet dezelfde
// migratie dubbel proberen toe te passen.
const MIGRATE_LOCK_KEY = 770_104_001;

export async function runMigrations(): Promise<void> {
  const sql = getDb();

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  // Hele run in één transactie. pg_advisory_xact_lock blokkeert concurrente
  // booters tot deze commit; daarna zien zij de _migrations rijen en skippen.
  // De lock wordt automatisch vrijgegeven bij commit/rollback (xact-scope).
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${MIGRATE_LOCK_KEY})`;

    await tx`
      CREATE TABLE IF NOT EXISTS _migrations (
        filename   text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `;

    for (const filename of files) {
      const exists = await tx<{ filename: string }[]>`
        SELECT filename FROM _migrations WHERE filename = ${filename}
      `;
      if (exists.length > 0) {
        log.debug("migration already applied", { filename });
        continue;
      }

      const body = readFileSync(join(MIGRATIONS_DIR, filename), "utf-8");
      log.info("applying migration", { filename });
      await tx.unsafe(body);
      await tx`INSERT INTO _migrations (filename) VALUES (${filename})`;
    }
  });
}

if (import.meta.main) {
  try {
    await runMigrations();
    log.info("migrations complete");
  } finally {
    await closeDb();
  }
}
