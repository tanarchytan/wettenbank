export interface ParsedEli {
  type: string;
  year: string;
  naturalId: string;
  validAt: string | null;
  articleNr: string | null;
}

const YEAR_RE = /^\d{4}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_ID_RE = /^[a-z0-9-]+$/;

export function parseEliUri(slug: string[]): ParsedEli | null {
  if (slug.length < 4) return null;
  if (slug[0] !== "nl") return null;

  const [, type, year, naturalId, maybeDate, maybeArtikelKeyword, maybeArticleNr] = slug;

  if (!type || !SAFE_ID_RE.test(type)) return null;
  if (!year || !YEAR_RE.test(year)) return null;
  if (!naturalId || !SAFE_ID_RE.test(naturalId)) return null;

  let validAt: string | null = null;
  let articleNr: string | null = null;

  if (maybeDate !== undefined) {
    if (!DATE_RE.test(maybeDate)) return null;
    validAt = maybeDate;
  }
  if (maybeArtikelKeyword !== undefined) {
    if (maybeArtikelKeyword !== "artikel") return null;
    if (!maybeArticleNr || !/^[0-9a-z.]+$/i.test(maybeArticleNr)) return null;
    articleNr = maybeArticleNr;
  }

  return { type, year, naturalId, validAt, articleNr };
}
