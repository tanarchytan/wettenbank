import { XMLParser } from "fast-xml-parser";
import { log } from "../log.ts";

export interface SruRecord {
  bwbId: string;
  modified: string;
  url: string;
}

export interface SruResponse {
  totalRecords: number;
  records: SruRecord[];
}

export interface SruSearchOptions {
  query: string;
  startRecord: number;
  maximumRecords: number;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
});

export function buildSearchUrl(baseUrl: string, opts: SruSearchOptions): string {
  const u = new URL(baseUrl);
  u.searchParams.set("operation", "searchRetrieve");
  u.searchParams.set("version", "2.0");
  u.searchParams.set("query", opts.query);
  u.searchParams.set("startRecord", String(opts.startRecord));
  u.searchParams.set("maximumRecords", String(opts.maximumRecords));
  u.searchParams.set("x-connection", "BWB");
  return u.toString();
}

export function parseSruResponse(xml: string): SruResponse {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const root = (doc as any).searchRetrieveResponse;
  if (!root) throw new Error("Not an SRU searchRetrieveResponse");

  const totalRecords = Number(root.numberOfRecords ?? 0);
  const rawRecords = root.records?.record;
  const list = rawRecords == null ? [] : Array.isArray(rawRecords) ? rawRecords : [rawRecords];

  const records: SruRecord[] = [];
  for (const rec of list) {
    const gzd = rec.recordData?.gzd ?? rec.recordData;
    const ow = gzd?.originalData?.meta?.owmskern;
    const enr = gzd?.enrichedData;
    const bwbId = String(ow?.identifier ?? "").trim();
    const modified = String(ow?.modified ?? "").trim();
    const url = String(enr?.preferredUrl ?? "").trim();
    if (bwbId && url) records.push({ bwbId, modified, url });
  }

  return { totalRecords, records };
}

export async function fetchPage(
  baseUrl: string,
  opts: SruSearchOptions,
): Promise<SruResponse> {
  const url = buildSearchUrl(baseUrl, opts);
  log.debug("SRU fetch", { url });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SRU ${res.status}: ${await res.text()}`);
  return parseSruResponse(await res.text());
}

export async function* iterateRecords(
  baseUrl: string,
  query: string,
  pageSize = 500,
): AsyncGenerator<SruRecord> {
  let start = 1;
  while (true) {
    const page = await fetchPage(baseUrl, {
      query,
      startRecord: start,
      maximumRecords: pageSize,
    });
    for (const rec of page.records) yield rec;
    if (page.records.length < pageSize) return;
    start += page.records.length;
  }
}

export async function fetchRegulationXml(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch regulation ${res.status}: ${url}`);
  return await res.text();
}
