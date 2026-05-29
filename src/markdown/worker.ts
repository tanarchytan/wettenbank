/**
 * src/markdown/worker.ts
 * Worker thread for koop-to-markdown conversion.
 * Receives { dir, outRoot } messages, converts one regulation, posts back result.
 */

import { mkdirSync, appendFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { parentPort } from "node:worker_threads";
import {
  loadKoopRegulationHeader,
  loadOneState,
} from "../ingest/load-koop-regulation.ts";
import type { LoadedRegulation } from "../ingest/load-koop-regulation.ts";
import {
  regulationContext,
  stateMarkdown,
  readmeMarkdown,
} from "./regulation-summary.ts";
import { buildOneStateReg, buildReadmeReg } from "./state-stub.ts";
import type { RegulationSummary } from "./index-builder.ts";
import { upsertRegulation } from "../ingest/upsert.ts";
import type { ParsedRegulation } from "../ingest/parse-bwb-xml.ts";

export interface WorkerTask {
  kind: "task";
  dir: string;
  outRoot: string;
  errorsPath: string;
  skipExisting?: boolean;
  manifestPath?: string; // resolved manifest.xml path for mtime comparison
  eli?: { type: string; year: string; slug: string } | null; // pre-resolved from .eli-index.json
  writeMarkdown?: boolean; // default true — emit .md files under outRoot
  upsertDb?: boolean; // default false — also upsert each state into Postgres
}

export interface WorkerDone {
  kind: "done";
  dir: string;
  summary: RegulationSummary | null; // null = skipped (no states)
  action: "converted" | "skipped";
  skipReason?: string;
  statesWritten?: number;
}

export interface WorkerError {
  kind: "error";
  dir: string;
  error: string;
}

export type WorkerMessage = WorkerDone | WorkerError;

function ensureDir(p: string): void {
  mkdirSync(p, { recursive: true });
}

async function writeFile(path: string, content: string): Promise<void> {
  ensureDir(dirname(path));
  await Bun.write(path, content);
}

function errorEntry(bwbId: string, dir: string, err: unknown): string {
  return (
    JSON.stringify({
      bwbId,
      dir,
      error: err instanceof Error ? err.message : String(err),
      stack:
        err instanceof Error
          ? err.stack?.split("\n").slice(0, 5).join("\n")
          : undefined,
      ts: new Date().toISOString(),
    }) + "\n"
  );
}

async function processTask(task: WorkerTask): Promise<WorkerMessage> {
  const { dir, outRoot, errorsPath, skipExisting } = task;
  // Defaults: write markdown, do NOT touch DB. Caller opts in to DB via upsertDb=true.
  const writeMarkdown = task.writeMarkdown !== false;
  const upsertDb = task.upsertDb === true;
  const bwbId = dir.split(/[\\/]/).pop()!;

  try {
    const header = loadKoopRegulationHeader(dir);

    if (header.states.length === 0) {
      return { kind: "done", dir, summary: null, action: "skipped", skipReason: "no-states" };
    }

    const yearSource =
      header.manifestFirstInwerkingtreding ?? header.states[0]?.validFrom ?? "0000-01-01";
    const earliestYear = yearSource.slice(0, 4);
    const stubReg: LoadedRegulation = {
      bwbId: header.bwbId,
      ministry: header.ministry,
      citetitle: header.citetitle,
      abbreviation: header.abbreviation,
      type: header.type,
      manifestFirstInwerkingtreding: header.manifestFirstInwerkingtreding,
      states: [],
    };
    const ctx = regulationContext(stubReg, earliestYear, task.eli ?? undefined);
    const { type, year, slug } = ctx;
    const eliUri = `/eli/nl/${type}/${year}/${slug}`;

    const regDir = join(outRoot, type, year, slug);
    const readmePath = join(regDir, "README.md");

    // --skip-existing for the MARKDOWN side: skip writing .md if README.md is newer
    // than manifest.xml. The DB upsert still runs even if markdown is skipped —
    // upsertRegulation has its own content_hash idempotency.
    let skipMarkdown = false;
    if (skipExisting && writeMarkdown && existsSync(readmePath)) {
      const manifestPath = task.manifestPath ?? join(dir, "manifest.xml");
      try {
        const readmeMtime = statSync(readmePath).mtimeMs;
        const manifestMtime = statSync(manifestPath).mtimeMs;
        if (readmeMtime > manifestMtime) {
          skipMarkdown = true;
          if (!upsertDb) {
            // Pure markdown-only mode and markdown is up to date → fully skip.
            const lastInfo = header.states[header.states.length - 1]!;
            const lastParsed = loadOneState(header, lastInfo);
            const summary: RegulationSummary = {
              bwbId: header.bwbId,
              title: lastParsed?.title ?? "",
              type, year, slug,
              stateCount: header.states.length,
              ministry: header.ministry,
              abbreviation: header.abbreviation,
            };
            return {
              kind: "done", dir, summary,
              action: "skipped", skipReason: "unchanged", statesWritten: 0,
            };
          }
        }
      } catch { /* stat failed — proceed with conversion */ }
    }

    if (writeMarkdown && !skipMarkdown) ensureDir(regDir);

    // Stream: parse → write markdown + upsert DB → release each state.
    let latestTitle = "";
    let latestCitetitle: string | null = null;
    let statesWritten = 0;
    for (let si = 0; si < header.states.length; si++) {
      const info = header.states[si]!;
      const parsed = loadOneState(header, info);
      if (parsed === null) continue;
      const oneStateReg = buildOneStateReg(header, parsed, si);

      if (writeMarkdown && !skipMarkdown) {
        const content = stateMarkdown(oneStateReg, si, ctx);
        const mdPath = join(regDir, `${info.validFrom}.md`);
        await writeFile(mdPath, content);
      }

      if (upsertDb) {
        const dbInput: ParsedRegulation = {
          ...parsed,
          bwbId: header.bwbId,
          eliUri,
          type: parsed.type || header.type || "wet",
          ministry: header.ministry ?? parsed.ministry,
          abbreviation: header.abbreviation ?? parsed.abbreviation,
          citetitle: header.citetitle ?? parsed.citetitle,
        };
        await upsertRegulation(dbInput);
      }

      statesWritten++;
      if (si === header.states.length - 1) {
        latestTitle = parsed.title;
        latestCitetitle = parsed.citetitle;
      }
      // `parsed`, `oneStateReg`, body strings all go out of scope here — GC reclaims.
    }

    if (statesWritten === 0) {
      return { kind: "done", dir, summary: null, action: "skipped", skipReason: "no-states" };
    }

    if (writeMarkdown && !skipMarkdown) {
      const readmeReg = buildReadmeReg(header, latestTitle, latestCitetitle);
      await writeFile(readmePath, readmeMarkdown(readmeReg, ctx));
    }

    const summary: RegulationSummary = {
      bwbId: header.bwbId,
      title: latestTitle,
      type,
      year,
      slug,
      stateCount: header.states.length,
      ministry: header.ministry,
      abbreviation: header.abbreviation,
    };

    return {
      kind: "done",
      dir,
      summary,
      action: "converted",
      statesWritten,
    };
  } catch (err) {
    const entry = errorEntry(bwbId, dir, err);
    appendFileSync(errorsPath, entry);
    return {
      kind: "error",
      dir,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// Worker message loop
if (parentPort) {
  parentPort.on("message", async (task: WorkerTask) => {
    const result = await processTask(task);
    parentPort!.postMessage(result);
  });
}
