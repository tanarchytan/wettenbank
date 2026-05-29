"use client";

import { useState } from "react";

interface Props {
  bwbId: string;
  eliUri: string;
  validFrom: string;
}

function copy(text: string, setCopied: (v: string | null) => void): void {
  navigator.clipboard.writeText(text).then(
    () => {
      setCopied(text);
      setTimeout(() => setCopied(null), 1500);
    },
    () => window.prompt("Kopieer:", text),
  );
}

export function IdentifierPanel({ bwbId, eliUri, validFrom }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const asOf = new Date().toISOString().slice(0, 10);
  const eliAbs = typeof window === "undefined" ? eliUri : `${window.location.origin}${eliUri}/${validFrom}`;

  const ids: Array<{ label: string; value: string; href?: string }> = [
    { label: "BWB-id", value: bwbId },
    { label: "ELI", value: eliUri },
    { label: "ELI (gepinde datum)", value: `${eliUri}/${validFrom}` },
    {
      label: "JCI 1.0 (vindplaats)",
      value: `wetten.overheid.nl/1.0:c:${bwbId}&g=${validFrom}`,
    },
    {
      label: "JCI 1.3 (citatie)",
      value: `jci1.3:c:${bwbId}&z=${asOf}&g=${validFrom}`,
    },
    {
      label: "wetten.overheid.nl identifier",
      value: `https://wetten.overheid.nl/id/${bwbId}/${validFrom}/0`,
      href: `https://wetten.overheid.nl/id/${bwbId}/${validFrom}/0`,
    },
    {
      label: "LiDO (BWB-resource)",
      value: `http://linkeddata.overheid.nl/terms/bwb/id/${bwbId}`,
      href: `http://linkeddata.overheid.nl/terms/bwb/id/${bwbId}`,
    },
  ];

  return (
    <details className="no-print mt-3 text-sm border border-rijks-border bg-neutral-bg">
      <summary className="cursor-pointer select-none px-3 py-1.5 text-rijks-link hover:bg-rijks-tint/40 list-none [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="inline-block w-3 text-rijks-text-subdued">▸</span>
        Wetstechnische informatie / identifiers
      </summary>
      <dl className="grid grid-cols-[minmax(11rem,auto)_1fr] gap-x-3 gap-y-1 px-3 pb-2 pt-1">
        {ids.map((id) => (
          <Row
            key={id.label}
            label={id.label}
            value={id.value}
            {...(id.href ? { href: id.href } : {})}
            copied={copied === id.value}
            onCopy={() => copy(id.value, setCopied)}
          />
        ))}
      </dl>
      <p className="px-3 pb-2 text-xs text-rijks-text-subdued">
        Absolute ELI: <span className="font-mono break-all">{eliAbs}</span>
      </p>
    </details>
  );
}

function Row({
  label, value, href, copied, onCopy,
}: { label: string; value: string; href?: string; copied: boolean; onCopy: () => void }) {
  return (
    <>
      <dt className="text-rijks-text-subdued font-medium">{label}</dt>
      <dd className="flex items-center gap-2 min-w-0">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-rijks-link hover:underline break-all"
          >
            {value}
          </a>
        ) : (
          <span className="font-mono text-rijks-text-muted break-all">{value}</span>
        )}
        <button
          type="button"
          onClick={onCopy}
          className="text-xs text-rijks-link hover:underline cursor-pointer flex-shrink-0"
          title="Kopieer naar klembord"
        >
          {copied ? "✓" : "kopieer"}
        </button>
      </dd>
    </>
  );
}
