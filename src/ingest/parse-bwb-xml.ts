import { XMLParser } from "fast-xml-parser";
import { extractCitations } from "./extract-citations.ts";

export interface ParsedArticle {
  number: string;
  anchorId: string;
  heading: string | null;
  bodyXml: string;
  bodyText: string;
  ord: number;
}

export interface ParsedCitation {
  fromArticle: string;
  toBwbId: string;
  toArticle: string;
  kind: "verwijzing" | "wijziging" | "grondslag";
}

export interface ParsedRegulation {
  bwbId: string;
  eliUri: string;
  type: string;
  ministry: string | null;
  geoScope: "NL" | "BES";
  title: string;
  abbreviation: string | null;
  citetitle: string | null;
  validFrom: string;
  validTo: string;
  bodyXml: string;
  bodyText: string;
  articles: ParsedArticle[];
  citations: ParsedCitation[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: true,
  preserveOrder: false,
  // BWB regulations can be very large with veel entity-refs. Bv. "Besluit
  // activiteiten leefomgeving" (BWBR0041330): 14 MB XML, 112k &amp;-entities —
  // overschreed zowel de 100k-expansion- als de 10MB-cap, waardoor de recente
  // states niet parsten. KOOP is een vertrouwde HTTPS-bron, dus ruim verhoogd;
  // maxExpandedLength blijft de geheugen-guard tegen billion-laughs.
  processEntities: {
    enabled: true,
    maxTotalExpansions: 5_000_000,
    maxExpandedLength: 100_000_000,
    maxEntitySize: 1_000_000,
  },
});

function findFirst<T = unknown>(node: unknown, key: string): T | undefined {
  if (!node || typeof node !== "object") return undefined;
  const obj = node as Record<string, unknown>;
  if (key in obj) return obj[key] as T;
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      const hit = findFirst<T>(v, key);
      if (hit !== undefined) return hit;
    }
  }
  return undefined;
}

function asString(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v && typeof v === "object" && "#text" in (v as Record<string, unknown>)) {
    return String((v as { "#text": unknown })["#text"] ?? "");
  }
  return "";
}

function buildEliUri(bwbId: string, type: string, validFrom: string, title: string): string {
  const year = validFrom.slice(0, 4);
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `/eli/nl/${type}/${year}/${slug || bwbId.toLowerCase()}`;
}

export function extractPlaintext(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node + " ";
  if (typeof node !== "object") return String(node) + " ";
  if (Array.isArray(node)) return node.map(extractPlaintext).join("");
  let out = "";
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k.startsWith("@_")) continue;
    if (k === "#text") {
      out += String(v) + " ";
      continue;
    }
    out += extractPlaintext(v);
  }
  return out;
}

/**
 * Extract the direct text of a node, ignoring child element content.
 * Used for <intitule> which has mixed content: text + <meta-data> child.
 */
function directText(node: unknown): string {
  if (!node || typeof node !== "object") return asString(node);
  const obj = node as Record<string, unknown>;
  if ("#text" in obj) return String(obj["#text"] ?? "").trim();
  return "";
}

/**
 * Extract article number from bwb-ng-variabel-deel attribute.
 * "/Hoofdstuk1/Artikel5"  => "5"
 * "/Hoofdstuk1/Artikel"   => "" (no number suffix)
 * "/Artikel"              => ""
 * "/Hoofdstuk/ArtikelXXVI" => "XXVI"
 */
function numberFromVariabelDeel(vd: string): string {
  const parts = vd.split("/");
  const last = parts[parts.length - 1] ?? "";
  // Match "Artikel" followed by anything (number or Roman numeral)
  const m = last.match(/^[Aa]rtikel(.+)$/);
  return m ? m[1]! : "";
}

/**
 * Determine if a node is an artikel.
 * Supports both schemas:
 *  - Synthetic: @_label="Artikel"  (case-insensitive) or @_nr + article shape
 *  - Real:      element is named "artikel" (key="artikel" in parent), identified
 *               by @_bwb-ng-variabel-deel containing "Artikel"
 *
 * This function is called when iterating with `key === "artikel"` already,
 * so we just need to confirm it's not a container.
 */
function isArtikelNode(obj: Record<string, unknown>): boolean {
  // Primary: explicit label="Artikel" attribute (BWB synthetic schema)
  if (String(obj["@_label"] ?? "").toLowerCase() === "artikel") return true;
  // Fallback: has @_nr + article-shaped content, no structural sub-container keys
  if ("@_nr" in obj && ("kop" in obj || "al" in obj || "lid" in obj)) {
    const label = String(obj["@_label"] ?? "").toLowerCase();
    const containerLabels = new Set(["hoofdstuk", "paragraaf", "afdeling", "titel", "boek", "deel"]);
    return !containerLabels.has(label);
  }
  // Real schema: bwb-ng-variabel-deel contains "Artikel"
  const vd = asString(obj["@_bwb-ng-variabel-deel"]);
  if (vd && vd.includes("Artikel")) return true;
  return false;
}

/**
 * Extract article number from a real-schema artikel node.
 * Prefer kop.nr (which has the display number), then fall back to variabel-deel.
 */
function extractArticleNumber(obj: Record<string, unknown>, fallback: number): string {
  // Synthetic schema: @_nr attribute
  const attrNr = asString(obj["@_nr"]);
  if (attrNr) return attrNr;

  // Real schema: kop.nr element
  const kop = obj.kop as Record<string, unknown> | undefined;
  if (kop) {
    const nr = kop.nr;
    if (nr !== undefined) return asString(nr).trim();
  }

  // Fall back to variabel-deel
  const vd = asString(obj["@_bwb-ng-variabel-deel"]);
  if (vd) {
    const num = numberFromVariabelDeel(vd);
    if (num) return num;
  }

  // Last resort: position
  return String(fallback + 1);
}

function capitalise(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1).toLowerCase() : s;
}

/**
 * Build context segment from an element's attributes.
 * Supports both schemas.
 * Returns a non-empty string to push onto ctx, or "" to skip.
 */
function buildCtxSegment(obj: Record<string, unknown>): string {
  // Synthetic schema: label + nr
  if ("@_label" in obj && "@_nr" in obj) {
    const label = String(obj["@_label"] ?? "");
    const nr = String(obj["@_nr"] ?? "");
    if (label && nr) return `${capitalise(label)}${nr}`;
  }
  // Real schema: bwb-ng-variabel-deel for containers
  const vd = asString(obj["@_bwb-ng-variabel-deel"]);
  if (vd) {
    const last = vd.split("/").filter(Boolean).pop() ?? "";
    // Only push context for container types (not artikels)
    if (/^(Hoofdstuk|Paragraaf|Afdeling|Titel|Boek|Deel)/i.test(last)) {
      return last;
    }
  }
  return "";
}

function collectArticles(node: unknown, ctx: string[], out: ParsedArticle[], elementKey?: string): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectArticles(item, ctx, out, elementKey);
    return;
  }
  const obj = node as Record<string, unknown>;

  // Build context for this node
  const newCtx = [...ctx];
  const seg = buildCtxSegment(obj);
  if (seg) newCtx.push(seg);

  // Check if this node IS an artikel (either by element key name or by attributes)
  const isArtikel = elementKey === "artikel"
    ? isArtikelNode(obj)
    : isArtikelNode(obj);

  if (isArtikel) {
    const number = extractArticleNumber(obj, out.length);
    const headingNode = obj.kop ?? obj.titel ?? null;
    const heading = headingNode ? extractPlaintext(headingNode).trim() : null;
    const bodyText = extractPlaintext(obj).trim();

    // Build anchor from context + number
    let anchorId: string;
    if (newCtx.length > 0) {
      // ctx already includes container info; just append Artikel+number
      const ctxStr = newCtx.join("_");
      // If the last ctx segment is e.g. "Hoofdstuk1", anchor = "Hoofdstuk1_Artikel1"
      anchorId = `${ctxStr}_Artikel${number}`;
    } else {
      anchorId = `Artikel${number || out.length + 1}`;
    }

    out.push({
      number: number || String(out.length + 1),
      anchorId,
      heading,
      bodyXml: "",
      bodyText,
      ord: out.length,
    });
    return;
  }

  // Recurse into children, passing the element key so we know when we encounter "artikel"
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith("@_") || k === "#text") continue;
    collectArticles(v, newCtx, out, k);
  }
}

export function parseBwbXml(xml: string): ParsedRegulation {
  const doc = parser.parse(xml) as Record<string, unknown>;

  // bwb-id from toestand (outer wrapper)
  const toestand = (doc.toestand ?? doc) as Record<string, unknown>;
  const bwbId = asString(toestand["@_bwb-id"]);
  if (!bwbId) throw new Error("Could not find bwb-id in XML");

  // validFrom: real schema uses @_inwerkingtreding, synthetic uses @_inwerking-per
  const validFrom =
    asString(toestand["@_inwerkingtreding"]) ||
    asString(toestand["@_inwerking-per"]) ||
    "1970-01-01";

  // validTo: not in real toestand XML; synthetic has @_geldig-tot
  const validToRaw = asString(toestand["@_geldig-tot"]);
  const validTo = validToRaw || "9999-12-31";

  // wetgeving sits directly inside toestand
  const wetgeving = (toestand.wetgeving ?? toestand) as Record<string, unknown>;
  const type = asString(wetgeving["@_soort"]) || "wet";

  // Title extraction:
  // - Real schema: intitule has direct text (#text) with mixed meta-data child — use directText()
  // - Synthetic schema: intitule.titel or findFirst(wetgeving, "titel")
  const intitule = wetgeving.intitule as Record<string, unknown> | undefined;
  let title = "";
  if (intitule) {
    // Try direct text first (real schema)
    const dt = directText(intitule);
    if (dt) {
      title = dt;
    } else {
      // Synthetic schema: intitule.titel
      title = asString(intitule.titel ?? findFirst(intitule, "titel")) || "";
    }
  }
  if (!title) {
    title = asString(findFirst(wetgeving, "titel")) || "Onbekend";
  }

  // meta-data fields (synthetic schema; real schema gets these from WTI)
  const metaData = (wetgeving["meta-data"] ?? {}) as Record<string, unknown>;
  const ministry = asString(metaData.verantwoordelijke) || null;
  const abbreviation = asString(metaData.afkorting) || null;
  const citetitle = asString(metaData.citeertitel) || null;

  // wet-besluit for body / articles
  const wetBesluit =
    (wetgeving["wet-besluit"] as Record<string, unknown> | undefined) ??
    wetgeving;
  const bodyText = extractPlaintext(wetBesluit);

  // articles from wet-besluit
  const articles: ParsedArticle[] = [];
  collectArticles(wetBesluit, [], articles);

  // citations from whole wetgeving
  const citations = extractCitations(wetgeving);

  return {
    bwbId,
    eliUri: buildEliUri(bwbId, type, validFrom, title),
    type,
    ministry,
    geoScope: "NL",
    title,
    abbreviation,
    citetitle,
    validFrom,
    validTo,
    bodyXml: xml,
    bodyText,
    articles,
    citations,
  };
}
