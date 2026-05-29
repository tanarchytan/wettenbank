import { DocPage, DocH2 } from "@/ui/DocPage";

export const metadata = { title: "Privacy en cookies — Wettenbank.online" };

export default function PrivacyPage() {
  return (
    <DocPage title="Privacy en cookies" breadcrumb="Privacy">
      <p>
        Wettenbank.online verzamelt zo min mogelijk gegevens. Deze pagina beschrijft wat we
        wel en niet bewaren.
      </p>

      <DocH2>Geen tracking, geen cookies</DocH2>
      <ul className="list-disc pl-5 space-y-1">
        <li>We plaatsen <strong>geen analytics-cookies</strong> en gebruiken geen Google Analytics, Piwik of vergelijkbare diensten.</li>
        <li>We plaatsen <strong>geen marketing-cookies</strong>.</li>
        <li>Er is <strong>geen account</strong>; je kunt anoniem zoeken.</li>
      </ul>

      <DocH2>Wat we wel verwerken</DocH2>
      <ul className="list-disc pl-5 space-y-1">
        <li>
          <strong>Server-logs</strong> — onze edge-provider Cloudflare logt IP, user-agent en
          verzochte URL. Deze logs worden maximaal 30 dagen bewaard, alleen gebruikt voor
          beveiliging (DDoS, misbruik) en niet gekoppeld aan personen.
        </li>
        <li>
          <strong>Application-logs</strong> — onze server logt anonieme query-statistieken
          (aantal hits per zoekterm) om de zoekfunctie te verbeteren. Geen IPs of identifiers.
        </li>
      </ul>

      <DocH2>Externe links</DocH2>
      <p>
        We linken naar derde partijen (KOOP, LiDO, EUR-Lex, Powersearch). Op die sites geldt
        het privacybeleid van de betreffende organisatie.
      </p>

      <DocH2>Rechten</DocH2>
      <p>
        Omdat we geen persoonsgegevens opslaan zijn rechten op inzage, correctie of
        verwijdering niet van toepassing op gegevens die wij bewaren. Voor Cloudflare-logs
        kun je terecht bij{" "}
        <a href="https://www.cloudflare.com/privacypolicy/" rel="external noopener" className="text-rijks-link hover:underline">
          Cloudflare's privacy statement
        </a>
        .
      </p>

      <p className="text-xs text-rijks-text-subdued mt-8">
        Laatst gewijzigd: {new Date().toISOString().slice(0, 10)}
      </p>
    </DocPage>
  );
}
