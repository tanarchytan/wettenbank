import { XMLParser } from "fast-xml-parser";

export interface ManifestState {
  label: string;       // "2023-02-22_0"
  validFrom: string;   // YYYY-MM-DD
  validTo: string;     // YYYY-MM-DD, or "9999-12-31" if absent
  xmlFilename: string; // "BWBR0001840_2023-02-22_0.xml"
  /**
   * KOOP markeert ingetrokken/vervangen expressies met item _deleted="true".
   * De XML wordt dan niet meer geserveerd (self-redirect 301-loop). Zulke
   * states moeten NIET gefetcht worden — zie diffManifest.
   */
  deleted: boolean;
}

export interface ParsedManifest {
  bwbId: string;
  wtiLocation: string;
  latestItem: string | null;
  firstInwerkingtreding: string | null; // from <work><metadata><datum_inwerkingtreding>
  states: ManifestState[];
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

export function parseManifest(xml: string): ParsedManifest {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const work = (doc["work"] ?? doc) as Record<string, unknown>;

  const bwbId = asStr(work["@_label"]);
  // The XML attribute is _latestItem (underscore prefix), so fast-xml-parser produces @__latestItem
  const latestItem = asStr(work["@__latestItem"]) || asStr(work["@_latestItem"]) || null;

  const meta = (work["metadata"] ?? {}) as Record<string, unknown>;
  const wtiLocation = asStr(meta["wti_locatie"]) || `${bwbId}.WTI`;
  const firstInwerkingtreding = asStr(meta["datum_inwerkingtreding"]) || null;

  const states: ManifestState[] = [];
  const expRaw = work["expression"];
  const expressions = Array.isArray(expRaw)
    ? expRaw
    : expRaw !== undefined
    ? [expRaw]
    : [];

  for (const exp of expressions) {
    const e = exp as Record<string, unknown>;
    const label = asStr(e["@_label"]);
    const expMeta = (e["metadata"] ?? {}) as Record<string, unknown>;
    const validFrom = asStr(expMeta["datum_inwerkingtreding"]);
    const validToRaw = asStr(expMeta["einddatum"]);
    const validTo = validToRaw || "9999-12-31";

    // manifestation[label=xml]/item/@_label  (+ _deleted vlag)
    let xmlFilename = "";
    let deleted = false;
    const manifestRaw = e["manifestation"];
    const manifestations = Array.isArray(manifestRaw)
      ? manifestRaw
      : manifestRaw !== undefined
      ? [manifestRaw]
      : [];
    for (const m of manifestations) {
      const mObj = m as Record<string, unknown>;
      if (asStr(mObj["@_label"]) === "xml") {
        const itemRaw = mObj["item"];
        const item = (Array.isArray(itemRaw) ? itemRaw[0] : itemRaw) as
          | Record<string, unknown>
          | undefined;
        if (item) {
          xmlFilename = asStr(item["@_label"]);
          // Attribuut heet _deleted → fast-xml-parser maakt er @__deleted van
          // (prefix @_ + naam _deleted), net als @__latestItem.
          deleted =
            asStr(item["@__deleted"]) === "true" ||
            asStr(item["@_deleted"]) === "true";
        }
        break;
      }
    }

    if (label && validFrom) {
      states.push({ label, validFrom, validTo, xmlFilename, deleted });
    }
  }

  // Sort chronologically
  states.sort((a, b) => a.validFrom.localeCompare(b.validFrom));

  return { bwbId, wtiLocation, latestItem, firstInwerkingtreding, states };
}
