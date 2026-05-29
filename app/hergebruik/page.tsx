import { DocPage, DocH2 } from "@/ui/DocPage";

export const metadata = { title: "Informatie hergebruiken — Wettenbank.online" };

export default function HergebruikPage() {
  return (
    <DocPage title="Informatie hergebruiken" breadcrumb="Hergebruik">
      <p>
        De wettekst zelf valt in het publiek domein en kan onbeperkt worden hergebruikt.
        Onze laag eroverheen — zoekindex, ELI-routing, code — is open source.
      </p>

      <DocH2>Bronlicentie (KOOP / BWB)</DocH2>
      <p>
        Wet- en regelgeving is per definitie geen auteursrechtelijk werk
        (Auteurswet artikel 11). KOOP publiceert het Basis Wetten Bestand onder{" "}
        <a href="https://creativecommons.org/publicdomain/zero/1.0/deed.nl" rel="external noopener" className="text-rijks-link hover:underline">
          CC0 1.0 Universal
        </a>{" "}
        — publiek domein, geen attributie vereist.
      </p>

      <DocH2>Onze laag (interface + code)</DocH2>
      <p>
        De broncode van Wettenbank.online (Next.js viewer, Bun ingest-pipeline, DB-schema)
        is open source onder MIT-licentie. De gegenereerde markdown- en JSON-bestanden
        volgen dezelfde licentie als KOOP (CC0).
      </p>

      <DocH2>API-toegang</DocH2>
      <ul className="list-disc pl-5 space-y-1">
        <li>
          <strong>JSON per regeling</strong>:{" "}
          <code className="font-mono text-xs">/api/eli/nl/{`<type>`}/{`<jaar>`}/{`<slug>`}</code>
        </li>
        <li>
          <strong>Zoek-API</strong>:{" "}
          <code className="font-mono text-xs">/api/search?q=&amp;type=Wetten</code>
        </li>
        <li>
          <strong>Health check</strong>: <code className="font-mono text-xs">/api/health</code>
        </li>
      </ul>
      <p>
        Voor bulk-toegang raden we de officiële KOOP-feeds aan:{" "}
        <a href="https://data.overheid.nl/dataset/basis-wetten-bestand" rel="external noopener" className="text-rijks-link hover:underline">
          data.overheid.nl/dataset/basis-wetten-bestand
        </a>
        .
      </p>

      <DocH2>Citeren</DocH2>
      <p>
        We bieden meerdere identifiers per regeling: BWB-id, ELI-URI, JCI (1.0 en 1.3), en
        de wetten.overheid.nl /id/-URL. Te zien onder &quot;Wetstechnische informatie&quot;
        op elke regelingspagina.
      </p>
    </DocPage>
  );
}
