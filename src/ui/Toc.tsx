interface TocItem {
  anchorId: string;
  number: string;
  heading: string | null;
}

export function Toc({ items }: { items: TocItem[] }) {
  return (
    <nav className="text-sm" aria-label="Inhoudsopgave">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-rijks-blue mb-2 pb-2 border-b border-rijks-border">
        Inhoudsopgave
      </h3>
      <ul className="space-y-0 list-none p-0 m-0">
        {items.map((it) => (
          <li key={it.anchorId}>
            <a
              href={`#${it.anchorId}`}
              className="block text-sm text-rijks-link no-underline py-1 px-2 -mx-2
                hover:bg-rijks-tint hover:text-rijks-blue transition-colors leading-snug"
            >
              <span className="text-rijks-text-subdued text-xs mr-1.5">art.</span>
              <span className="font-medium">{it.number}</span>
              {it.heading && (
                <span className="text-rijks-text-muted font-normal"> — {it.heading}</span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
