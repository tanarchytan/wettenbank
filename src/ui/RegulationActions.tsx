"use client";

import { useState } from "react";

interface Props {
  title: string;
  bwbId: string;
  eliUri: string;
  validFrom: string;
  articles: Array<{ number: string; heading: string | null; bodyText: string }>;
}

function buildJci(bwbId: string, validFrom: string, asOf: string, artikel?: string): string {
  const base = `jci1.3:c:${bwbId}&z=${asOf}&g=${validFrom}`;
  return artikel ? `${base}&artikel=${artikel}` : base;
}

function buildLidoUrl(jci: string): string {
  return `https://linkeddata.overheid.nl/front/portal/spiegel-lijstweergave?juriconnect=${encodeURIComponent(jci)}`;
}

function textForRegulation(p: Props): string {
  const lines = [p.title, "", `BWB-id: ${p.bwbId}`, `Geldend van: ${p.validFrom}`, ""];
  for (const a of p.articles) {
    lines.push(`Artikel ${a.number}${a.heading ? ` — ${a.heading}` : ""}`);
    lines.push(a.bodyText.trim());
    lines.push("");
  }
  return lines.join("\n");
}

function rtfEscape(s: string): string {
  // Escape RTF metacharacters; encode non-ASCII as \uNNNN? (RTF unicode form).
  return s
    .replace(/\\/g, "\\\\")
    .replace(/[{}]/g, (m) => `\\${m}`)
    .replace(/[-￿]/g, (c) => `\\u${c.charCodeAt(0)}?`);
}

function toRtf(text: string): string {
  const escaped = rtfEscape(text);
  const body = escaped.split("\n").map((l) => l + "\\par").join("\n");
  return `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Calibri;}}\\f0\\fs22\n${body}\n}`;
}

function downloadBlob(filename: string, mime: string, content: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function RegulationActions(props: Props) {
  const [copied, setCopied] = useState(false);
  const asOf = new Date().toISOString().slice(0, 10);
  const jci = buildJci(props.bwbId, props.validFrom, asOf);
  const lidoUrl = buildLidoUrl(jci);
  const permalink = `${props.eliUri}/${props.validFrom}`;
  const slug = props.eliUri.split("/").pop() || props.bwbId;

  async function copyPermalink() {
    try {
      const abs = `${window.location.origin}${permalink}`;
      await navigator.clipboard.writeText(abs);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Kopieer deze link:", `${window.location.origin}${permalink}`);
    }
  }

  function downloadTxt() {
    downloadBlob(`${slug}-${props.validFrom}.txt`, "text/plain;charset=utf-8", textForRegulation(props));
  }
  function downloadRtf() {
    downloadBlob(`${slug}-${props.validFrom}.rtf`, "application/rtf", toRtf(textForRegulation(props)));
  }

  return (
    <div className="no-print flex flex-wrap items-center gap-1.5 text-sm border border-rijks-border bg-neutral-bg px-3 py-2 mb-4">
      <ActionButton onClick={() => window.print()} icon="🖨" label="Afdrukken" />
      <ActionButton onClick={downloadTxt} icon="📄" label="TXT" />
      <ActionButton onClick={downloadRtf} icon="📃" label="RTF" />
      <ActionButton onClick={copyPermalink} icon="🔗" label={copied ? "Gekopieerd!" : "Permanente link"} />
      <a
        href={lidoUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 px-2 py-1 text-rijks-link hover:underline hover:bg-rijks-tint/40"
      >
        <span aria-hidden="true">🔍</span>
        Relaties (LiDO)
      </a>
    </div>
  );
}

function ActionButton({ onClick, icon, label }: { onClick: () => void; icon: string; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 px-2 py-1 text-rijks-link hover:underline hover:bg-rijks-tint/40 cursor-pointer"
    >
      <span aria-hidden="true">{icon}</span>
      {label}
    </button>
  );
}
