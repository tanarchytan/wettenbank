import { DocPage, DocH2 } from "@/ui/DocPage";

export const metadata = { title: "Help — Wettenbank.online" };

export default function HelpPage() {
  return (
    <DocPage title="Help — zo zoek je" breadcrumb="Help">
      <DocH2>Eenvoudig zoeken</DocH2>
      <p>
        Vul één of beide tekstvelden in (<em>In de titel</em> en/of <em>In de tekst</em>).
        Vink minstens één soort regeling aan en kies een datum. Resultaten verschijnen onder
        het formulier.
      </p>

      <DocH2>Operators in zoekopdrachten</DocH2>
      <ul className="list-disc pl-5 space-y-1">
        <li><code className="font-mono">EN</code> — alle woorden moeten voorkomen (default). Bijv. <code className="font-mono">gezondheid EN veiligheid</code>.</li>
        <li><code className="font-mono">OF</code> — tenminste één woord moet voorkomen. Bijv. <code className="font-mono">milieu OF natuur</code>.</li>
        <li><code className="font-mono">*</code> — woordsamenstelling. Bijv. <code className="font-mono">milieu*</code> vindt ook <em>milieuvergunning</em>, <em>milieuplan</em>.</li>
      </ul>

      <DocH2>Datum kiezen</DocH2>
      <p>
        Bij <em>Regeling geldig op</em> krijg je de versie zoals die op die datum gold.
        Standaard staat dit op vandaag. Druk op <em>Vandaag</em> om snel terug te springen.
      </p>

      <DocH2>Uitgebreid zoeken</DocH2>
      <p>
        Via <a href="/uitgebreid_zoeken" className="text-rijks-link hover:underline">Uitgebreid zoeken</a>{" "}
        kun je filteren op rechtsgebied, overheidsthema, ministerie/ZBO/PBO, publicatie (Stb/Stcrt/Trb),
        kamerstuknummer, BWB-id of Juriconnect-ID, en je krijgt een dubbel datummodel (geldigheid +
        zichtdatum + datumbereik).
      </p>

      <DocH2>Een regeling exporteren</DocH2>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Afdrukken</strong> — print-stylesheet verbergt navigatie. Per artikel via het ⋯-menu.</li>
        <li><strong>TXT / RTF</strong> — download de hele regeling of één artikel als platte tekst.</li>
        <li><strong>Permanente link</strong> — kopieer een URL met de datum ingebakken.</li>
        <li><strong>LiDO</strong> — open de officiële linked-data relaties op linkeddata.overheid.nl.</li>
      </ul>

      <DocH2>URLs zelf opbouwen</DocH2>
      <p>
        Onze permanente links volgen het ELI-schema:
      </p>
      <pre className="bg-neutral-bg border border-rijks-border px-3 py-2 text-xs font-mono overflow-x-auto">
        /eli/nl/{`<type>`}/{`<jaar>`}/{`<slug>`}[/{`<datum>`}][/artikel/{`<nr>`}]
      </pre>
      <p>
        Bijvoorbeeld:{" "}
        <a href="/eli/nl/wet/1994/algemene-wet-bestuursrecht" className="text-rijks-link hover:underline font-mono">
          /eli/nl/wet/1994/algemene-wet-bestuursrecht
        </a>
      </p>
    </DocPage>
  );
}
