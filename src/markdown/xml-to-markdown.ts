/**
 * Convert a ParsedRegulation to a markdown body string.
 *
 * Strategy: re-parse bodyXml with preserveOrder=true so we can walk the
 * structure in document order, skip <meta-data>, and emit:
 *   <hoofdstuk> → ## heading
 *   <paragraaf> / <afdeling> → ### heading
 *   <artikel>   → ### Artikel N [— title]
 *   <al>        → paragraph
 *   <lid>       → numbered item
 */

import { XMLParser } from "fast-xml-parser";
import type { ParsedRegulation } from "../ingest/parse-bwb-xml.ts";

// ------------------------------------------------------------------ XML parser (preserve order)

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: true,
  preserveOrder: true,
  // See parse-bwb-xml.ts: BWB documents can exceed default entity caps.
  processEntities: {
    enabled: true,
    maxTotalExpansions: 100000,
    maxExpandedLength: 10_000_000,
    maxEntitySize: 100000,
  },
});

// ------------------------------------------------------------------ types

type ONode = Record<string, unknown>; // ordered node: { tagName: children[], ":@": attrs }

// ------------------------------------------------------------------ helpers

/**
 * Get all child nodes from an ordered-node's content array.
 * The parser emits: [{ tagName: [...children], ":@": attrs }, ...]
 */
function childNodes(nodes: ONode[]): Array<{ tag: string; node: ONode }> {
  const out: Array<{ tag: string; node: ONode }> = [];
  for (const n of nodes) {
    for (const k of Object.keys(n)) {
      if (k === ":@") continue;
      out.push({ tag: k, node: n });
    }
  }
  return out;
}

/** Collect plain text from ordered nodes, skipping specified tags */
function collectText(nodes: ONode[], skip: string[] = []): string {
  let out = "";
  for (const n of nodes) {
    for (const [k, v] of Object.entries(n)) {
      if (k === ":@") continue;
      if (skip.includes(k)) continue;
      if (k === "#text") {
        out += String(v) + " ";
        continue;
      }
      const kids = Array.isArray(v) ? (v as ONode[]) : [];
      out += collectText(kids, skip);
    }
  }
  return out.replace(/\s+/g, " ").trim();
}

// ------------------------------------------------------------------ renderers

/** Render a <kop> node to its heading text */
function kopText(nodes: ONode[]): string {
  // kop has: <label>, <nr>, <titel>
  let label = "";
  let nr = "";
  let titel = "";
  for (const { tag, node } of childNodes(nodes)) {
    const kids = (node[tag] as ONode[] | undefined) ?? [];
    if (tag === "label") label = collectText(kids);
    else if (tag === "nr") nr = collectText(kids);
    else if (tag === "titel") titel = collectText(kids);
  }
  const parts = [label, nr, titel].map((s) => s.trim()).filter(Boolean);
  return parts.join(" ").trim();
}

/** Render <al> content as a markdown paragraph */
function renderAl(nodes: ONode[]): string {
  const text = collectText(nodes, ["meta-data"]).trim();
  return text ? `${text}\n\n` : "";
}

/** Render <lid> as a numbered item */
function renderLid(nodes: ONode[]): string {
  let nr = "";
  let body = "";
  for (const { tag, node } of childNodes(nodes)) {
    if (tag === "meta-data") continue;
    const kids = (node[tag] as ONode[] | undefined) ?? [];
    if (tag === "lidnr") {
      nr = collectText(kids).trim();
    } else if (tag === "al") {
      body += collectText(kids, ["meta-data"]).trim() + " ";
    } else if (tag === "#text") {
      // skip
    } else {
      body += collectText(kids, ["meta-data"]).trim() + " ";
    }
  }
  body = body.trim();
  if (nr) return `${nr}. ${body}\n\n`;
  return body ? `${body}\n\n` : "";
}

/** Render an <artikel> node. hLevel is "###" or "####". */
function renderArtikel(nodes: ONode[], hLevel: string): string {
  let artNr = "";
  let artTitel = "";
  let body = "";

  for (const { tag, node } of childNodes(nodes)) {
    if (tag === "meta-data") continue;
    const kids = (node[tag] as ONode[] | undefined) ?? [];

    if (tag === "kop") {
      for (const { tag: kt, node: kn } of childNodes(kids)) {
        const kkids = (kn[kt] as ONode[] | undefined) ?? [];
        if (kt === "nr") artNr = collectText(kkids).trim();
        if (kt === "titel") artTitel = collectText(kkids).trim();
      }
    } else if (tag === "al") {
      body += renderAl(kids);
    } else if (tag === "lid") {
      body += renderLid(kids);
    }
  }

  // If no artNr was found, try to get it from the bwb-ng-variabel-deel attribute
  // (handled by caller — we just emit what we have)
  const label = artNr ? `Artikel ${artNr}` : "Artikel";
  const headingParts = [label];
  if (artTitel) headingParts.push(`— ${artTitel}`);
  const headingLine = `${hLevel} ${headingParts.join(" ")}\n\n`;

  return headingLine + body;
}

/**
 * Map container tag names to heading levels.
 * wettekst is transparent (depth 0 → doesn't add a heading).
 * hoofdstuk → ## (depth 0 from wettekst perspective)
 * paragraaf/afdeling inside hoofdstuk → ###
 */
const CONTAINER_HEADING_LEVEL: Record<string, string> = {
  boek: "##",
  deel: "##",
  hoofdstuk: "##",
  titel: "##",
  paragraaf: "###",
  afdeling: "###",
};

/** Render a container (hoofdstuk, paragraaf, afdeling, etc.) */
function renderContainer(
  tag: string,
  nodes: ONode[],
  depth: number,
  lines: string[],
): void {
  const SKIP_TAGS = new Set(["meta-data", "bwb-inputbestand", "bwb-wijzigingen", "redactionele-correcties"]);
  // heading level for this container's kop
  const myHLevel = CONTAINER_HEADING_LEVEL[tag] ?? (depth === 0 ? "##" : depth === 1 ? "###" : "####");
  // artikel heading level: one deeper than the container's own heading
  const artHLevel = myHLevel === "##" ? "###" : "####";

  for (const { tag: childTag, node: childNode } of childNodes(nodes)) {
    if (SKIP_TAGS.has(childTag)) continue;
    const kids = (childNode[childTag] as ONode[] | undefined) ?? [];

    if (childTag === "kop") {
      const text = kopText(kids);
      if (text) {
        lines.push(`${myHLevel} ${text}\n`);
      }
    } else if (childTag === "artikel") {
      lines.push(renderArtikel(kids, artHLevel));
    } else if (
      childTag === "hoofdstuk" ||
      childTag === "paragraaf" ||
      childTag === "afdeling" ||
      childTag === "titel" ||
      childTag === "boek" ||
      childTag === "deel" ||
      childTag === "wettekst"
    ) {
      renderContainer(childTag, kids, depth + (childTag === "wettekst" ? 0 : 1), lines);
    } else if (childTag === "al") {
      const text = collectText(kids, ["meta-data"]).trim();
      if (text) lines.push(`${text}\n\n`);
    }
  }
}

// ------------------------------------------------------------------ main export

export function bodyToMarkdown(parsed: ParsedRegulation): string {
  const xml = parsed.bodyXml;
  if (!xml || xml.trim() === "") {
    return "_Geen artikelen gevonden._\n";
  }

  let doc: ONode[];
  try {
    doc = parser.parse(xml) as ONode[];
  } catch {
    return "_XML parse error._\n";
  }

  const lines: string[] = [];

  // Walk: toestand → wetgeving → wet-besluit → wettekst
  function walkNode(nodes: ONode[], depth: number): void {
    const SKIP = new Set([
      "meta-data", "bwb-inputbestand", "bwb-wijzigingen",
      "redactionele-correcties", "intitule", "citeertitel",
      ":@",
    ]);
    for (const { tag, node } of childNodes(nodes)) {
      if (SKIP.has(tag)) continue;
      const kids = (node[tag] as ONode[] | undefined) ?? [];

      if (tag === "toestand") {
        walkNode(kids, depth);
      } else if (tag === "wetgeving") {
        walkNode(kids, depth);
      } else if (tag === "wet-besluit") {
        walkNode(kids, depth);
      } else if (tag === "wettekst") {
        renderContainer("wettekst", kids, 0, lines);
      } else if (tag === "artikel") {
        lines.push(renderArtikel(kids, "###"));
      } else if (
        tag === "hoofdstuk" || tag === "paragraaf" || tag === "afdeling" ||
        tag === "titel" || tag === "boek" || tag === "deel"
      ) {
        renderContainer(tag, kids, depth, lines);
      }
    }
  }

  walkNode(doc, 0);

  if (lines.length === 0) {
    // Fallback: use parsed articles with anchorId grouping
    return fallbackBodyToMarkdown(parsed);
  }

  return lines.join("");
}

// ------------------------------------------------------------------ fallback

/**
 * Fallback: render from parsed articles when XML walk yields nothing.
 * Strips meta-data text by removing digit-heavy patterns.
 */
function fallbackBodyToMarkdown(parsed: ParsedRegulation): string {
  const { articles } = parsed;
  if (articles.length === 0) return "_Geen artikelen gevonden._\n";

  const lines: string[] = [];
  let lastHoofdstuk: string | null = null;
  let lastParagraaf: string | null = null;

  for (const art of articles) {
    const { hoofdstuk, paragraaf } = parseContainers(art.anchorId);

    if (hoofdstuk !== lastHoofdstuk) {
      lastHoofdstuk = hoofdstuk;
      lastParagraaf = null;
      if (hoofdstuk) { lines.push(`## Hoofdstuk ${hoofdstuk}\n`); }
    }
    if (paragraaf !== lastParagraaf) {
      lastParagraaf = paragraaf;
      if (paragraaf) { lines.push(`### Paragraaf ${paragraaf}\n`); }
    }

    const num = art.number.trim();
    const title = art.heading?.trim() ?? null;
    const headingParts = [`Artikel ${num}`];
    if (title && title.toLowerCase() !== `artikel ${num.toLowerCase()}` && title !== num) {
      headingParts.push(`— ${title}`);
    }
    lines.push(`### ${headingParts.join(" ")}\n\n`);

    // Strip metadata cruft: long runs of digits/dates
    const bodyClean = art.bodyText
      .replace(/\b\d{4}\s+\d{1,4}\s+\d{2}-\d{2}-\d{4}\s+\d{2}-\d{2}-\d{4}\b[^.]*?(\.|$)/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (bodyClean) lines.push(`${bodyClean}\n\n`);
  }

  return lines.join("");
}

function parseContainers(anchorId: string): { hoofdstuk: string | null; paragraaf: string | null } {
  const parts = anchorId.split("_");
  let hoofdstuk: string | null = null;
  let paragraaf: string | null = null;
  for (const p of parts) {
    const hm = p.match(/^Hoofdstuk(\w+)$/i);
    if (hm) { hoofdstuk = hm[1]!; continue; }
    const pm = p.match(/^Paragraaf(\w+)$/i);
    if (pm) { paragraaf = pm[1]!; continue; }
    const am = p.match(/^Afdeling(\w+)$/i);
    if (am) { paragraaf = `Afdeling ${am[1]!}`; continue; }
  }
  return { hoofdstuk, paragraaf };
}
