/**
 * Vergelijk een KOOP-manifest (XML) met onze DB-rows voor een BWB.
 * Output: lijst van missende of nieuwere states die we moeten downloaden.
 */
import { parseManifest } from "../ingest/parse-manifest.ts";
import { log } from "../log.ts";

export interface MissingState {
  /** Label uit manifest, b.v. "2026-01-01_0" */
  label: string;
  /** ISO-datum van inwerkingtreding (validFrom) */
  validFrom: string;
  /** ISO-einddatum (validTo) */
  validTo: string;
  /** Bestandsnaam van het XML voor deze state */
  xmlFilename: string;
}

/**
 * Geef de states uit het manifest die NIET in onze DB zitten of een ouder
 * content-hash hebben. validFroms uit de DB als input zodat we het in
 * batch kunnen aanroepen zonder extra DB-queries per BWB.
 */
export function diffManifest(
  manifestXml: string,
  knownValidFroms: ReadonlySet<string>,
  bwbId?: string,
): MissingState[] {
  const parsed = parseManifest(manifestXml);
  const missing: MissingState[] = [];
  for (const state of parsed.states) {
    // KOOP heeft de XML ingetrokken (vervangen/gecorrigeerde expressie). De
    // server serveert 'm niet meer (301 self-redirect-loop). NIET fetchen en
    // NIET als missend tellen — anders blijft de BWB eeuwig 'incomplete'.
    if (state.deleted) {
      // Edge: als we deze (nu ingetrokken) state tóch in DB hebben, is onze
      // mirror op dit punt verouderd. Surface het; deletion-policy is een
      // aparte beslissing (we verwijderen hier niet automatisch wetdata).
      if (knownValidFroms.has(state.validFrom)) {
        log.warn("koop manifest marks a state we hold as deleted", {
          bwbId: bwbId ?? parsed.bwbId,
          validFrom: state.validFrom,
          label: state.label,
        });
      }
      continue;
    }
    if (!state.xmlFilename) continue; // KOOP-side leeg, niet downloadbaar
    if (knownValidFroms.has(state.validFrom)) continue; // hebben we al
    missing.push({
      label: state.label,
      validFrom: state.validFrom,
      validTo: state.validTo,
      xmlFilename: state.xmlFilename,
    });
  }
  return missing;
}
