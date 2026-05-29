import { getDb } from "../db.ts";
import { contentHash } from "./content-hash.ts";
import type { ParsedRegulation } from "./parse-bwb-xml.ts";
import { log } from "../log.ts";

export interface UpsertResult {
  regulationInserted: boolean;
  stateInserted: boolean;
  stateId: number | null;
  articlesInserted: number;
  citationsInserted: number;
}

/**
 * Strip artifacts that fast-xml-parser tolerates but PostgreSQL's strict ::xml
 * cast rejects. Observed in ~0.01% of BWB states: UTF-8 BOM (EF BB BF) before
 * the XML declaration. Also strips XML 1.0 forbidden control chars as a defense.
 */
function sanitizeXmlForPg(xml: string): string {
  return xml
    .replace(/^﻿+/, "")              // strip leading BOM(s)
    .replace(/^\s+(?=<\?xml)/, "")        // strip any whitespace/CR before <?xml
    // XML 1.0 forbids these control chars; only keep \t \n \r (0x09 0x0A 0x0D)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

export async function upsertRegulation(p: ParsedRegulation): Promise<UpsertResult> {
  const sql = getDb();
  const cleanBodyXml = sanitizeXmlForPg(p.bodyXml);
  const hash = contentHash(p.bodyXml);  // hash the original, not the cleaned — idempotency tracks source

  return await sql.begin(async (tx): Promise<UpsertResult> => {
    const regBefore = await tx<{ bwb_id: string }[]>`
      SELECT bwb_id FROM regulation WHERE bwb_id = ${p.bwbId}
    `;
    await tx`
      INSERT INTO regulation (bwb_id, eli_uri, type, ministry, geo_scope, title, abbreviation, citetitle)
      VALUES (${p.bwbId}, ${p.eliUri}, ${p.type}, ${p.ministry}, ${p.geoScope}, ${p.title}, ${p.abbreviation}, ${p.citetitle})
      ON CONFLICT (bwb_id) DO UPDATE SET
        eli_uri      = EXCLUDED.eli_uri,
        type         = EXCLUDED.type,
        ministry     = EXCLUDED.ministry,
        geo_scope    = EXCLUDED.geo_scope,
        title        = EXCLUDED.title,
        abbreviation = EXCLUDED.abbreviation,
        citetitle    = EXCLUDED.citetitle
    `;
    const regulationInserted = regBefore.length === 0;

    const existing = await tx<{ state_id: number; content_hash: Buffer }[]>`
      SELECT state_id, content_hash FROM regulation_state
      WHERE bwb_id = ${p.bwbId} AND valid_from = ${p.validFrom}
    `;
    if (existing.length > 0 && Buffer.compare(existing[0]!.content_hash, hash) === 0) {
      log.debug("state unchanged, skipping", { bwbId: p.bwbId, validFrom: p.validFrom });
      return {
        regulationInserted,
        stateInserted: false,
        stateId: existing[0]!.state_id,
        articlesInserted: 0,
        citationsInserted: 0,
      };
    }

    let stateId: number;
    if (existing.length > 0) {
      const [updated] = await tx<{ state_id: number }[]>`
        UPDATE regulation_state
        SET body_xml = ${cleanBodyXml}::xml,
            body_text = ${p.bodyText},
            content_hash = ${hash},
            title_snapshot = ${p.title},
            valid_to = ${p.validTo},
            ingested_at = now()
        WHERE bwb_id = ${p.bwbId} AND valid_from = ${p.validFrom}
        RETURNING state_id
      `;
      stateId = updated!.state_id;
    } else {
      const [inserted] = await tx<{ state_id: number }[]>`
        INSERT INTO regulation_state
          (bwb_id, valid_from, valid_to, body_xml, body_text, content_hash, title_snapshot)
        VALUES
          (${p.bwbId}, ${p.validFrom}, ${p.validTo},
           ${cleanBodyXml}::xml, ${p.bodyText}, ${hash}, ${p.title})
        RETURNING state_id
      `;
      stateId = inserted!.state_id;
    }

    await tx`DELETE FROM article WHERE state_id = ${stateId}`;
    // Disambiguate same-state anchor collisions by suffixing ord. Build rows
    // upfront then INSERT all in one round-trip (was N round-trips per state).
    const seenAnchors = new Set<string>();
    const articleRows = p.articles.map((a) => {
      let anchor = a.anchorId;
      if (seenAnchors.has(anchor)) anchor = `${a.anchorId}_${a.ord}`;
      seenAnchors.add(anchor);
      return {
        state_id: stateId,
        number: a.number,
        anchor_id: anchor,
        heading: a.heading,
        body_xml: a.bodyXml || `<a/>`,
        body_text: a.bodyText,
        ord: a.ord,
      };
    });
    if (articleRows.length > 0) {
      // Bun.sql multi-row insert: sql(rows) expands to (col1,col2,...) VALUES (...), (...), ...
      // body_xml needs explicit ::xml cast — apply via UPDATE? Actually Bun.sql infers param
      // types from JS — strings go as text. PG then casts text→xml implicitly when col is xml.
      await tx`
        INSERT INTO article ${tx(articleRows, "state_id", "number", "anchor_id", "heading", "body_xml", "body_text", "ord")}
        ON CONFLICT (state_id, anchor_id) DO NOTHING
      `;
    }

    await tx`DELETE FROM citation WHERE from_state_id = ${stateId}`;
    const citationRows = p.citations
      .filter((c) => !(c.toBwbId === p.bwbId && c.toArticle === c.fromArticle))
      .map((c) => ({
        from_state_id: stateId,
        from_article: c.fromArticle,
        to_bwb_id: c.toBwbId,
        to_article: c.toArticle,
        kind: c.kind,
      }));
    if (citationRows.length > 0) {
      await tx`
        INSERT INTO citation ${tx(citationRows, "from_state_id", "from_article", "to_bwb_id", "to_article", "kind")}
        ON CONFLICT DO NOTHING
      `;
    }

    return {
      regulationInserted,
      stateInserted: true,
      stateId,
      articlesInserted: p.articles.length,
      citationsInserted: p.citations.length,
    };
  });
}
