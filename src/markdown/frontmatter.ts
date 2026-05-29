/**
 * Serialise a plain object to YAML frontmatter.
 * Handles strings, numbers, booleans, null.
 * Strings containing colons, quotes, or leading/trailing whitespace are quoted.
 */

function yamlValue(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  const s = String(v);
  // Quote if contains colon-space, double-quote, #, leading/trailing space, or looks like special YAML
  const needsQuote =
    s.includes(": ") ||
    s.includes('"') ||
    s.includes("'") ||
    s.startsWith("#") ||
    s !== s.trim() ||
    s === "" ||
    /^(true|false|null|~|\d)/.test(s) ||
    s.includes("\n");
  if (needsQuote) {
    // Use double-quoted scalar, escape backslash and double-quote
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return s;
}

export function frontmatter(obj: Record<string, unknown>): string {
  const lines = ["---"];
  for (const [k, v] of Object.entries(obj)) {
    lines.push(`${k}: ${yamlValue(v)}`);
  }
  lines.push("---", "");
  return lines.join("\n") + "\n";
}
