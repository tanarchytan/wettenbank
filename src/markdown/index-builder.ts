export interface RegulationSummary {
  bwbId: string;
  title: string;
  type: string;
  year: string;
  slug: string;
  stateCount: number;
  ministry: string | null;
  abbreviation: string | null;
}

const TODAY = new Date().toISOString().slice(0, 10);

/**
 * Produce the per-type INDEX.md, grouping regulations by year.
 */
export function typeIndexMarkdown(
  type: string,
  summaries: RegulationSummary[],
): string {
  // Group by year
  const byYear = new Map<string, RegulationSummary[]>();
  for (const s of summaries) {
    const list = byYear.get(s.year) ?? [];
    list.push(s);
    byYear.set(s.year, list);
  }

  // Sort years descending
  const years = [...byYear.keys()].sort((a, b) => b.localeCompare(a));

  const lines: string[] = [
    `# ${capitalize(type)}`,
    "",
    `ELI: \`/eli/nl/${type}/*\``,
    "",
  ];

  for (const year of years) {
    lines.push(`## ${year}`);
    lines.push("");
    const regs = byYear.get(year)!.sort((a, b) => a.title.localeCompare(b.title));
    for (const reg of regs) {
      lines.push(
        `- [${reg.bwbId} — ${reg.title}](${year}/${reg.slug}/README.md) · ${reg.stateCount} ${reg.stateCount === 1 ? "versie" : "versies"}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Produce the root INDEX.md.
 */
export function rootIndexMarkdown(
  byType: Record<string, RegulationSummary[]>,
): string {
  const totalRegs = Object.values(byType).reduce((s, a) => s + a.length, 0);
  const totalStates = Object.values(byType)
    .flat()
    .reduce((s, r) => s + r.stateCount, 0);

  const types = Object.keys(byType).sort();

  const tableHeader = ["| Type | Count | Index |", "|---|---|---|"];
  const tableRows = types.map((t) => {
    const count = byType[t]!.length;
    return `| ${capitalize(t)} | ${count.toLocaleString("nl-NL")} | [${t}/](${t}/INDEX.md) |`;
  });

  return [
    "# Wettenbank.online — ELI Index",
    "",
    `Generated: ${TODAY}`,
    "",
    `Total regulations: ${totalRegs.toLocaleString("nl-NL")}`,
    `Total states: ${totalStates.toLocaleString("nl-NL")}`,
    "",
    ...tableHeader,
    ...tableRows,
    "",
  ].join("\n");
}

/**
 * Produce a per-year INDEX.md within a type directory.
 */
export function yearIndexMarkdown(
  type: string,
  year: string,
  summaries: RegulationSummary[],
): string {
  const sorted = [...summaries].sort((a, b) => a.title.localeCompare(b.title));
  const lines: string[] = [
    `# ${capitalize(type)} — ${year}`,
    "",
    `ELI: \`/eli/nl/${type}/${year}/*\``,
    "",
  ];
  for (const reg of sorted) {
    lines.push(
      `- [${reg.bwbId} — ${reg.title}](${reg.slug}/README.md) · ${reg.stateCount} ${reg.stateCount === 1 ? "versie" : "versies"}`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

function capitalize(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}
