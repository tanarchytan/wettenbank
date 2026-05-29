export function sanitiseTsQuery(raw: string): string {
  if (!raw || !raw.trim()) return "";
  const lowered = raw.toLowerCase();
  const tokens: string[] = [];
  for (const word of lowered.split(/\s+/)) {
    if (!word) continue;
    if (word === "en") { tokens.push("&"); continue; }
    if (word === "of") { tokens.push("|"); continue; }
    if (word.endsWith("*")) {
      const stem = word.slice(0, -1).replace(/[^a-z0-9-]/g, "");
      if (stem) tokens.push(`${stem}:*`);
      continue;
    }
    const cleaned = word.replace(/[^a-z0-9-]/g, " ").trim();
    for (const piece of cleaned.split(/\s+/)) {
      if (piece) tokens.push(piece);
    }
  }
  const out: string[] = [];
  for (const t of tokens) {
    if (t === "&" || t === "|") {
      out.push(t);
    } else {
      if (out.length > 0 && out[out.length - 1] !== "&" && out[out.length - 1] !== "|") {
        out.push("&");
      }
      out.push(t);
    }
  }
  while (out.length && (out[0] === "&" || out[0] === "|")) out.shift();
  while (out.length && (out[out.length - 1] === "&" || out[out.length - 1] === "|")) out.pop();
  return out.join(" ");
}

export interface MatchedArticle {
  number: string;
  anchorId: string;
  heading: string | null;
}

export interface SearchRow {
  bwbId: string;
  eliUri: string;
  title: string;
  /** Title with <b>…</b> wrapped around matched terms (when titleQ search active). Otherwise raw title. */
  titleHighlight: string;
  type: string;
  /** Body-text snippet with <b>…</b> wrapped around matched terms. Empty string when no body query. */
  snippet: string;
  rank: number;
  validFrom: string;
  /** Articles matching the body query (only populated when q is set). Empty otherwise. */
  matchedArticles: MatchedArticle[];
}
