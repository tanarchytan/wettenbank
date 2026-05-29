export function cacheImmutable(): string {
  return "public, max-age=31536000, immutable";
}

export function cacheLatest(): string {
  return "public, s-maxage=86400, stale-while-revalidate=604800";
}

export function cacheSearchHtml(): string {
  return "public, s-maxage=300, stale-while-revalidate=600";
}

export function cacheSearchJson(): string {
  return "public, s-maxage=60";
}

export function cacheNoStore(): string {
  return "no-store";
}
