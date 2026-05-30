import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseBwbXml, type ParsedRegulation } from "./parse-bwb-xml.ts";
import { parseWti, type ParsedWti } from "./parse-wti.ts";
import { parseManifest } from "./parse-manifest.ts";

export interface LoadedState extends ParsedRegulation {
  sourceXmlPath: string;
}

/**
 * Lightweight regulation header — metadata + manifest state list (paths only, no bodies).
 * Cheap to load even for huge regulations (e.g. BWBR0018715 / 9.2 GB / 576 states).
 */
export interface RegulationHeader {
  bwbId: string;
  ministry: string | null;
  citetitle: string | null;
  abbreviation: string | null;
  manifestFirstInwerkingtreding: string | null;
  /** Hint at the regulation's type (from WTI <soort-regeling>). May differ slightly from per-state @soort. */
  type: string;
  /** Manifest state list (chronological), paths resolved. Bodies NOT loaded. */
  states: Array<{
    label: string;
    validFrom: string;
    validTo: string;
    xmlPath: string;
  }>;
  dir: string;
}

/**
 * Eager full-state loader. Kept for callers that need all bodies at once
 * (e.g. ELI resolver tests). Memory-heavy for large regulations.
 *
 * Internally: equivalent to `loadKoopRegulationHeader(dir)` + iterating
 * `streamStates` and collecting into an array.
 */
export interface LoadedRegulation {
  bwbId: string;
  ministry: string | null;
  citetitle: string | null;
  abbreviation: string | null;
  type: string;
  manifestFirstInwerkingtreding: string | null;
  states: LoadedState[];
}

function readHeader(dir: string): { header: RegulationHeader; wti: ParsedWti } {
  const manifestXml = readFileSync(join(dir, "manifest.xml"), "utf-8");
  const manifest = parseManifest(manifestXml);

  const wtiXml = readFileSync(join(dir, manifest.wtiLocation), "utf-8");
  const wti = parseWti(wtiXml);

  const bwbId = manifest.bwbId || wti.bwbId;

  const states = manifest.states
    // Skip ingetrokken expressies (item _deleted="true"): hun XML zit niet in
    // de dump en wordt door de feed niet geserveerd. Expliciet i.p.v. leunen
    // op file-absence, en consistent met de delta-sync (zie diffManifest).
    .filter((s) => s.xmlFilename && !s.deleted)
    .map((s) => ({
      label: s.label,
      validFrom: s.validFrom,
      validTo: s.validTo,
      xmlPath: join(dir, s.label, "xml", s.xmlFilename),
    }))
    .sort((a, b) => a.validFrom.localeCompare(b.validFrom));

  const header: RegulationHeader = {
    bwbId,
    ministry: wti.ministry,
    citetitle: wti.citetitle,
    abbreviation: wti.abbreviation,
    manifestFirstInwerkingtreding: manifest.firstInwerkingtreding,
    type: wti.soort ?? "wet",
    states,
    dir,
  };

  return { header, wti };
}

/**
 * Reads manifest + WTI only. Returns the header with manifest state paths.
 * Bodies are NOT loaded — call `loadOneState` per state and release between iterations.
 */
export function loadKoopRegulationHeader(dir: string): RegulationHeader {
  return readHeader(dir).header;
}

/**
 * Parse one state's XML and merge WTI metadata. Caller is responsible for
 * supplying the matching WTI (or call `loadKoopRegulationHeader` once and
 * re-parse WTI here — duplicated I/O is small).
 *
 * Throws if the state's XML is missing or unparseable. Caller decides how to handle.
 */
export function loadOneState(
  header: RegulationHeader,
  state: RegulationHeader["states"][number],
): LoadedState | null {
  let xmlContent: string;
  try {
    xmlContent = readFileSync(state.xmlPath, "utf-8");
  } catch {
    return null;
  }

  const parsed = parseBwbXml(xmlContent);

  return {
    ...parsed,
    ministry: header.ministry ?? parsed.ministry,
    abbreviation: header.abbreviation ?? parsed.abbreviation,
    citetitle: header.citetitle ?? parsed.citetitle,
    validFrom: state.validFrom,
    validTo: state.validTo,
    sourceXmlPath: state.xmlPath,
  };
}

/**
 * Streaming generator: yields one parsed state at a time. Memory stays bounded
 * to a single state's XML + parsed tree at any moment.
 *
 * Use this for huge regulations like BWBR0018715 (576 states, 9.2 GB on disk).
 */
export function* streamStates(header: RegulationHeader): Generator<LoadedState, void, undefined> {
  for (const s of header.states) {
    const loaded = loadOneState(header, s);
    if (loaded !== null) yield loaded;
  }
}

/**
 * Eager full-state loader — convenience wrapper that materialises every state.
 * Avoid for huge regulations; prefer `loadKoopRegulationHeader` + `streamStates`.
 */
export function loadKoopRegulation(dir: string): LoadedRegulation {
  const header = loadKoopRegulationHeader(dir);
  const states: LoadedState[] = [];
  for (const s of streamStates(header)) states.push(s);

  // Type derived from first loaded state's @soort, falling back to WTI's soort
  const type = states[0]?.type ?? header.type;

  return {
    bwbId: header.bwbId,
    ministry: header.ministry,
    citetitle: header.citetitle,
    abbreviation: header.abbreviation,
    type,
    manifestFirstInwerkingtreding: header.manifestFirstInwerkingtreding,
    states,
  };
}
