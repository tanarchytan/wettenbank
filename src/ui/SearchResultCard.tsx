/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import type { SearchRow } from "@/search/query";

const TYPE_COLORS: Record<string, string> = {
  wet:          "bg-rijks-tint text-rijks-blue border border-rijks-blue/20",
  AMvB:         "bg-rijks-tint text-rijks-blue border border-rijks-blue/20",
  MinR:         "bg-rijks-tint text-rijks-blue border border-rijks-blue/20",
  beleidsregel: "bg-[#fff3e0] text-[#8a4000] border border-[#e17000]/20",
  circulaire:   "bg-neutral-bg text-rijks-text-muted border border-rijks-border",
  ZBO:          "bg-[#f0f7ed] text-[#1e5a00] border border-[#39870c]/20",
  KB:           "bg-rijks-tint text-rijks-blue border border-rijks-blue/20",
  reglement:    "bg-neutral-bg text-rijks-text-muted border border-rijks-border",
};

function pillFor(t: string): string {
  return TYPE_COLORS[t] ?? "bg-neutral-bg text-rijks-text-muted border border-rijks-border";
}

function humanType(t: string): string {
  const map: Record<string, string> = {
    wet: "Wet", AMvB: "AMvB", MinR: "Min.R.", beleidsregel: "Beleidsregel",
    circulaire: "Circulaire", ZBO: "ZBO", KB: "KB", reglement: "Reglement",
  };
  return map[t] ?? t;
}

export function SearchResultCard({ hit }: { hit: SearchRow }) {
  // Derive year from validFrom (e.g. "2022-01-01" → "2022")
  const year = hit.validFrom?.slice(0, 4) ?? "";

  return (
    <article
      className="border-b border-rijks-border py-4 first:pt-0 last:border-b-0 hover:bg-rijks-tint/30 transition-colors -mx-2 px-2"
      style={{ viewTransitionName: `card-${hit.bwbId}` }}
    >
      {/* Breadcrumb */}
      <div className="text-xs text-rijks-text-subdued mb-1 flex items-center gap-1">
        <span className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded-sm ${pillFor(hit.type)}`}>
          {humanType(hit.type)}
        </span>
        {year && (
          <>
            <span aria-hidden="true">›</span>
            <span>{year}</span>
          </>
        )}
        {hit.bwbId && (
          <>
            <span aria-hidden="true">›</span>
            <span className="font-mono">{hit.bwbId}</span>
          </>
        )}
      </div>

      {/* Title — uses titleHighlight when titleQ matched (server-side <b> wrap) */}
      <h3 className="text-base font-semibold leading-snug mb-1">
        <Link
          href={hit.eliUri as any}
          className="text-rijks-link no-underline hover:underline"
          prefetch={false}
          style={{ viewTransitionName: `title-${hit.bwbId}` }}
          // ts_headline output already sanitised (only <b>/</b> tags injected)
          dangerouslySetInnerHTML={{ __html: hit.titleHighlight || hit.title }}
        />
        {hit.matchedArticles.length > 0 && (
          <span className="ml-1 font-normal text-rijks-text-muted">
            ({hit.matchedArticles.length}{" "}
            {hit.matchedArticles.length === 1 ? "artikel" : "artikelen"})
          </span>
        )}
      </h3>

      {/* Snippet — only shown when the user actually queried body text */}
      {hit.snippet ? (
        <p
          className="text-sm text-rijks-text-muted leading-relaxed"
          dangerouslySetInnerHTML={{ __html: hit.snippet }}
        />
      ) : null}

      {/* Collapsed relevant elements — mirrors wetten.overheid.nl pattern */}
      {hit.matchedArticles.length > 0 && (
        <details className="mt-1.5 text-sm">
          <summary className="cursor-pointer text-rijks-link hover:underline list-none select-none [&::-webkit-details-marker]:hidden">
            <span aria-hidden="true" className="inline-block w-3 text-rijks-text-subdued">▸</span>
            {hit.matchedArticles.length} relevante{" "}
            {hit.matchedArticles.length === 1 ? "element" : "elementen"}
          </summary>
          <ul className="list-none mt-1 pl-4 space-y-0.5">
            {hit.matchedArticles.map((a) => (
              <li key={a.anchorId} className="text-rijks-text-muted">
                <span>{a.heading ?? `Artikel ${a.number}`}</span>{" "}
                <Link
                  href={`${hit.eliUri}#${a.anchorId}` as any}
                  prefetch={false}
                  className="text-rijks-link no-underline hover:underline"
                >
                  (bekijken)
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
