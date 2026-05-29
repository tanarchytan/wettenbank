import type { ReactNode } from "react";

interface Props {
  title: string;
  breadcrumb: string;
  children: ReactNode;
}

/**
 * Standaard H2 voor de tekstpagina's (/over /help /contact /privacy etc.).
 * Centraliseert de Tailwind-classes zodat de zes pagina's niet drift krijgen.
 */
export function DocH2({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-base font-semibold text-rijks-blue mt-6">{children}</h2>
  );
}

export function DocPage({ title, breadcrumb, children }: Props) {
  return (
    <div className="space-y-6">
      <nav aria-label="Kruimelpad" className="text-sm text-rijks-text-subdued">
        <p className="m-0 flex items-center gap-1">
          <span>U bent hier:</span>
          <ol className="flex items-center gap-1 list-none p-0 m-0">
            <li>{breadcrumb}</li>
          </ol>
        </p>
      </nav>

      <div className="row--page-opener pb-3 border-b-2 border-rijks-blue">
        <h1 className="text-2xl font-bold text-rijks-blue leading-tight m-0">{title}</h1>
      </div>

      <article className="max-w-prose prose-content space-y-4 text-sm leading-relaxed text-rijks-text">
        {children}
      </article>
    </div>
  );
}
