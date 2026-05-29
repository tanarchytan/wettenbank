import { getDb } from "../db.ts";
import type { ParsedEli } from "./parse-uri.ts";

export interface ResolvedState {
  bwbId: string;
  stateId: number;
  validFrom: string;
  validTo: string;
  title: string;
  type: string;
  ministry: string | null;
  bodyXml: string;
  bodyText: string;
  eliUri: string;
  article: {
    number: string;
    anchorId: string;
    heading: string | null;
    bodyText: string;
  } | null;
  // Full article list for the viewer
  articles: Array<{ number: string; anchorId: string; heading: string | null; bodyText: string; ord: number }>;
  outbound: Array<{ toBwbId: string; toArticle: string; kind: string }>;
  inbound: Array<{ toBwbId: string; toArticle: string; kind: string }>;
}

export async function resolveEli(eli: ParsedEli): Promise<ResolvedState | null> {
  const sql = getDb();
  const reconstructedUri = `/eli/nl/${eli.type}/${eli.year}/${eli.naturalId}`;

  const [reg] = await sql<{
    bwb_id: string; eli_uri: string; type: string; ministry: string | null; title: string;
  }[]>`
    SELECT bwb_id, eli_uri, type, ministry, title
    FROM regulation
    WHERE eli_uri = ${reconstructedUri}
  `;
  if (!reg) return null;

  let stateRows;
  if (eli.validAt === null) {
    stateRows = await sql<{
      state_id: number; valid_from: Date; valid_to: Date; body_xml: string; body_text: string; title_snapshot: string;
    }[]>`
      SELECT state_id::int, valid_from, valid_to, body_xml::text AS body_xml, body_text, title_snapshot
      FROM regulation_state
      WHERE bwb_id = ${reg.bwb_id}
      ORDER BY valid_from DESC
      LIMIT 1
    `;
  } else {
    stateRows = await sql<{
      state_id: number; valid_from: Date; valid_to: Date; body_xml: string; body_text: string; title_snapshot: string;
    }[]>`
      SELECT state_id::int, valid_from, valid_to, body_xml::text AS body_xml, body_text, title_snapshot
      FROM regulation_state
      WHERE bwb_id = ${reg.bwb_id}
        AND ${eli.validAt}::date BETWEEN valid_from AND valid_to
      LIMIT 1
    `;
  }
  if (stateRows.length === 0) return null;
  const state = stateRows[0]!;

  let article: ResolvedState["article"] = null;
  if (eli.articleNr !== null) {
    const [art] = await sql<{ number: string; anchor_id: string; heading: string | null; body_text: string }[]>`
      SELECT number, anchor_id, heading, body_text
      FROM article
      WHERE state_id = ${state.state_id} AND number = ${eli.articleNr}
      LIMIT 1
    `;
    if (!art) return null;
    article = {
      number: art.number,
      anchorId: art.anchor_id,
      heading: art.heading,
      bodyText: art.body_text,
    };
  }

  const articleRows = await sql<{ number: string; anchor_id: string; heading: string | null; body_text: string; ord: number }[]>`
    SELECT number, anchor_id, heading, body_text, ord
    FROM article
    WHERE state_id = ${state.state_id}
    ORDER BY ord ASC
  `;

  const outboundRows = await sql<{ to_bwb_id: string; to_article: string; kind: string }[]>`
    SELECT to_bwb_id, to_article, kind FROM citation WHERE from_state_id = ${state.state_id}
  `;

  const inboundRows = await sql<{ to_bwb_id: string; to_article: string; kind: string }[]>`
    SELECT DISTINCT s.bwb_id AS to_bwb_id, c.from_article AS to_article, c.kind
    FROM citation c
    JOIN regulation_state s ON s.state_id = c.from_state_id
    WHERE c.to_bwb_id = ${reg.bwb_id}
  `;

  return {
    bwbId: reg.bwb_id,
    stateId: state.state_id,
    validFrom: state.valid_from.toISOString().slice(0, 10),
    validTo: state.valid_to.getFullYear() >= 9999 ? "9999-12-31" : state.valid_to.toISOString().slice(0, 10),
    title: state.title_snapshot,
    type: reg.type,
    ministry: reg.ministry,
    bodyXml: state.body_xml,
    bodyText: state.body_text,
    eliUri: reg.eli_uri,
    article,
    articles: articleRows.map((a) => ({
      number: a.number,
      anchorId: a.anchor_id,
      heading: a.heading,
      bodyText: a.body_text,
      ord: a.ord,
    })),
    outbound: outboundRows.map((c) => ({ toBwbId: c.to_bwb_id, toArticle: c.to_article, kind: c.kind })),
    inbound: inboundRows.map((c) => ({ toBwbId: c.to_bwb_id, toArticle: c.to_article, kind: c.kind })),
  };
}
