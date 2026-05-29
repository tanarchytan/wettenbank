/**
 * ELI path helpers for wettenbank.online markdown generation.
 */

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function eliPath(type: string, year: string, slug: string): string {
  return `/eli/nl/${type}/${year}/${slug}`;
}
