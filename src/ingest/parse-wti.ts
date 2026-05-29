import { XMLParser } from "fast-xml-parser";
import { MINISTERIES, ZBOS, PBOS } from "../search/taxonomies.ts";

export interface PublicatieInfo {
  bron: string | null;          // "Stb" | "Stcrt" | "Trb" | ...
  jaar: number | null;
  nummer: string | null;
}

export interface ParsedWti {
  bwbId: string;
  ministry: string | null;
  abbreviation: string | null;
  citetitle: string | null;
  soort: string | null;
  /** Time-ranged citetitle list — pick the one matching the state's date */
  citetitles: Array<{ from: string; to: string; title: string }>;

  // ── Uitgebreid zoeken metadata ───────────────────────────────────────────
  /** "Hoofdgebied > Specifiekgebied" joined; first value is the primary. */
  rechtsgebied: string[];
  overheidsdomein: string[];
  /** Eerste BWB-id onder <wetsfamilie>. Vaak gelijk aan de regeling zelf. */
  wetsfamilie: string | null;
  /** Datum waarop het oorspronkelijke besluit is ondertekend (uit nieuwe-regeling). */
  ondertekeningDatum: string | null;
  /** Officiële bekendmaking van het origineel besluit. */
  oorspronkelijkePublicatie: PublicatieInfo;
  /** Alle dossiernummers (kamerstuk-referenties) genoemd in WTI. */
  kamerstukken: string[];
  /** Curated code uit MINISTERIES taxonomie obv eerstverantwoordelijke. */
  ministerieCode: string | null;
  /** Curated code uit ZBO taxonomie als regeling van een ZBO is. */
  zboCode: string | null;
  /** Curated code uit PBO taxonomie als regeling van een PBO is. */
  pboCode: string | null;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: true,
  preserveOrder: false,
});

function asStr(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v && typeof v === "object" && "#text" in (v as Record<string, unknown>)) {
    return String((v as { "#text": unknown })["#text"] ?? "").trim();
  }
  return "";
}

function toArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Walk a sub-tree collecting every value at a given leaf-name. */
function collectLeafText(node: unknown, leafName: string, out: string[]): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) collectLeafText(item, leafName, out);
    return;
  }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    if (k === leafName) {
      for (const item of toArray(v)) {
        const s = asStr(item);
        if (s) out.push(s);
      }
    } else if (typeof v === "object") {
      collectLeafText(v, leafName, out);
    }
  }
}

const MIN_LABEL_LOOKUP = new Map(MINISTERIES.map(([code, label]) => [label.toLowerCase(), code]));
const ZBO_LABEL_LOOKUP = new Map(ZBOS.map(([code, label]) => [label.toLowerCase(), code]));
const PBO_LABEL_LOOKUP = new Map(PBOS.map(([code, label]) => [label.toLowerCase(), code]));

function lookupMinisterieCode(label: string | null): string | null {
  if (!label) return null;
  return MIN_LABEL_LOOKUP.get(label.toLowerCase().trim()) ?? null;
}
function lookupZboCode(label: string | null): string | null {
  if (!label) return null;
  return ZBO_LABEL_LOOKUP.get(label.toLowerCase().trim()) ?? null;
}
function lookupPboCode(label: string | null): string | null {
  if (!label) return null;
  return PBO_LABEL_LOOKUP.get(label.toLowerCase().trim()) ?? null;
}

/**
 * Find the first `<details>` block whose <betreft> is "nieuwe-regeling" — that
 * one carries the original signing + publication info for the whole regulation.
 *
 * WTI nests the details deeper than expected:
 *   <wijzigingen><regeling><datum><details>...</details>
 * so we walk the entire sub-tree to find any matching details block.
 */
function findOorspronkelijkeDetails(node: unknown): Record<string, unknown> | null {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findOorspronkelijkeDetails(item);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof node !== "object") return null;
  const obj = node as Record<string, unknown>;
  // Is this itself a matching details node?
  if (asStr(obj["betreft"]) === "nieuwe-regeling" && obj["ontstaansbron"]) return obj;
  // Recurse
  for (const v of Object.values(obj)) {
    if (typeof v === "object" && v !== null) {
      const hit = findOorspronkelijkeDetails(v);
      if (hit) return hit;
    }
  }
  return null;
}

function extractPublicatie(details: Record<string, unknown> | null): {
  ondertekening: string | null;
  pub: PublicatieInfo;
} {
  if (!details) return { ondertekening: null, pub: { bron: null, jaar: null, nummer: null } };
  const ob = details["ontstaansbron"] as Record<string, unknown> | undefined;
  if (!ob) return { ondertekening: null, pub: { bron: null, jaar: null, nummer: null } };
  const bronArr = toArray(ob["bron"]);
  // Prefer type="oorspronkelijk"; fall back to first.
  const oorspronkelijk = (bronArr.find(
    (b) => (b as Record<string, unknown>)["@_type"] === "oorspronkelijk",
  ) ?? bronArr[0]) as Record<string, unknown> | undefined;
  if (!oorspronkelijk) return { ondertekening: null, pub: { bron: null, jaar: null, nummer: null } };
  const ondertekening = asStr(oorspronkelijk["ondertekening"]) || null;
  const bekendmaking = oorspronkelijk["bekendmaking"] as Record<string, unknown> | undefined;
  const pub: PublicatieInfo = {
    bron: bekendmaking ? asStr(bekendmaking["@_soort"]) || null : null,
    jaar: bekendmaking ? Number(asStr(bekendmaking["publicatiejaar"])) || null : null,
    nummer: bekendmaking ? asStr(bekendmaking["publicatienummer"]) || null : null,
  };
  return { ondertekening, pub };
}

export function parseWti(xml: string): ParsedWti {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const root = (doc["wetstechnische-informatie"] ?? doc) as Record<string, unknown>;
  const bwbId = asStr(root["@_bwb-id"]);

  const ai = (root["algemene-informatie"] ?? {}) as Record<string, unknown>;

  const ministry = asStr(ai["eerstverantwoordelijke"]) || null;

  // abbreviation: first afkorting inside afkortingen
  let abbreviation: string | null = null;
  const afkortingen = ai["afkortingen"] as Record<string, unknown> | undefined;
  if (afkortingen) {
    const raw = afkortingen["afkorting"];
    if (Array.isArray(raw)) {
      abbreviation = asStr(raw[0]) || null;
    } else if (raw !== undefined) {
      abbreviation = asStr(raw) || null;
    }
  }

  const citetitle = asStr(ai["citeertitel"]) || null;
  const soort = asStr(ai["soort-regeling"]) || null;

  // time-ranged citetitles
  const citetitles: Array<{ from: string; to: string; title: string }> = [];
  const citetitelsNode = ai["citeertitels"] as Record<string, unknown> | undefined;
  if (citetitelsNode) {
    const raw = citetitelsNode["citeertitel"];
    const items = Array.isArray(raw) ? raw : raw !== undefined ? [raw] : [];
    for (const item of items) {
      const obj = item as Record<string, unknown>;
      const title = asStr(obj) || asStr(obj["#text"]);
      const from = asStr(obj["@_geldig-van"]);
      const to = asStr(obj["@_geldig-tot"]) || "9999-12-31";
      if (title) citetitles.push({ from, to, title });
    }
  }

  // ── Rechtsgebieden ────────────────────────────────────────────────────
  const rechtsgebied: string[] = [];
  const rgNode = ai["rechtsgebieden"] as Record<string, unknown> | undefined;
  if (rgNode) {
    for (const r of toArray(rgNode["rechtsgebied"])) {
      const obj = r as Record<string, unknown>;
      const hoofd = asStr(obj["hoofdgebied"]);
      const specifiek = asStr(obj["specifiekgebied"]);
      if (specifiek) rechtsgebied.push(specifiek);
      else if (hoofd) rechtsgebied.push(hoofd);
    }
  }

  // ── Overheidsdomeinen ─────────────────────────────────────────────────
  const overheidsdomein: string[] = [];
  const odNode = ai["overheidsdomeinen"] as Record<string, unknown> | undefined;
  if (odNode) {
    for (const d of toArray(odNode["overheidsdomein"])) {
      const s = asStr(d);
      if (s) overheidsdomein.push(s);
    }
  }

  // ── Wetsfamilie ───────────────────────────────────────────────────────
  let wetsfamilie: string | null = null;
  const gr = root["gerelateerde-regelgeving"] as Record<string, unknown> | undefined;
  if (gr) {
    const regeling = gr["regeling"] as Record<string, unknown> | undefined;
    if (regeling) {
      const wf = regeling["wetsfamilie"] as Record<string, unknown> | undefined;
      if (wf) {
        const first = toArray(wf["gerelateerde-regeling"])[0] as Record<string, unknown> | undefined;
        if (first) wetsfamilie = asStr(first["@_bwb-id"]) || null;
      }
    }
  }

  // ── Wijzigingen: ondertekening + publicatie + kamerstukken ────────────
  const wijzigingen = root["wijzigingen"] as Record<string, unknown> | undefined;
  const oorspronkelijke = findOorspronkelijkeDetails(wijzigingen);
  const { ondertekening, pub } = extractPublicatie(oorspronkelijke);

  // Verzamel ALLE dossiernummers door de hele wijzigingen-tree (uniek).
  const kamerstukkenSet = new Set<string>();
  const dossiers: string[] = [];
  collectLeafText(wijzigingen, "dossiernummer", dossiers);
  for (const d of dossiers) kamerstukkenSet.add(d);
  const kamerstukken = [...kamerstukkenSet];

  // ── Ministerie/ZBO/PBO code lookup ────────────────────────────────────
  const ministerieCode = lookupMinisterieCode(ministry);
  const zboCode = lookupZboCode(ministry);
  const pboCode = lookupPboCode(ministry);

  return {
    bwbId,
    ministry,
    abbreviation,
    citetitle,
    soort,
    citetitles,
    rechtsgebied,
    overheidsdomein,
    wetsfamilie,
    ondertekeningDatum: ondertekening,
    oorspronkelijkePublicatie: pub,
    kamerstukken,
    ministerieCode,
    zboCode,
    pboCode,
  };
}
