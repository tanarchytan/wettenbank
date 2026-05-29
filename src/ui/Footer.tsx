const DATA_FRESHNESS = new Date().toISOString().slice(0, 10);

const FOOTER_COLS = [
  {
    heading: "Wettenbank.online",
    links: [
      { href: "/over", label: "Over Wettenbank.online" },
      { href: "/contact", label: "Contact" },
      { href: "/help", label: "Help" },
    ],
  },
  {
    heading: "Compliance",
    links: [
      { href: "/privacy", label: "Privacy en cookies" },
      { href: "/toegankelijkheid", label: "Toegankelijkheid" },
      { href: "/hergebruik", label: "Informatie hergebruiken" },
    ],
  },
  {
    heading: "Data",
    links: [
      {
        href: "https://data.overheid.nl/dataset/basis-wetten-bestand",
        label: "Basis Wetten Bestand (KOOP)",
        external: true,
      },
      { href: "/api/health", label: "API status" },
    ],
  },
  {
    heading: "Over deze dienst",
    body: "Onafhankelijke mirror van het Basis Wetten Bestand — geen officiële overheidsbron.",
  },
] as const;

export function Footer() {
  return (
    <footer className="bg-neutral-bg border-t border-rijks-border mt-12" role="contentinfo">
      <div className="container py-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-sm">
        {FOOTER_COLS.map((col) => (
          <div key={col.heading}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-rijks-blue mb-3">
              {col.heading}
            </h2>
            {"links" in col ? (
              <ul className="space-y-1.5 list-none p-0 m-0">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <a
                      href={l.href}
                      rel={"external" in l && l.external ? "external noopener" : undefined}
                      className="text-rijks-link hover:underline no-underline"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-rijks-text-subdued leading-relaxed">{col.body}</p>
            )}
          </div>
        ))}
      </div>
      {/* Compliance strip */}
      <div className="border-t border-rijks-border bg-[#e8e8e8]">
        <div className="container py-3 flex flex-col sm:flex-row justify-between gap-1.5 text-xs text-rijks-text-subdued">
          <span>Onafhankelijke mirror — geen officiële overheidsbron.</span>
          <span className="flex items-center gap-3">
            <span>© Wettenbank.online · Data: KOOP/Overheid.nl</span>
            <span className="text-rijks-border-soft" aria-hidden="true">|</span>
            <span>Gegenereerd: {DATA_FRESHNESS}</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
