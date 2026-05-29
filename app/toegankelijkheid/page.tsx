import { DocPage, DocH2 } from "@/ui/DocPage";

export const metadata = { title: "Toegankelijkheid — Wettenbank.online" };

export default function ToegankelijkheidPage() {
  return (
    <DocPage title="Toegankelijkheid" breadcrumb="Toegankelijkheid">
      <p>
        Wettenbank.online streeft naar conformiteit met{" "}
        <strong>WCAG 2.2 niveau AA</strong>, in lijn met het Tijdelijk besluit
        digitale toegankelijkheid overheid. De site is bewust eenvoudig opgebouwd:
        semantische HTML, voldoende kleurcontrast, focus-states op alle
        interactieve elementen, en volledig toetsenbord-bedienbaar.
      </p>

      <DocH2>Wat goed gaat</DocH2>
      <ul className="list-disc pl-5 space-y-1">
        <li>Heading-structuur volgt de wettelijke onderverdeling (Hoofdstuk &gt; Afdeling &gt; Artikel).</li>
        <li>Skiplink &ldquo;Direct naar content&rdquo; bovenaan elke pagina.</li>
        <li>Formulier-labels expliciet gekoppeld aan invoer.</li>
        <li>Kruimelpad op alle pagina&apos;s met juiste landmarks.</li>
        <li>Print-stylesheet voor leesbare afdrukken zonder navigatie.</li>
        <li>Vergrotingsstabiel tot 200% zoom zonder horizontale scroll.</li>
      </ul>

      <DocH2>Bekende beperkingen</DocH2>
      <ul className="list-disc pl-5 space-y-1">
        <li>De modale dropdowns voor uitgebreid zoeken (Rechtsgebieden, ZBO&apos;s) hebben
          lange lijsten zonder filter — verbetering is gepland.</li>
        <li>Hover-tooltips bij formulier-velden zijn ook via toetsenbord bereikbaar
          (focus opent &lt;details&gt;), maar de visuele plaatsing kan op kleine schermen
          afgekapt raken.</li>
      </ul>

      <DocH2>Verklaring melden</DocH2>
      <p>
        Een toegankelijkheidsverklaring conform DigiToegankelijk wordt voor de officiële
        livegang geregistreerd in het{" "}
        <a href="https://www.toegankelijkheidsverklaring.nl/" rel="external noopener" className="text-rijks-link hover:underline">
          register Toegankelijkheidsverklaring
        </a>
        .
      </p>

      <DocH2>Probleem melden</DocH2>
      <p>
        Ondervind je een toegankelijkheidsprobleem? Mail{" "}
        <a href="mailto:David@Gillot.EU" className="text-rijks-link hover:underline">
          David@Gillot.EU
        </a>{" "}
        — we reageren binnen 5 werkdagen.
      </p>
    </DocPage>
  );
}
