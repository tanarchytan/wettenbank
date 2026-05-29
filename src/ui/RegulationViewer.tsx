import { ArticleBody } from "./ArticleBody";
import { Toc } from "./Toc";
import { CitationsPanel } from "./CitationsPanel";
import { RegulationActions } from "./RegulationActions";
import { IdentifierPanel } from "./IdentifierPanel";

interface ViewerProps {
  title: string;
  bwbId: string;
  eliUri: string;
  type: string;
  ministry: string | null;
  validFrom: string;
  validTo: string;
  articles: Array<{ number: string; anchorId: string; heading: string | null; bodyText: string }>;
  outbound: Array<{ toBwbId: string; toArticle: string; kind: string }>;
  inbound: Array<{ toBwbId: string; toArticle: string; kind: string }>;
}

function TypePill({ type }: { type: string }) {
  const humanMap: Record<string, string> = {
    wet: "Wet", AMvB: "AMvB", MinR: "Min.R.", beleidsregel: "Beleidsregel",
    circulaire: "Circulaire", ZBO: "ZBO", KB: "KB", reglement: "Reglement",
  };
  return (
    <span className="inline-block text-xs font-medium px-2 py-0.5 bg-rijks-tint text-rijks-blue border border-rijks-blue/20 rounded-sm">
      {humanMap[type] ?? type}
    </span>
  );
}

export function RegulationViewer(p: ViewerProps) {
  const isGeldend = p.validTo === "9999-12-31";
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[13rem_1fr_13rem] gap-6">
      {/* Left TOC */}
      <aside className="hidden lg:block lg:sticky lg:top-4 lg:self-start max-h-[calc(100vh-6rem)] overflow-y-auto">
        <Toc items={p.articles} />
      </aside>

      {/* Main content */}
      <article className="wetgeving min-w-0">
        {/* Page title block — plain, no gradient */}
        <div className="row--page-opener mb-6 pb-4 border-b-2 border-rijks-blue">
          <h1
            className="text-2xl font-bold text-rijks-blue leading-tight mb-3"
            style={{ viewTransitionName: `title-${p.bwbId}` }}
          >
            {p.title}
          </h1>

          {/* Metadata definition list */}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-rijks-text-subdued font-medium">BWB-id</dt>
            <dd className="font-mono text-rijks-text-muted">{p.bwbId}</dd>

            <dt className="text-rijks-text-subdued font-medium">Type</dt>
            <dd><TypePill type={p.type} /></dd>

            {p.ministry && (
              <>
                <dt className="text-rijks-text-subdued font-medium">Ministerie</dt>
                <dd className="text-rijks-text-muted">{p.ministry}</dd>
              </>
            )}

            <dt className="text-rijks-text-subdued font-medium">Geldigheid</dt>
            <dd className="flex items-center gap-2">
              <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${isGeldend ? "bg-rijks-success" : "bg-rijks-text-subdued"}`} aria-hidden="true" />
              <span className="text-rijks-text-muted">
                {isGeldend
                  ? `Geldend vanaf ${p.validFrom}`
                  : `${p.validFrom} t/m ${p.validTo}`}
              </span>
            </dd>
          </dl>

          <IdentifierPanel bwbId={p.bwbId} eliUri={p.eliUri} validFrom={p.validFrom} />
        </div>

        <RegulationActions
          title={p.title}
          bwbId={p.bwbId}
          eliUri={p.eliUri}
          validFrom={p.validFrom}
          articles={p.articles}
        />

        {/* Legal body */}
        <div className="wet-besluit">
          <div className="wettekst">
            {p.articles.map((a) => (
              <ArticleBody
                key={a.anchorId}
                article={a}
                bwbId={p.bwbId}
                eliUri={p.eliUri}
                validFrom={p.validFrom}
              />
            ))}
          </div>
        </div>
      </article>

      {/* Right citations */}
      <aside className="hidden lg:block lg:sticky lg:top-4 lg:self-start">
        <div className="bg-white border border-rijks-border p-4 text-sm">
          <CitationsPanel outbound={p.outbound} inbound={p.inbound} />
        </div>
      </aside>
    </div>
  );
}
