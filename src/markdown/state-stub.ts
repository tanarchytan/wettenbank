import type {
  LoadedRegulation,
  LoadedState,
  RegulationHeader,
} from "../ingest/load-koop-regulation.ts";

/**
 * Bouw een synthetische `LoadedRegulation` waar precies één staat volledig
 * geparsd is; de rest zijn lichte stubs die alleen `validFrom`/`validTo`
 * dragen (genoeg voor `stateMarkdown`'s prev/next nav-lookups).
 *
 * Geheugen blijft O(1 staat-body) per call — kritiek voor regelingen als
 * Wet IB met 575 staten / 9 GB.
 */
export function buildOneStateReg(
  header: RegulationHeader,
  parsed: LoadedState,
  parsedIdx: number,
): LoadedRegulation {
  const stubs: LoadedState[] = header.states.map((s, j) => {
    if (j === parsedIdx) return parsed;
    return {
      bwbId: header.bwbId,
      eliUri: "",
      type: parsed.type,
      ministry: header.ministry,
      geoScope: "NL",
      title: "",
      abbreviation: header.abbreviation,
      citetitle: header.citetitle,
      validFrom: s.validFrom,
      validTo: s.validTo,
      bodyXml: "",
      bodyText: "",
      articles: [],
      citations: [],
      sourceXmlPath: s.xmlPath,
    };
  });
  return {
    bwbId: header.bwbId,
    ministry: header.ministry,
    citetitle: header.citetitle,
    abbreviation: header.abbreviation,
    type: parsed.type,
    manifestFirstInwerkingtreding: header.manifestFirstInwerkingtreding,
    states: stubs,
  };
}

/**
 * README-variant: header + de title/citetitle van de LAATSTE staat (vastgehouden
 * tijdens streamen), plus stubs voor alle staten in de versie-tabel. Geen XML
 * bodies — zuiver overzichtsdata.
 */
export function buildReadmeReg(
  header: RegulationHeader,
  latestTitle: string,
  latestCitetitle: string | null,
): LoadedRegulation {
  const states: LoadedState[] = header.states.map((s, j) => ({
    bwbId: header.bwbId,
    eliUri: "",
    type: header.type,
    ministry: header.ministry,
    geoScope: "NL",
    title: j === header.states.length - 1 ? latestTitle : "",
    abbreviation: header.abbreviation,
    citetitle: j === header.states.length - 1 ? latestCitetitle : header.citetitle,
    validFrom: s.validFrom,
    validTo: s.validTo,
    bodyXml: "",
    bodyText: "",
    articles: [],
    citations: [],
    sourceXmlPath: s.xmlPath,
  }));
  return {
    bwbId: header.bwbId,
    ministry: header.ministry,
    citetitle: header.citetitle,
    abbreviation: header.abbreviation,
    type: header.type,
    manifestFirstInwerkingtreding: header.manifestFirstInwerkingtreding,
    states,
  };
}
