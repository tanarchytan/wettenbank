import { SearchFormSimple } from "@/ui/SearchFormSimple";
import { SearchResultCard } from "@/ui/SearchResultCard";
import { executeSearch, type SearchOutput } from "@/search/execute";
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

export default async function ZoekenPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const q = singleStr(params.q);
  const titleQ = singleStr(params.q_titel);
  const types = multiStr(params.type);
  const asOfDate = singleStr(params.date);
  const besArr = multiStr(params.bes);
  const besMode: "default" | "ook" | "alleen" =
    besArr.includes("alleen") ? "alleen" : besArr.includes("ook") ? "ook" : "default";

  const hasQuery = Boolean((q && q.trim()) || (titleQ && titleQ.trim()));
  let result: SearchOutput = { total: 0, results: [] };
  let errorMessage: string | null = null;
  if (hasQuery) {
    try {
      result = await executeSearch({ q, titleQ, types, asOfDate, besMode });
    } catch (err) {
      // Volledige fout alleen server-side; client krijgt generieke melding
      // zodat PG-kolomnamen / query-fragmenten niet lekken.
      const detail = err instanceof Error ? err.message : String(err);
      log.error("zoeken page search failed", { q, titleQ, asOfDate, types, besMode, error: detail });
      errorMessage = "Er ging iets mis bij het zoeken. Probeer het opnieuw of vereenvoudig je zoekopdracht.";
    }
  }

  const displayQ = q || titleQ || "";

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Kruimelpad" className="text-sm text-rijks-text-subdued">
        <p className="m-0 flex items-center gap-1">
          <span>U bent hier:</span>
          <ol className="flex items-center gap-1 list-none p-0 m-0">
            <li>Zoeken</li>
          </ol>
        </p>
      </nav>

      {/* H1 */}
      <div className="row--page-opener pb-3 border-b-2 border-rijks-blue">
        <h1 className="text-2xl font-bold text-rijks-blue leading-tight m-0">Wet- en regelgeving</h1>
      </div>

      {/* Eenvoudig zoeken form */}
      <SearchFormSimple defaults={params} />

      {/* Disclaimer */}
      <p className="text-xs text-rijks-text-subdued border-t border-rijks-border pt-4">
        De informatie in dit onderdeel vormt geen bekendmaking in de zin van de Grondwet. Alleen
        publicatie in het Tractatenblad, het Staatsblad, de Staatscourant en andere vanwege de
        overheid verkrijgbaar gestelde publicatiebladen heeft een officieel karakter.
      </p>

      {/* Results */}
      {errorMessage ? (
        <div className="border-l-4 border-rijks-error bg-[#fdf0ee] p-4 text-sm">
          <p className="font-semibold text-rijks-error">Er ging iets mis bij het zoeken.</p>
          <p className="text-rijks-text-subdued mt-1">{errorMessage}</p>
        </div>
      ) : hasQuery ? (
        <section aria-live="polite">
          <h2 className="text-sm font-semibold text-rijks-text-subdued mb-3 border-b border-rijks-border pb-2">
            Resultaten ({result.total})
            {displayQ && <span className="font-normal ml-1">voor &ldquo;{displayQ}&rdquo;</span>}
          </h2>
          {result.results.length === 0 ? (
            <div className="py-10 text-center">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="mx-auto mb-4 text-rijks-border" aria-hidden="true">
                <circle cx="17" cy="17" r="11" stroke="currentColor" strokeWidth="2" />
                <path d="M26 26 L35 35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M13 17 H21 M17 13 V21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <p className="text-rijks-text-muted">
                Geen resultaten voor <strong>{displayQ}</strong>.
              </p>
              <p className="text-sm text-rijks-text-subdued mt-1">
                Probeer andere zoektermen of pas de filters aan.
              </p>
            </div>
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
