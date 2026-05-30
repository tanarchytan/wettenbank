import type { LoadedRegulation } from "../ingest/load-koop-regulation.ts";
import { bodyToMarkdown } from "./xml-to-markdown.ts";
import { eliPath, slugify } from "./eli-path.ts";
import { frontmatter } from "./frontmatter.ts";

export interface MarkdownContext {
  type: string;
  year: string;
  slug: string;
}

/**
 * Derive the ELI path components for the regulation.
 * year = earliest validFrom across all states (first state after sorting asc).
 * slug = slugified citetitle; fallback bwbId lowercased.
 *
 * When `override` is supplied (pre-resolved from .eli-index.json), it is used
 * verbatim — collision-resolved slug takes precedence over live derivation.
 */
export function regulationContext(
  reg: LoadedRegulation,
  earliestYear: string,
  override?: { type: string; year: string; slug: string },
): MarkdownContext {
  if (override) return override;
  const type = reg.type || "wet";
  const year = earliestYear;
  const citetitle = reg.citetitle ?? reg.states[0]?.citetitle ?? null;
  const slug = citetitle
    ? slugify(citetitle)
    : reg.bwbId.toLowerCase();
  return { type, year, slug: slug || reg.bwbId.toLowerCase() };
}

/**
 * Returns the full markdown content for one state file.
 */
export function stateMarkdown(
  reg: LoadedRegulation,
  stateIdx: number,
  ctx: MarkdownContext,
): string {
  const state = reg.states[stateIdx]!;
  const { type, year, slug } = ctx;

  const eli = eliPath(type, year, slug);

  const prevState =
    stateIdx > 0 ? reg.states[stateIdx - 1]!.validFrom : null;
  const nextState =
    stateIdx < reg.states.length - 1
      ? reg.states[stateIdx + 1]!.validFrom
      : null;

  const relSource = state.sourceXmlPath
    .replace(/\\/g, "/")
    .replace(/^.*?(wetten\/)/, "wetten/");

  const fm = frontmatter({
    bwb_id: reg.bwbId,
    eli: `${eli}/${state.validFrom}`,
    eli_latest: eli,
    type,
    title: state.title,
    ministry: state.ministry ?? null,
    abbreviation: state.abbreviation ?? null,
    valid_from: state.validFrom,
    valid_to: state.validTo,
    prev_state: prevState ?? null,
    next_state: nextState ?? null,
    source: relSource,
  });

  const geldendTot =
    state.validTo === "9999-12-31" ? "heden" : state.validTo;

  const prevLink = prevState
    ? `[← Vorige versie (${prevState})](./${prevState}.md)`
    : null;
  const nextLink = nextState
    ? `[Volgende versie (${nextState}) →](./${nextState}.md)`
    : null;
  const navParts = [prevLink, "[Overzicht](./README.md)"].concat(
    nextLink ? [nextLink] : [],
  ).filter(Boolean);

  const header = [
    `# ${state.title}`,
    "",
    `> **BWB-id:** ${reg.bwbId} · **Type:** ${type} · **Ministerie:** ${state.ministry ?? "—"}`,
    `> **Geldend:** ${state.validFrom} – ${geldendTot}`,
    `> ${navParts.join(" · ")}`,
    "",
  ].join("\n");

  const body = bodyToMarkdown(state);

  return fm + header + "\n" + body;
}

/**
 * Returns the README.md content for the regulation.
 */
export function readmeMarkdown(
  reg: LoadedRegulation,
  ctx: MarkdownContext,
): string {
  const { type, year, slug } = ctx;
  const eli = eliPath(type, year, slug);
  const latest = reg.states[reg.states.length - 1]!;

  const fm = frontmatter({
    bwb_id: reg.bwbId,
    eli,
    type,
    title: latest.title,
    ministry: reg.ministry ?? null,
    abbreviation: reg.abbreviation ?? null,
    latest_state: latest.validFrom,
    state_count: reg.states.length,
  });

  // Version table — newest first
  const sorted = [...reg.states].reverse();
  const tableRows = sorted.map((s) => {
    const from = s.validFrom;
    const to = s.validTo === "9999-12-31" ? "heden" : s.validTo;
    return `| ${from} | ${to} | [${from}.md](./${from}.md) |`;
  });

  const tableHeader = [
    "| Geldend van | Geldend tot | Bestand |",
    "|---|---|---|",
  ];

  const citetitle = reg.citetitle ?? latest.citetitle ?? null;

  const content = [
    fm,
    `# ${latest.title}`,
    "",
    `**BWB-id:** ${reg.bwbId}`,
    citetitle ? `**Citeertitel:** ${citetitle}` : null,
    `**Type:** ${type}`,
    reg.ministry ? `**Verantwoordelijk ministerie:** ${reg.ministry}` : null,
    reg.abbreviation ? `**Afkorting:** ${reg.abbreviation}` : null,
    `**ELI:** [${eli}](https://wettenbank.online${eli})`,
    "",
    "## Versies",
    "",
    ...tableHeader,
    ...tableRows,
    "",
  ]
    .filter((l) => l !== null)
    .join("\n");

  return content;
}
