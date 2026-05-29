import { SearchFormAdvanced } from "@/ui/SearchFormAdvanced";
import { SearchResultCard } from "@/ui/SearchResultCard";
import { executeSearch, type SearchOutput, type Datumbereik, type Datumtype, type Datumscope } from "@/search/execute";
import { log } from "@/log";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function singleStr(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}
function multiStr(v: string | string[] | undefined): string[] {
  if (Array.isArray(v)) return v;
  if (v) return [v];
  return [];
}

const DATUMBEREIK_MAP: Record<string, Datumbereik> = { "1": "voor", "2": "na", "3": "tussen", "4": "op" };
const DATUMTYPE_MAP: Record<string, Datumtype> = {
  Inwerkingtreding: "inwerkingtreding", Ondertekening: "ondertekening", Totstandkoming: "totstandkoming",
};
const DATUMSCOPE_MAP: Record<string, Datumscope> = { Regeling: "regeling", Artikel: "artikel" };

export default async function UitgebreidPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const q = singleStr(params.q);
  const titleQ = singleStr(params.q_titel);
  const types = multiStr(params.type);
  const asOfDate = singleStr(params.date);
  const besArr = multiStr(params.bes);
  const besMode: "default" | "ook" | "alleen" =
    besArr.includes("alleen") ? "alleen" : besArr.includes("ook") ? "ook" : "default";

  const ministerieCodes = multiStr(params.Select_Ministeries);
  const zboCodes = multiStr(params.Select_ZBO);
  const pboCodes = multiStr(params.Select_PBO);
  const rechtsgebieden = multiStr(params.rechtsgebied);
  const overheidsdomeinen = multiStr(params.overheidsdomein);
  const verdragThemas = multiStr(params.verdragThema);

  const datumbereikRaw = singleStr(params.datumbereik);
  const datumbereik = datumbereikRaw ? DATUMBEREIK_MAP[datumbereikRaw] : undefined;
  const datumtypeRaw = singleStr(params.datumtype);
  const datumtype = datumtypeRaw ? DATUMTYPE_MAP[datumtypeRaw] : undefined;
  const datumscopeRaw = singleStr(params.datumscope);
  const datumscope = datumscopeRaw ? DATUMSCOPE_MAP[datumscopeRaw] : undefined;

  const publicatieJaarRaw = singleStr(params.publicatieJaar);
  const publicatieJaar = (() => {
    if (!publicatieJaarRaw) return undefined;
    const n = parseInt(publicatieJaarRaw, 10);
    // Clamp tot redelijke wettenbestand-range (oudste BWB-regel = 1810).
    if (!Number.isFinite(n) || n < 1800 || n > 2100) return undefined;
    return n;
  })();

  const hasUserInput = Boolean(
    (q && q.trim()) ||
    (titleQ && titleQ.trim()) ||
    singleStr(params.artikelnr)?.trim() ||
    singleStr(params.bwbid)?.trim() ||
    singleStr(params.kamerstuk)?.trim() ||
    singleStr(params.juriconnect)?.trim() ||
    singleStr(params.wetsfamilie)?.trim() ||
    ministerieCodes.length || zboCodes.length || pboCodes.length ||
    rechtsgebieden.length || overheidsdomeinen.length ||
    singleStr(params.publicatieBron)?.trim() || publicatieJaar || singleStr(params.publicatieNummer)?.trim() ||
    (datumbereik && singleStr(params.startdatum)?.trim()),
  );

  let result: SearchOutput = { total: 0, results: [] };
  let errorMessage: string | null = null;
  if (hasUserInput) {
    try {
      result = await executeSearch({
        q, titleQ, types, asOfDate, besMode,
        artikelnr: singleStr(params.artikelnr),
        wetsfamilie: singleStr(params.wetsfamilie),
        bwbId: singleStr(params.bwbid),
        kamerstuk: singleStr(params.kamerstuk),
        juriconnect: singleStr(params.juriconnect),
        kenmerk: singleStr(params.kenmerk),
        ministerieCodes,
        zboCodes,
        pboCodes,
        rechtsgebieden,
        overheidsdomeinen,
        verdragThemas,
        publicatieBron: singleStr(params.publicatieBron),
        publicatieJaar,
        publicatieNummer: singleStr(params.publicatieNummer),
        datumbereik,
        datumtype,
        datumscope,
        startdatum: singleStr(params.startdatum),
        einddatum: singleStr(params.einddatum),
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      log.error("uitgebreid search failed", { error: detail });
      errorMessage = "Er ging iets mis bij het zoeken. Probeer het opnieuw of vereenvoudig je zoekopdracht.";
    }
  }

  return (
    <div className="space-y-6">
      <nav aria-label="Kruimelpad" className="text-sm text-rijks-text-subdued">
        <p className="m-0 flex items-center gap-1">
          <span>U bent hier:</span>
          <ol className="flex items-center gap-1 list-none p-0 m-0">
            <li>Uitgebreid zoeken</li>
          </ol>
        </p>
      </nav>

      <div className="row--page-opener pb-3 border-b-2 border-rijks-blue">
        <h1 className="text-2xl font-bold text-rijks-blue leading-tight m-0">Wet- en regelgeving — Uitgebreid zoeken</h1>
      </div>

      <SearchFormAdvanced defaults={params} />

      <p className="text-xs text-rijks-text-subdued border-t border-rijks-border pt-4">
        De informatie in dit onderdeel vormt geen bekendmaking in de zin van de Grondwet. Alleen
        publicatie in het Tractatenblad, het Staatsblad, de Staatscourant en andere vanwege de
        overheid verkrijgbaar gestelde publicatiebladen heeft een officieel karakter.
      </p>

      {errorMessage ? (
        <div className="border-l-4 border-rijks-error bg-[#fdf0ee] p-4 text-sm">
          <p className="font-semibold text-rijks-error">Er ging iets mis bij het zoeken.</p>
          <p className="text-rijks-text-subdued mt-1">{errorMessage}</p>
        </div>
      ) : hasUserInput ? (
        <section aria-live="polite">
          <h2 className="text-sm font-semibold text-rijks-text-subdued mb-3 border-b border-rijks-border pb-2">
            Resultaten ({result.total})
          </h2>
          {result.results.length === 0 ? (
            <p className="text-rijks-text-muted text-sm py-4">Geen resultaten gevonden.</p>
          ) : (
            <ul className="list-none p-0 m-0">
              {result.results.map((r) => (
                <li key={r.bwbId}>
                  <SearchResultCard hit={r} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
