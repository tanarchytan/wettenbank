import "server-only";
import { getDb, pgTextArray } from "../db.ts";
import { sanitiseTsQuery, type SearchRow, type MatchedArticle } from "./query.ts";

/**
 * Inject-safety invarianten (security agent reviewed 2026-05-28):
 *
 * Alle waarden die via `sql.unsafe(...)` in een query terechtkomen worden
 * geconstrueerd uit EEN van deze veilige bronnen:
 *
 *  1. Hard-coded SQL string-literals (geen user input).
 *  2. Whitelisted enum-mapped waarden:
 *     - dbTypes  ← TYPE_MAP (vaste map, niet door user beïnvloedbaar)
 *     - besMode  ← enum "default" | "ook" | "alleen"
 *     - datumbereik ← Datumbereik enum
 *     - datumtype ← Datumtype enum
 *  3. Regex-gevalideerde tokens:
 *     - asOf, startdatum, einddatum  ← DATE_RE  /^\d{4}-\d{2}-\d{2}$/
 *     - bwbId, jciBwb                ← BWB_RE   /^BWB[A-Z]\d{4,8}$/i
 *  4. `quote()` voor PG single-quoted string literals (verdubbeld `'`).
 *  5. `pgTextArray()` + `::text[]` cast voor string-arrays.
 *  6. Number-gecoerced ints (`x | 0` of `Number(x)`).
 *
 * Bij toevoegen van een nieuwe WHERE-clause: doorloop dit lijstje voor elke
 * interpolatie. Zo nee → fix vóór commit.
 */

const TYPE_MAP: Record<string, string> = {
  Verdrag: "verdrag",
  Wetten: "wet",
  AMvB: "AMvB",
  MinR: "MinR",
  Beleid: "beleid",
  Circulaires: "circulaire",
  ZBO: "ZBO",
  Bedrijf: "bedrijf",
  Reglementen: "reglement",
};

export type Datumbereik = "voor" | "na" | "tussen" | "op";
export type Datumtype = "inwerkingtreding" | "ondertekening" | "totstandkoming";
export type Datumscope = "regeling" | "artikel";

export interface SearchInput {
  q?: string | undefined;       // "In de tekst" — matches body content
  titleQ?: string | undefined;  // "In de titel" — matches title ONLY
  types?: string[] | undefined;
  asOfDate?: string | undefined;
  besMode?: "default" | "ook" | "alleen" | undefined;
  limit?: number | undefined;

  // ── Uitgebreid zoeken ──
  artikelnr?: string | undefined;
  wetsfamilie?: string | undefined;
  bwbId?: string | undefined;
  kamerstuk?: string | undefined;
  juriconnect?: string | undefined;
  kenmerk?: string | undefined;

  ministerieCodes?: string[] | undefined;
  zboCodes?: string[] | undefined;
  pboCodes?: string[] | undefined;
  rechtsgebieden?: string[] | undefined;
  overheidsdomeinen?: string[] | undefined;
  verdragThemas?: string[] | undefined;

  publicatieBron?: string | undefined;
  publicatieJaar?: number | undefined;
  publicatieNummer?: string | undefined;

  datumbereik?: Datumbereik | undefined;
  datumtype?: Datumtype | undefined;
  datumscope?: Datumscope | undefined;
  startdatum?: string | undefined;
  einddatum?: string | undefined;
  ookMaterieel?: boolean | undefined;

  /** wetten.nl "Zoek in onderdelen" values: 2=opschrift 3=artikel 5=bijlage 6=inhoudsopgave. */
  bodyParts?: string[] | undefined;
}

export interface SearchOutput {
  total: number;
  results: SearchRow[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// BWBR = regelingen, BWBV = verdragen, BWBW = wijzigingen — alle valide.
const BWB_RE = /^BWB[A-Z]\d{4,8}$/i;
const JCI_BWB_RE = /BWB[A-Z]\d{4,8}/i;

function quote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/** Helper: PG `text[]` literal als quote-string voor IN-style filters. */
function quoteArr(arr: readonly string[]): string {
  return `${quote(pgTextArray(arr))}::text[]`;
}

function isValidDate(s: string | undefined): s is string {
  return Boolean(s && DATE_RE.test(s.trim()));
}

export async function executeSearch(input: SearchInput): Promise<SearchOutput> {
  const sql = getDb();
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
  const dbTypes = (input.types ?? []).map((t) => TYPE_MAP[t]).filter((x): x is string => Boolean(x));

  const tsBody = sanitiseTsQuery(input.q ?? "");
  const tsTitle = sanitiseTsQuery(input.titleQ ?? "");

  const trimmedDate = (input.asOfDate ?? "").trim();
  const asOf = DATE_RE.test(trimmedDate) ? trimmedDate : new Date().toISOString().slice(0, 10);

  // ── Direct-lookup filters (BWB-id, Juriconnect) — short-circuit textsearch.
  const directBwb = input.bwbId?.trim() && BWB_RE.test(input.bwbId.trim()) ? input.bwbId.trim().toUpperCase() : null;
  const jciBwb = (() => {
    const j = input.juriconnect?.trim();
    if (!j) return null;
    const m = j.match(JCI_BWB_RE);
    return m ? m[0].toUpperCase() : null;
  })();
  const forcedBwb = directBwb ?? jciBwb;

  // Hard filter shortcuts — non-empty if any uitgebreid filter is active.
  const hasUitgebreidFilter = Boolean(
    forcedBwb ||
    input.wetsfamilie?.trim() ||
    input.kamerstuk?.trim() ||
    input.artikelnr?.trim() ||
    (input.ministerieCodes && input.ministerieCodes.length) ||
    (input.zboCodes && input.zboCodes.length) ||
    (input.pboCodes && input.pboCodes.length) ||
    (input.rechtsgebieden && input.rechtsgebieden.length) ||
    (input.overheidsdomeinen && input.overheidsdomeinen.length) ||
    input.publicatieBron?.trim() ||
    input.publicatieJaar ||
    input.publicatieNummer?.trim() ||
    (input.datumbereik && isValidDate(input.startdatum)),
  );

  if (!tsBody && !tsTitle && !hasUitgebreidFilter) return { total: 0, results: [] };

  // ── WHERE clauses ────────────────────────────────────────────────────────
  const where: string[] = [];

  where.push(`${quote(asOf)}::date BETWEEN s.valid_from AND s.valid_to`);
  where.push(
    input.besMode === "alleen"
      ? `r.geo_scope = 'BES'`
      : input.besMode === "ook"
        ? `r.geo_scope IN ('NL', 'BES')`
        : `r.geo_scope = 'NL'`,
  );

  if (dbTypes.length > 0) {
    where.push(`r.type IN (${dbTypes.map((t) => `'${t.replace(/'/g, "''")}'`).join(", ")})`);
  }

  const displayTitleExpr = `COALESCE(NULLIF(r.citetitle, ''), s.title_snapshot)`;

  if (tsTitle) {
    where.push(`(to_tsvector('dutch', ${displayTitleExpr}) @@ to_tsquery('dutch', ${quote(tsTitle)}) OR to_tsvector('dutch', s.title_snapshot) @@ to_tsquery('dutch', ${quote(tsTitle)}))`);
  }
  if (tsBody) {
    where.push(`s.tsv @@ to_tsquery('dutch', ${quote(tsBody)})`);
  }

  // ── Uitgebreid filters ──
  if (forcedBwb) where.push(`r.bwb_id = ${quote(forcedBwb)}`);
  if (input.wetsfamilie?.trim()) where.push(`r.wetsfamilie = ${quote(input.wetsfamilie.trim().toUpperCase())}`);
  if (input.kamerstuk?.trim()) where.push(`${quote(input.kamerstuk.trim())} = ANY(r.kamerstukken)`);
  if (input.ministerieCodes && input.ministerieCodes.length > 0) {
    where.push(`r.ministerie_code = ANY(${quoteArr(input.ministerieCodes)})`);
  }
  if (input.zboCodes && input.zboCodes.length > 0) {
    where.push(`r.zbo_code = ANY(${quoteArr(input.zboCodes)})`);
  }
  if (input.pboCodes && input.pboCodes.length > 0) {
    where.push(`r.pbo_code = ANY(${quoteArr(input.pboCodes)})`);
  }
  if (input.rechtsgebieden && input.rechtsgebieden.length > 0) {
    where.push(`r.rechtsgebied && ${quoteArr(input.rechtsgebieden)}`);
  }
  if (input.overheidsdomeinen && input.overheidsdomeinen.length > 0) {
    where.push(`r.overheidsdomein && ${quoteArr(input.overheidsdomeinen)}`);
  }
  if (input.publicatieBron?.trim()) where.push(`r.publicatie_bron = ${quote(input.publicatieBron.trim())}`);
  if (input.publicatieJaar) where.push(`r.publicatie_jaar = ${input.publicatieJaar | 0}`);
  if (input.publicatieNummer?.trim()) where.push(`r.publicatie_nummer = ${quote(input.publicatieNummer.trim())}`);

  // ── Datumbereik filter ──
  // Default datumtype = inwerkingtreding → filter on s.valid_from
  // ondertekening / totstandkoming → filter on r.ondertekening_datum
  if (input.datumbereik && isValidDate(input.startdatum)) {
    const dateCol = input.datumtype === "ondertekening" || input.datumtype === "totstandkoming"
      ? `r.ondertekening_datum`
      : `s.valid_from`;
    const start = quote(input.startdatum);
    const end = isValidDate(input.einddatum) ? quote(input.einddatum) : start;
    switch (input.datumbereik) {
      case "voor":   where.push(`${dateCol} < ${start}`); break;
      case "na":     where.push(`${dateCol} > ${start}`); break;
      case "op":     where.push(`${dateCol} = ${start}`); break;
      case "tussen": where.push(`${dateCol} BETWEEN ${start} AND ${end}`); break;
    }
  }

  // ── Artikelnummer ──
  // Filter to states that have at least one article matching the requested number.
  if (input.artikelnr?.trim()) {
    where.push(`EXISTS (SELECT 1 FROM article a WHERE a.state_id = s.state_id AND a.number = ${quote(input.artikelnr.trim())})`);
  }

  // ── Highlight + rank exprs ──
  // XSS-veiligheid: body_text / title_snapshot kunnen letterlijk '<' of '>'
  // bevatten (BWB-XML kan placeholder-syntax of math hebben). ts_headline
  // levert raw text + StartSel/StopSel-markers terug — we injecten dat in
  // dangerouslySetInnerHTML, dus moet er server-side HTML-escaping plaatsvinden
  // BEFORE ts_headline. We escapen via replace() in SQL en gebruiken unieke
  // sentinels in StartSel/StopSel zodat ze nooit per ongeluk gecodeerd zijn.
  // Postprocess in JS: vervang sentinels door <b>/</b>.
  const escapeBodyExpr = `replace(replace(replace(s.body_text, '&', '&amp;'), '<', '&lt;'), '>', '&gt;')`;
  const escapeTitleExpr = `replace(replace(replace(${displayTitleExpr}, '&', '&amp;'), '<', '&lt;'), '>', '&gt;')`;

  const titleHighlightExpr = tsTitle
    ? `ts_headline('dutch', ${escapeTitleExpr}, to_tsquery('dutch', ${quote(tsTitle)}), 'StartSel=__WB_B_OPEN__,StopSel=__WB_B_CLOSE__,HighlightAll=true')`
    : displayTitleExpr;
  const bodySnippetExpr = tsBody
    ? `ts_headline('dutch', ${escapeBodyExpr}, to_tsquery('dutch', ${quote(tsBody)}), 'StartSel=__WB_B_OPEN__,StopSel=__WB_B_CLOSE__,MaxFragments=2,MaxWords=20,MinWords=5')`
    : `''`;
  const rankExpr = tsBody
    ? `ts_rank_cd(s.tsv, to_tsquery('dutch', ${quote(tsBody)}))`
    : tsTitle
      ? `greatest(ts_rank_cd(to_tsvector('dutch', ${displayTitleExpr}), to_tsquery('dutch', ${quote(tsTitle)})), ts_rank_cd(to_tsvector('dutch', s.title_snapshot), to_tsquery('dutch', ${quote(tsTitle)})))`
      : `0`;

  const orderBy = (tsBody || tsTitle) ? `rank DESC` : `s.valid_from DESC`;

  const whereSql = where.join("\n      AND ");

  const rows = await sql<Array<{
    state_id: number; bwb_id: string; eli_uri: string; title: string; type: string;
    title_highlight: string; snippet: string; rank: number; valid_from: Date;
  }>>`
    SELECT s.state_id, r.bwb_id, r.eli_uri,
           ${sql.unsafe(displayTitleExpr)} AS title,
           r.type,
           ${sql.unsafe(titleHighlightExpr)} AS title_highlight,
           ${sql.unsafe(bodySnippetExpr)} AS snippet,
           ${sql.unsafe(rankExpr)} AS rank,
           s.valid_from
    FROM regulation_state s
    JOIN regulation r ON r.bwb_id = s.bwb_id
    WHERE ${sql.unsafe(whereSql)}
    ORDER BY ${sql.unsafe(orderBy)}
    LIMIT ${limit}
  `;

  // Articles matching body query — per-state lookup.
  // state_id zijn ints uit onze eigen SELECT (geen user input), maar we passen
  // alsnog parameter-binding toe via `= ANY(${arr}::bigint[])` i.p.v. een
  // ge-`unsafe`-de inline IN-list. Veiliger te auditen + minder kans op drift.
  const articlesByState = new Map<number, MatchedArticle[]>();
  if (tsBody && rows.length > 0) {
    const stateIds = rows.map((r) => Number(r.state_id));
    const articleRows = await sql<Array<{
      state_id: string | number; number: string; anchor_id: string; heading: string | null;
    }>>`
      SELECT a.state_id, a.number, a.anchor_id, a.heading
      FROM article a
      WHERE a.state_id = ANY(${pgTextArray(stateIds.map(String))}::bigint[])
        AND to_tsvector('dutch', a.body_text) @@ to_tsquery('dutch', ${tsBody})
      ORDER BY a.state_id, a.ord
    `;
    for (const ar of articleRows) {
      const sid = Number(ar.state_id);
      const list = articlesByState.get(sid) ?? [];
      list.push({ number: ar.number, anchorId: ar.anchor_id, heading: ar.heading });
      articlesByState.set(sid, list);
    }
  }

  // Vervang sentinels door echte <b>/</b> tags. Body en title zijn op dit punt
  // al HTML-escaped (server-side via replace() in SQL), dus de enige onge-escapte
  // tekens die het naar de browser halen zijn deze twee sentinels.
  const unsentinel = (s: string): string =>
    s.replaceAll("__WB_B_OPEN__", "<b>").replaceAll("__WB_B_CLOSE__", "</b>");

  const results: SearchRow[] = rows.map((row) => ({
    bwbId: row.bwb_id,
    eliUri: row.eli_uri,
    title: row.title,
    titleHighlight: unsentinel(row.title_highlight),
    type: row.type,
    snippet: unsentinel(row.snippet),
    rank: row.rank,
    validFrom: row.valid_from.toISOString().slice(0, 10),
    matchedArticles: articlesByState.get(Number(row.state_id)) ?? [],
  }));

  return { total: results.length, results };
}
