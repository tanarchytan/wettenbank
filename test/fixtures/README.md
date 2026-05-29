# Test fixtures

## `bwb-sample.xml`

**Status:** SYNTHETIC, gitignored by `test/fixtures/*.xml` rule.

A hand-crafted BWB-format XML modelled on Grondwet (BWBR0001840). Used to drive parser unit tests
without depending on KOOP's live SRU service (which requires authenticated access for the actual
BWB dataset; the public `/sru` endpoint serves the broader CUP database without per-BWB queries).

### Why synthetic?

During Plan 1 development, the public KOOP SRU at `https://repository.overheid.nl/sru` returned
zero records for `dt.identifier=BWBR0001840` queries. The actual BWB dataset is delivered as a
14 GB tarball after a KOOP contact-form request, not via the public SRU. We TDD against a
synthetic fixture and validate against real data when KOOP delivers.

The structure mirrors observed BWB conventions:
- Root: `<toestand>` (a regulation state) wrapping `<wetgeving>` (the regulation itself)
- Attributes: `bwb-id`, `soort` (wet/AMvB/MinR/...), `inwerking-per`, `geldig-tot`
- Hierarchy: `wet-besluit > wettekst > hoofdstuk > (paragraaf?) > artikel`
- Article markers: `<artikel label="Artikel" nr="N">` with `<kop>` and `<al>` / `<lid>` body
- Cross-refs: `<verwijzing bwb-id="..." artikel="...">`, `<wijziging>`, `<grondslag>`

### Replacing with real data

Once the KOOP tarball arrives:

```bash
cp /path/to/extracted/BWBR0001840/*.xml test/fixtures/bwb-sample.xml
bun test test/unit/parse-bwb-xml.test.ts
```

Adapt the parser if the real XML uses slightly different attribute or element names.

## Other fixtures (added later)

- `bwb-awb.xml` (optional) — Algemene wet bestuursrecht (BWBR0005537), used in
  `extract-citations.test.ts` to verify multi-citation handling. Same source pattern.
