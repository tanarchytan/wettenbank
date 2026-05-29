#!/usr/bin/env bun
/**
 * Delta-update the markdown corpus from DB.
 *
 * Driver: regulation_state.ingested_at — query alle regulations met een
 * state ingest sinds N uur. Per geraakte regulation: laad alle states uit DB,
 * genereer state-md files + README.md, schrijf naar corpus-dir.
 *
 * Optioneel: git commit + push in de corpus-repo.
 *
 * Typisch volume per 12u run:
 *   ~50 regulations * (5 states avg + 1 README) = ~300 files
 *
 * Filosofie: één CLI, één cron, geen extra tabellen of queues. De DB-audit
 * (ingested_at column) is de single source of truth voor "wat is veranderd".
 *
 * Usage:
 *   bun run bin/sync-corpus.ts --out ../wettenbank-corpus [--since 24h] [--commit] [--push]
 */
import { parseArgs } from "node:util";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { getDb, closeDb } from "../src/db.ts";
import {
  stateMarkdown,
  readmeMarkdown,
  regulationContext,
} from "../src/markdown/regulation-summary.ts";
import type {
  LoadedRegulation,
  LoadedState,
} from "../src/ingest/load-koop-regulation.ts";
import { log } from "../src/log.ts";

interface Args {
  out: string;
  since: string;
  commit: boolean;
  push: boolean;
}

function parseCli(): Args {
  const { values } = parseArgs({
    options: {
      out:    { type: "string" },
      since:  { type: "string", default: "24h" },
      commit: { type: "boolean", default: false },
      push:   { type: "boolean", default: false },
    },
    strict: true,
  });
  if (!values.out) {
    console.error("Usage: bun run bin/sync-corpus.ts --out <corpus-dir> [--since 24h] [--commit] [--push]");
    process.exit(2);
  }
  return {
    out: values.out as string,
    since: (values.since as string) ?? "24h",
    commit: values.commit === true,
    push: values.push === true,
  };
}

/**
 * Parse "24h", "30m", "7d" naar Postgres-interval-string.
 */
function toPgInterval(s: string): string {
  const m = s.match(/^(\d+)\s*([hmd])$/i);
  if (!m) throw new Error(`Invalid --since format: ${s} (use 24h / 30m / 7d)`);
  const num = m[1]!;
  const unit = m[2]!.toLowerCase();
  return `${num} ${unit === "h" ? "hours" : unit === "m" ? "minutes" : "days"}`;
}

/**
 * Parse /eli/nl/<type>/<jaar>/<slug>[/<datum>] naar de MarkdownContext.
 */
function eliToContext(eliUri: string): { type: string; year: string; slug: string } | null {
  const m = eliUri.match(/^\/eli\/nl\/([^/]+)\/(\d{4})\/([^/]+)/);
  if (!m) return null;
  return { type: m[1]!, year: m[2]!, slug: m[3]! };
}

async function affectedBwbIds(sinceInterval: string): Promise<string[]> {
  const sql = getDb();
  const rows = await sql<{ bwb_id: string }[]>`
    SELECT DISTINCT bwb_id
    FROM regulation_state
    WHERE ingested_at > now() - ${sql.unsafe(`'${sinceInterval}'::interval`)}
    ORDER BY bwb_id
  `;
  return rows.map((r) => r.bwb_id);
}

async function loadRegulationFromDb(bwbId: string): Promise<LoadedRegulation | null> {
  const sql = getDb();
  const [reg] = await sql<{
    bwb_id: string; eli_uri: string; type: string; ministry: string | null;
    geo_scope: string; title: string; abbreviation: string | null; citetitle: string | null;
  }[]>`
    SELECT bwb_id, eli_uri, type, ministry, geo_scope, title, abbreviation, citetitle
    FROM regulation WHERE bwb_id = ${bwbId}
  `;
  if (!reg) return null;

  const stateRows = await sql<{
    state_id: number; valid_from: Date; valid_to: Date;
    body_xml: string; body_text: string; title_snapshot: string;
  }[]>`
    SELECT state_id, valid_from, valid_to, body_xml::text AS body_xml, body_text, title_snapshot
    FROM regulation_state WHERE bwb_id = ${bwbId}
    ORDER BY valid_from ASC
  `;

  const states: LoadedState[] = [];
  for (const s of stateRows) {
    const articleRows = await sql<{
      number: string; anchor_id: string; heading: string | null;
      body_xml: string; body_text: string; ord: number;
    }[]>`
      SELECT number, anchor_id, heading, body_xml::text AS body_xml, body_text, ord
      FROM article WHERE state_id = ${s.state_id}
      ORDER BY ord ASC
    `;
    states.push({
      bwbId,
      eliUri: reg.eli_uri,
      type: reg.type,
      ministry: reg.ministry,
      geoScope: (reg.geo_scope === "BES" ? "BES" : "NL") as "NL" | "BES",
      title: s.title_snapshot,
      abbreviation: reg.abbreviation,
      citetitle: reg.citetitle,
      validFrom: s.valid_from.toISOString().slice(0, 10),
      validTo: s.valid_to.getFullYear() >= 9999 ? "9999-12-31" : s.valid_to.toISOString().slice(0, 10),
      bodyXml: s.body_xml,
      bodyText: s.body_text,
      articles: articleRows.map((a) => ({
        number: a.number,
        anchorId: a.anchor_id,
        heading: a.heading,
        bodyXml: a.body_xml,
        bodyText: a.body_text,
        ord: a.ord,
      })),
      citations: [],
      sourceXmlPath: "",
    });
  }

  return {
    bwbId,
    ministry: reg.ministry,
    citetitle: reg.citetitle,
    abbreviation: reg.abbreviation,
    type: reg.type,
    manifestFirstInwerkingtreding: null,
    states,
  };
}

function runGit(cwd: string, ...args: string[]): { ok: boolean; out: string } {
  const r = spawnSync("git", args, { cwd, encoding: "utf-8" });
  return { ok: r.status === 0, out: (r.stdout || "") + (r.stderr || "") };
}

async function main(): Promise<void> {
  const args = parseCli();
  if (!existsSync(args.out)) {
    console.error(`--out directory does not exist: ${args.out}`);
    process.exit(2);
  }
  const interval = toPgInterval(args.since);
  log.info("corpus-sync starting", { out: args.out, since: args.since });

  const bwbIds = await affectedBwbIds(interval);
  log.info("affected regulations", { count: bwbIds.length });

  let regsWritten = 0;
  let statesWritten = 0;
  let readmesWritten = 0;
  let skippedNoEli = 0;

  for (const bwbId of bwbIds) {
    const reg = await loadRegulationFromDb(bwbId);
    if (!reg || reg.states.length === 0) continue;

    const firstEli = reg.states[0]!.eliUri;
    const ctxBase = eliToContext(firstEli);
    if (!ctxBase) {
      skippedNoEli++;
      continue;
    }
    const ctx = regulationContext(reg, ctxBase.year, ctxBase);

    const regDir = join(args.out, ctx.type, ctx.year, ctx.slug);
    try { mkdirSync(regDir, { recursive: true }); }
    catch (err) { if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err; }

    for (let i = 0; i < reg.states.length; i++) {
      const md = stateMarkdown(reg, i, ctx);
      writeFileSync(join(regDir, `${reg.states[i]!.validFrom}.md`), md);
      statesWritten++;
    }

    writeFileSync(join(regDir, "README.md"), readmeMarkdown(reg, ctx));
    readmesWritten++;
    regsWritten++;

    if (regsWritten % 20 === 0) log.info("progress", { regsWritten, statesWritten });
  }

  log.info("corpus-sync write complete", {
    regsWritten, statesWritten, readmesWritten, skippedNoEli,
  });

  if (args.commit && statesWritten > 0) {
    log.info("git add + commit");
    runGit(args.out, "add", ".");
    const stamp = new Date().toISOString().slice(0, 10);
    const msg = `Delta ${stamp}: ${regsWritten} regulations / ${statesWritten} states`;
    const r = runGit(args.out, "commit", "-m", msg);
    if (!r.ok) log.warn("git commit may have failed (could be nothing to commit)", { out: r.out.slice(0, 200) });

    if (args.push) {
      log.info("git push");
      const p = runGit(args.out, "push");
      if (!p.ok) log.error("git push failed", { out: p.out.slice(0, 500) });
    }
  }

  console.log(`\nDone.`);
  console.log(`  Regulations met delta : ${regsWritten}`);
  console.log(`  State-md files written: ${statesWritten}`);
  console.log(`  README's geüpdate      : ${readmesWritten}`);
  console.log(`  Skipped (no ELI parse) : ${skippedNoEli}`);
}

if (import.meta.main) {
  try {
    await main();
  } finally {
    await closeDb();
  }
  process.exit(0);
}
