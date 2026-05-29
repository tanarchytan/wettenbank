import type { ResolvedState } from "./resolve.ts";

const BASE = process.env.PUBLIC_BASE_URL ?? "https://wettenbank.online";

export function renderJsonLd(state: ResolvedState, requestPath: string): string {
  const doc: Record<string, unknown> = {
    "@context": {
      "dcterms": "http://purl.org/dc/terms/",
      "eli": "http://data.europa.eu/eli/ontology#",
      "owms": "http://standaarden.overheid.nl/owms/terms/",
    },
    "@id": `${BASE}${requestPath}`,
    "@type": "eli:LegalResource",
    "eli:jurisdiction": "http://publications.europa.eu/resource/authority/country/NLD",
    "eli:type_document": `eli:${state.type}`,
    "dcterms:identifier": state.bwbId,
    "dcterms:title": state.title,
    "dcterms:language": "nl",
    "dcterms:modified": state.validFrom,
    "eli:date_no_longer_in_force": state.validTo === "9999-12-31" ? null : state.validTo,
    "owms:authority": state.ministry,
    "eli:has_part": null as unknown,
  };
  if (state.article) {
    doc["eli:has_part"] = {
      "@id": `${BASE}${requestPath}#${state.article.anchorId}`,
      "@type": "eli:LegalResourceSubdivision",
      "eli:number": state.article.number,
      "dcterms:title": state.article.heading,
      "dcterms:hasContent": state.article.bodyText,
    };
  }
  return JSON.stringify(doc, null, 2);
}
