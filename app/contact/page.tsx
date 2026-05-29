import { DocPage, DocH2 } from "@/ui/DocPage";

export const metadata = { title: "Contact — Wettenbank.online" };

export default function ContactPage() {
  return (
    <DocPage title="Contact" breadcrumb="Contact">
      <p>
        Vragen, opmerkingen of bug-reports kun je op meerdere manieren delen.
      </p>

      <DocH2>Voor de inhoud van een regeling</DocH2>
      <p>
        Wij geven alleen de data weer die KOOP publiceert. Als je een fout in een specifieke
        wet of regeling vermoedt, neem dan rechtstreeks contact op met{" "}
        <a href="https://www.overheid.nl/contact" rel="external noopener" className="text-rijks-link hover:underline">
          Overheid.nl
        </a>
        . Wij synchroniseren binnen 24 uur na hun correctie.
      </p>

      <DocH2>Voor de werking van deze site</DocH2>
      <ul className="list-disc pl-5 space-y-1">
        <li>
          <strong>Bug rapporteren of feature voorstellen</strong>:{" "}
          <a href="https://github.com/tanarchytan/wettenbank/issues" rel="external noopener" className="text-rijks-link hover:underline">
            GitHub Issues
          </a>
        </li>
        <li>
          <strong>Beveiligingsmelding</strong>: zie ons{" "}
          <a href="/security" className="text-rijks-link hover:underline">security-beleid</a>
        </li>
        <li>
          <strong>E-mail</strong>: <a href="mailto:contact@wettenbank.online" className="text-rijks-link hover:underline">contact@wettenbank.online</a>
        </li>
      </ul>

      <DocH2>Geen juridisch advies</DocH2>
      <p>
        Wij beantwoorden geen juridische vragen. Voor juridisch advies kun je terecht bij een
        advocaat, het{" "}
        <a href="https://www.juridischloket.nl/" rel="external noopener" className="text-rijks-link hover:underline">
          Juridisch Loket
        </a>{" "}
        of de Raad voor Rechtsbijstand.
      </p>
    </DocPage>
  );
}
