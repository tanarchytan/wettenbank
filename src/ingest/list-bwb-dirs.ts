import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Match een KOOP BWB-entiteit directory-naam.
 *   BWBR = regeling (Wet/AMvB/MinR/etc.)
 *   BWBV = verdrag
 *   BWBW = wijziging
 * Allemaal valide en delen identieke folder-structuur (manifest.xml + .WTI +
 * `<YYYY-MM-DD>_<rev>/xml/<bwbid>_...xml`).
 */
export const BWB_DIR_RE = /^BWB[A-Z]\d+$/i;

/**
 * Scan een KOOP-root (b.v. `./wetten`) voor BWB-mappen. Resultaat is
 * absolute paths, alfabetisch gesorteerd. Niet-BWB entries (`.7z` archieven,
 * `.eli-index.json`, etc.) worden overgeslagen.
 */
export function listBwbDirs(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    if (!BWB_DIR_RE.test(entry)) continue;
    const p = join(root, entry);
    try {
      if (statSync(p).isDirectory()) out.push(p);
    } catch { /* skip onleesbaar */ }
  }
  out.sort();
  return out;
}
