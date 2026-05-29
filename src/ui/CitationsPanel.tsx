import Link from "next/link";

interface Citation {
  toBwbId: string;
  toArticle: string;
  kind: string;
}

function CitationGroup({
  label,
  citations,
  defaultOpen = false,
}: {
  label: string;
  citations: Citation[];
  defaultOpen?: boolean;
}) {
  if (citations.length === 0) {
    return (
      <div className="text-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-rijks-blue mb-1">{label}</p>
        <p className="text-rijks-text-subdued text-xs">Geen.</p>
      </div>
    );
  }

  return (
    <details open={defaultOpen} className="text-sm group">
      <summary
        className="text-xs font-semibold uppercase tracking-wider text-rijks-blue cursor-pointer
          list-none flex items-center justify-between py-1
          hover:text-rijks-link transition-colors select-none"
        aria-label={`${label} (${citations.length})`}
      >
        <span>{label}</span>
        <span className="text-rijks-text-subdued font-normal normal-case tracking-normal text-xs">
          ({citations.length})
        </span>
      </summary>
      <ul className="mt-1.5 space-y-0.5 list-none p-0 m-0">
        {citations.map((c, i) => (
          <li key={`${c.toBwbId}-${i}`} className="text-xs">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Link
              href={`/api/eli/_bwbid/${c.toBwbId}` as any}
              className="text-rijks-link hover:underline font-mono"
              prefetch={false}
            >
              {c.toBwbId}
              {c.toArticle ? ` art. ${c.toArticle}` : ""}
            </Link>
            {c.kind && (
              <span className="text-rijks-text-subdued ml-1">({c.kind})</span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function CitationsPanel({
  outbound,
  inbound,
}: {
  outbound: Citation[];
  inbound: Citation[];
}) {
  return (
    <aside className="space-y-4">
      <CitationGroup label="Verwijzingen" citations={outbound} defaultOpen={true} />
      <hr className="border-rijks-border" />
      <CitationGroup label="Wat verwijst hiernaar" citations={inbound} defaultOpen={false} />
    </aside>
  );
}
