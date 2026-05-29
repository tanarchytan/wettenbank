import { describe, expect, test } from "bun:test";
import { parseSruResponse, buildSearchUrl } from "../../src/sru/client.ts";

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<sru:searchRetrieveResponse xmlns:sru="http://docs.oasis-open.org/ns/search-ws/sruResponse">
  <sru:numberOfRecords>2</sru:numberOfRecords>
  <sru:records>
    <sru:record>
      <sru:recordData>
        <gzd xmlns="http://standaarden.overheid.nl/sru">
          <originalData><meta><owmskern><identifier>BWBR0000001</identifier><modified>2026-05-20</modified></owmskern></meta></originalData>
          <enrichedData><preferredUrl>https://repository.overheid.nl/frbr/officielepublicaties/bwb/BWBR0000001/1/xml/BWBR0000001.xml</preferredUrl></enrichedData>
        </gzd>
      </sru:recordData>
    </sru:record>
    <sru:record>
      <sru:recordData>
        <gzd xmlns="http://standaarden.overheid.nl/sru">
          <originalData><meta><owmskern><identifier>BWBR0000002</identifier><modified>2026-05-21</modified></owmskern></meta></originalData>
          <enrichedData><preferredUrl>https://repository.overheid.nl/frbr/officielepublicaties/bwb/BWBR0000002/1/xml/BWBR0000002.xml</preferredUrl></enrichedData>
        </gzd>
      </sru:recordData>
    </sru:record>
  </sru:records>
</sru:searchRetrieveResponse>`;

describe("buildSearchUrl", () => {
  test("formats query, startRecord, maximumRecords", () => {
    const url = buildSearchUrl("https://repository.overheid.nl/sru", {
      query: "dt.modified>=2026-05-01",
      startRecord: 1,
      maximumRecords: 100,
    });
    expect(url).toContain("operation=searchRetrieve");
    expect(url).toContain("version=2.0");
    expect(url).toContain("query=dt.modified%3E%3D2026-05-01");
    expect(url).toContain("startRecord=1");
    expect(url).toContain("maximumRecords=100");
    expect(url).toContain("x-connection=BWB");
  });
});

describe("parseSruResponse", () => {
  test("extracts records with bwbId, modified, url", () => {
    const r = parseSruResponse(SAMPLE);
    expect(r.totalRecords).toBe(2);
    expect(r.records).toHaveLength(2);
    expect(r.records[0]!.bwbId).toBe("BWBR0000001");
    expect(r.records[0]!.modified).toBe("2026-05-20");
    expect(r.records[0]!.url).toContain("BWBR0000001.xml");
  });
});
