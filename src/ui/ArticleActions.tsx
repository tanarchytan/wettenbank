"use client";

import { useState } from "react";

interface Props {
  bwbId: string;
  eliUri: string;
  validFrom: string;
  article: {
    number: string;
    anchorId: string;
    heading: string | null;
    bodyText: string;
  };
}

function buildJci(bwbId: string, validFrom: string, asOf: string, artikel: string): string {
  return `jci1.3:c:${bwbId}&z=${asOf}&g=${validFrom}&artikel=${artikel}`;
}
function buildLidoUrl(jci: string): string {
  return `https://linkeddata.overheid.nl/front/portal/spiegel-lijstweergave?juriconnect=${encodeURIComponent(jci)}`;
}

function rtfEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/[{}]/g, (m) => `\\${m}`)
    .replace(/[-￿]/g, (c) => `\\u${c.charCodeAt(0)}?`);
}
function toRtf(text: string): string {
  const body = rtfEscape(text).split("\n").map((l) => l + "\\par").join("\n");
  return `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Calibri;}}\\f0\\fs22\n${body}\n}`;
}
function articleText(p: Props): string {
  const head = `Artikel ${p.article.number}${p.article.heading ? ` — ${p.article.heading}` : ""}`;
  return `${head}\n\n${p.article.bodyText.trim()}\n`;
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

function printArticleOnly(anchorId: string): void {
  const root = document.documentElement;
  const el = document.getElementById(anchorId);
  root.classList.add("print-anchor-active");
  el?.classList.add("print-this");
  void root.offsetHeight; // force reflow before print
  window.print();
  setTimeout(() => {
    root.classList.remove("print-anchor-active");
    el?.classList.remove("print-this");
  }, 200);
}

export function ArticleActions(props: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const asOf = new Date().toISOString().slice(0, 10);
  const jci = buildJci(props.bwbId, props.validFrom, asOf, props.article.number);
  const lidoUrl = buildLidoUrl(jci);
  const permalink = `${props.eliUri}/${props.validFrom}/artikel/${props.article.number}`;
  const slug = props.eliUri.split("/").pop() || props.bwbId;
  const filenameBase = `${slug}-${props.validFrom}-artikel-${props.article.number}`;

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
    downloadBlob(`${filenameBase}.txt`, "text/plain;charset=utf-8", articleText(props));
  }
  function downloadRtf() {
    downloadBlob(`${filenameBase}.rtf`, "application/rtf", toRtf(articleText(props)));
  }

  return (
    <div className="no-print relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="text-rijks-text-subdued hover:text-rijks-link px-1.5 py-0.5 text-sm cursor-pointer"
        title="Acties voor dit artikel"
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 min-w-[14rem] bg-white border border-rijks-border shadow-md text-sm z-10"
          onMouseLeave={() => setOpen(false)}
        >
          <MenuItem onClick={() => { setOpen(false); printArticleOnly(props.article.anchorId); }} label="Afdrukken (dit artikel)" />
          <MenuItem onClick={() => { setOpen(false); downloadTxt(); }} label="TXT downloaden" />
          <MenuItem onClick={() => { setOpen(false); downloadRtf(); }} label="RTF downloaden" />
          <MenuItem onClick={() => { copyPermalink(); }} label={copied ? "Gekopieerd!" : "Permanente link kopiëren"} />
          <a
            href={lidoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block px-3 py-1.5 text-rijks-link hover:bg-rijks-tint/40"
            onClick={() => setOpen(false)}
          >
            Relaties (LiDO)
          </a>
        </div>
      )}
    </div>
  );
}

function MenuItem({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full text-left px-3 py-1.5 text-rijks-text hover:bg-rijks-tint/40 cursor-pointer"
    >
      {label}
    </button>
  );
}
