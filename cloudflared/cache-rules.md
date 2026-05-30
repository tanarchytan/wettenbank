# Cloudflare Cache strategie — Wettenbank.online

Doel: edge-cache zoveel mogelijk, maar **invalideer per BWB-id zodra een
wetupdate binnenkomt** (delta-sync of full bulk-import).

## 1. Cache-Control headers (origin)

Geconfigureerd in `next.config.ts` zodat Cloudflare ze automatisch respecteert
wanneer er geen overschrijvende Cache Rule actief is:

| Route-klasse | Cache-Control | Reden |
|---|---|---|
| `/_next/static/*` | `public, max-age=31536000, immutable` | Hash in pad — never stale |
| `/styles.css` | `public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800` | Tailwind bundle wijzigt zelden |
| `/over`, `/help`, `/contact`, `/privacy`, `/toegankelijkheid`, `/hergebruik` | `public, s-maxage=86400, SWR=7d` | Doc-pagina's, near-static |
| `/eli/*` | `public, s-maxage=86400, SWR=7d` | Regelingsweergave — **purge per BWB-id bij wetupdate** |
| `/zoeken`, `/uitgebreid_zoeken` | `private, no-store` | Query-string varieert; resultaten kunnen niet zinvol gecachet worden |
| `/api/*` | `private, no-store` | Dynamische data + privacy |

## 2. Cloudflare Dashboard — Cache Rules

Te configureren in **Caching → Cache Rules** (vervangt de oude Page Rules).
De Ruleset Engine velden gebruiken `URI Path` (niet "URL Path"); operators
`is in`, `starts with`, `matches` (matches = regex).

### Rule 1: Cache HTML for ELI viewer

```
Field: URI Path · Operator: starts with · Value: /eli/
↓
Cache eligibility: Eligible for cache
Edge TTL: Use cache-control header if present   ← honoreer origin SWR=7d
Browser TTL: 5 minutes
Cache by query string: Ignore all
```

### Rule 2: Cache doc pages

```
Field: URI Path · Operator: is in · Value:
  /over, /help, /contact, /privacy, /toegankelijkheid, /hergebruik
↓
Cache eligibility: Eligible for cache
Edge TTL: Use cache-control header if present
Browser TTL: 5 minutes
```

### Rule 3: Bypass cache for search + API

```
Field: URI Path · Operator: is in · Value: /zoeken, /uitgebreid_zoeken
  OR
Field: URI Path · Operator: starts with · Value: /api/
↓
Cache eligibility: Bypass cache
```

### Rule 4: Long-lived static assets

```
Field: URI Path · Operator: starts with · Value: /_next/static/
  OR
Field: URI Path · Operator: matches · Value: ^/styles\.css$
↓
Cache eligibility: Eligible for cache
Edge TTL: Use cache-control header if present   (honoreer max-age=31536000)
Browser TTL: 1 year
```

## 3. Compression + protocol settings

**Speed → Optimization**:
- Brotli: ON
- Early Hints: ON
- HTTP/3 (QUIC): ON
- 0-RTT Connection Resumption: ON

**SSL/TLS → Edge Certificates**:
- TLS 1.3: ON
- Automatic HTTPS Rewrites: ON
- Always Use HTTPS: ON

## 4. Cache invalidatie bij wetupdate

De purge-helper staat in `src/cloudflare/purge.ts` (`purgeRegulations()`): een
URL-purge voor de getroffen BWB-id(s) na een UPDATE.

> **TODO / known gap:** de helper is nog NIET gewired in `bin/koop-bwb-sync.ts`.
> De oude `sync-delta.ts` riep 'm aan; bij de overstap naar de FRBR-feed is de
> purge-call nog niet teruggeplaatst. Tot dat gebeurt vervalt CF-cache via de
> normale TTL (zie Cache Rules hierboven), niet direct na een wetupdate.

### Wat gepurged wordt per BWB-id

Voor BWBR0005537 met nieuwe state op 2026-01-01:

```
https://wettenbank.online/eli/nl/wet/1994/algemene-wet-bestuursrecht
https://wettenbank.online/eli/nl/wet/1994/algemene-wet-bestuursrecht/2026-01-01
https://wettenbank.online/api/eli/nl/wet/1994/algemene-wet-bestuursrecht
```

Plus alle eerder cached datum-pinned varianten (komt uit DB via valid_from join).

### Cloudflare API setup

Environment variables (`.env`):

```
CF_API_TOKEN=<token met Zone.Cache Purge permissie>
CF_ZONE_ID=<zone-id van wettenbank.online>
PUBLIC_BASE_URL=https://wettenbank.online
```

Token aanmaken: My Profile → API Tokens → Create → Custom Token →
Permissions: `Zone.Cache Purge` + `Zone.Read`. Scope: alleen de wettenbank.online zone.

Batch-grootte: **100 URLs per request** (Free/Pro/Business limit). Implementatie
batched automatisch in `src/cloudflare/purge.ts`.

## 5. WAF + rate limiting

Onder **Security → WAF → Rate limiting rules**:

```
Expression: (starts_with(http.request.uri.path, "/api/"))
         or (http.request.uri.path eq "/zoeken")
         or (http.request.uri.path eq "/uitgebreid_zoeken")

Threshold: 30 requests per 1 minute (per IP)
Action: Managed Challenge
```

Voorkomt scrapers die de zoek-API hameren. `managed_challenge` is de CF-aanbevolen
opvolger van het oude `challenge` action.

## 6. Observability

**Analytics → Cache Analytics** geeft hit-ratio per pad-pattern. Doel: 85%+
hit-ratio op `/eli/*` na warmup. Lager → check of de purge-frequency te hoog is.
