import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface EliEntry {
  type: string;
  year: string;
  slug: string;
}

export type EliIndex = Record<string, EliEntry>;

/**
 * Laad `<root>/.eli-index.json` (geproduceerd door `bin/index-eli.ts`).
 * Dit bestand resolvet slug-collisions (4 195 regelingen in 1 268 groepen
 * delen dezelfde citetitel-slug) door BWB-id suffix toe te voegen.
 *
 * Returnt `null` als het bestand niet bestaat of unparseable is — callers
 * moeten dan terugvallen op live derivation (slug=bwbId.toLowerCase()).
 */
export function loadEliIndex(sourceRoot: string): EliIndex | null {
  const indexPath = join(sourceRoot, ".eli-index.json");
  if (!existsSync(indexPath)) return null;
  try {
    return JSON.parse(readFileSync(indexPath, "utf-8")) as EliIndex;
  } catch {
    return null;
  }
}
