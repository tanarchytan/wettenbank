import { describe, expect, test } from "bun:test";
import { parseManifest } from "../../src/ingest/parse-manifest.ts";
import { diffManifest } from "../../src/koop/manifest-diff.ts";

// Verkleinde versie van het echte BWBR0008455-manifest: een ingetrokken
// expressie (1999-01-01_0, item _deleted="true") tussen twee geldige. KOOP
// serveert de ingetrokken item-XML niet meer (301 self-redirect-loop), dus
// die mag NOOIT als missend worden gefetcht.
const MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<work label="BWBR0008455" _latestItem="1998-12-30_0/xml/BWBR0008455_1998-12-30_0.xml">
  <metadata><datum_inwerkingtreding>1997-01-01</datum_inwerkingtreding><wti_locatie>BWBR0008455.WTI</wti_locatie></metadata>
  <expression label="1998-12-30_0">
    <metadata><datum_inwerkingtreding>1998-12-30</datum_inwerkingtreding><einddatum>2013-07-03</einddatum></metadata>
    <manifestation label="xml"><item label="BWBR0008455_1998-12-30_0.xml" _deleted="false" /></manifestation>
  </expression>
  <expression label="1999-01-01_0">
    <metadata><datum_inwerkingtreding>1999-01-01</datum_inwerkingtreding><einddatum>2013-07-03</einddatum></metadata>
    <manifestation label="xml"><item label="BWBR0008455_1999-01-01_0.xml" _deleted="true" /></manifestation>
  </expression>
  <expression label="2013-07-04_0">
    <metadata><datum_inwerkingtreding>2013-07-04</datum_inwerkingtreding><einddatum>9999-12-31</einddatum></metadata>
    <manifestation label="xml"><item label="BWBR0008455_2013-07-04_0.xml" _deleted="false" /></manifestation>
  </expression>
</work>`;

describe("parseManifest — _deleted vlag", () => {
  test("zet deleted=true op ingetrokken item, false op de rest", () => {
    const m = parseManifest(MANIFEST);
    const byFrom = Object.fromEntries(m.states.map((s) => [s.validFrom, s.deleted]));
    expect(byFrom["1999-01-01"]).toBe(true);
    expect(byFrom["1998-12-30"]).toBe(false);
    expect(byFrom["2013-07-04"]).toBe(false);
  });
});

describe("diffManifest — ingetrokken states", () => {
  test("fetcht ingetrokken state nooit, ook niet als die ontbreekt in DB", () => {
    // DB heeft de twee geldige states al; 1999-01-01 (deleted) ontbreekt.
    const known = new Set(["1998-12-30", "2013-07-04"]);
    const missing = diffManifest(MANIFEST, known, "BWBR0008455");
    // Niets te doen: de enige niet-aanwezige expressie is ingetrokken.
    expect(missing).toHaveLength(0);
  });

  test("levert wél geldige nieuwe states, maar nooit de ingetrokken", () => {
    // Lege DB: beide geldige states zijn missend, de ingetrokken niet.
    const missing = diffManifest(MANIFEST, new Set(), "BWBR0008455");
    const froms = missing.map((s) => s.validFrom).sort();
    expect(froms).toEqual(["1998-12-30", "2013-07-04"]);
    expect(froms).not.toContain("1999-01-01");
  });
});
