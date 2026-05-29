import type { ParsedCitation } from "./parse-bwb-xml.ts";

const BWB_RE = /^(BWB[A-Z]\d+)(?:#(.+))?$/;

export function extractCitations(node: unknown, fromArticle = ""): ParsedCitation[] {
  const out: ParsedCitation[] = [];
  walk(node, fromArticle, out);
  return out;
}

function walk(node: unknown, fromArticle: string, out: ParsedCitation[]): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const x of node) walk(x, fromArticle, out);
    return;
  }
  const obj = node as Record<string, unknown>;

  let ctxArticle = fromArticle;
  if (String(obj["@_label"] ?? "").toLowerCase() === "artikel") {
    ctxArticle = String(obj["@_nr"] ?? "").trim();
  }

  if ("verwijzing" in obj) {
    const items = Array.isArray(obj.verwijzing) ? obj.verwijzing : [obj.verwijzing];
    for (const v of items) {
      const c = parseCitation(v as Record<string, unknown>, ctxArticle, "verwijzing");
      if (c) out.push(c);
    }
  }
  if ("extref" in obj) {
    const items = Array.isArray(obj.extref) ? obj.extref : [obj.extref];
    for (const r of items) {
      const c = parseCitation(r as Record<string, unknown>, ctxArticle, "verwijzing");
      if (c) out.push(c);
    }
  }
  if ("wijziging" in obj) {
    const items = Array.isArray(obj.wijziging) ? obj.wijziging : [obj.wijziging];
    for (const w of items) {
      const c = parseCitation(w as Record<string, unknown>, ctxArticle, "wijziging");
      if (c) out.push(c);
    }
  }
  if ("grondslag" in obj) {
    const items = Array.isArray(obj.grondslag) ? obj.grondslag : [obj.grondslag];
    for (const g of items) {
      const c = parseCitation(g as Record<string, unknown>, ctxArticle, "grondslag");
      if (c) out.push(c);
    }
  }

  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith("@_") || k === "#text") continue;
    if (k === "verwijzing" || k === "extref" || k === "wijziging" || k === "grondslag") continue;
    walk(v, ctxArticle, out);
  }
}

function parseCitation(
  node: Record<string, unknown>,
  fromArticle: string,
  kind: ParsedCitation["kind"],
): ParsedCitation | null {
  const rawId = String(
    node["@_bwb-id"] ??
    node["@_doc"] ??
    (typeof node["bwb-id"] === "string" ? node["bwb-id"] : "") ??
    "",
  );
  const m = rawId.match(BWB_RE);
  if (!m) return null;
  const toBwbId = m[1]!;
  const toArticle = String(node["@_artikel"] ?? node["@_art"] ?? m[2] ?? "");
  return { fromArticle, toBwbId, toArticle, kind };
}
