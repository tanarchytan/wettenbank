import type { NextConfig } from "next";

/**
 * Cache-Control headers per route-klasse — afgestemd op de Cloudflare
 * Cache Rules in `cloudflared/cache-rules.md`. Cloudflare respecteert
 * deze origin-headers wanneer Cache Reserve / Edge-cache TTL niet expliciet
 * overschreven wordt.
 *
 * Strategie:
 *  - Statische assets             → immutable, 1 jaar (filename bevat hash)
 *  - HTML viewer ELI-pagina        → s-maxage 86400 + SWR 7 dagen + tag-purge
 *  - Doc-pagina's (over/help/…)    → s-maxage 86400, lang-stale-OK
 *  - Zoek- en API-routes          → no-cache (query-string varieert + privacy)
 *  - Cron-getrigggerde delta-sync wijzigt regeling-content → roep de
 *    purge-by-tag API aan (zie cloudflared/purge-by-tag.sh) zodra een
 *    nieuwe state binnenkomt.
 */
const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,

  async headers() {
    // Security headers gelden op alle non-API routes. CSP toestaat alleen
    // self-served scripts/styles; 'unsafe-inline' op style-src omdat Next/React
    // inline style-attributes gebruikt (view transitions, dynamic className).
    const SECURITY_HEADERS = [
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Content-Security-Policy", value:
        "default-src 'self'; " +
        "img-src 'self' data:; " +
        "style-src 'self' 'unsafe-inline'; " +
        "script-src 'self'; " +
        "frame-ancestors 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self'"
      },
    ];

    return [
      // Globale security headers op alles
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
      // Statische build-output: hash in pad → immutable
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      // Tailwind CSS bundle
      {
        source: "/styles.css",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" },
        ],
      },
      // Doc-pagina's — quasi-statisch
      {
        source: "/(over|help|contact|privacy|toegankelijkheid|hergebruik)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800" },
        ],
      },
      // ELI-viewer (regelingen + states) — cacheable. Invalidatie loopt nu via
      // de cache-TTL; directe per-BWB URL-purge (src/cloudflare/purge.ts) is nog
      // niet teruggewired in koop-bwb-sync.ts (zie cloudflared/cache-rules.md).
      // Geen Vary-header — we serveren geen taalvarianten en Vary fragmenteert
      // de edge-cache key zonder reden.
      {
        source: "/eli/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800" },
        ],
      },
      // Zoek- en API-routes — niet cachen (query-string variabel)
      {
        source: "/(zoeken|uitgebreid_zoeken)",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
};

export default config;
