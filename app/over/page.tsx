import { DocPage, DocH2 } from "@/ui/DocPage";

export const metadata = { title: "Over Wettenbank.online" };

export default function OverPage() {
  return (
    <DocPage title="Over Wettenbank.online" breadcrumb="Over deze dienst">
      <p>
        <strong>Wettenbank.online</strong> is een onafhankelijke mirror van het
        Nederlandse Basis Wetten Bestand (BWB). De gegevens worden direct uit de
        openbare KOOP-levering geïngest en aangeboden via een zoek-interface en
        permanente ELI-URLs (European Legislation Identifier).
      </p>

      <DocH2>Wat we doen</DocH2>
      <ul className="list-disc pl-5 space-y-1">
        <li>Volledige spiegel van alle BWBR-regelingen, BWBV-verdragen en BWBW-besluiten</li>
        <li>Volledige Nederlandse FTS-zoekfunctie (titel én tekst)</li>
        <li>Tijdsspecifieke weergave — bekijk een regeling zoals geldend op een gekozen datum</li>
        <li>ELI-URL als primaire identifier, met JCI- en LiDO-aliassen voor citatie</li>
        <li>Export naar TXT/RTF, print-vriendelijke weergave per artikel of hele regeling</li>
      </ul>

      <DocH2>Wat we niet zijn</DocH2>
      <p>
        Wettenbank.online is <strong>geen officiële overheidsbron</strong>. Voor juridisch
        bindende publicatie raadpleeg het Tractatenblad, Staatsblad, Staatscourant en andere
        officiële publicatiebladen, of het origineel op{" "}
        <a href="https://wetten.overheid.nl/" rel="external noopener" className="text-rijks-link hover:underline">
          wetten.overheid.nl
        </a>
        .
      </p>

      <DocH2>Data en bronvermelding</DocH2>
      <p>
        Brongegevens: KOOP (Kennis- en Exploitatiecentrum Officiële Overheidspublicaties) via
        het Basis Wetten Bestand. Licentie: CC0 (publiek domein). Wij verrijken de data met
        geïndexeerde zoekvelden en alternatieve weergaven, maar passen de inhoud niet aan.
      </p>

      <DocH2>Techniek</DocH2>
      <p>
        Open-source pijplijn (Bun + Next.js + PostgreSQL) met dagelijkse delta-sync van de
        KOOP SRU-feed. Volledige technische documentatie in de repository.
      </p>
    </DocPage>
  );
}
