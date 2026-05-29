# Wettenbank.online

**Onafhankelijke mirror van het Nederlandse Basis Wetten Bestand (BWB).** Self-hosted achter Cloudflare, met ELI-URLs, Dutch FTS-zoeken en wetten.overheid.nl pariteit op de uitgebreid-zoeken filters.

> Geen officiële overheidsbron — voor juridisch bindende publicatie raadpleeg het Tractatenblad, Staatsblad of Staatscourant.

## Capabilities

- **Zoeken** — eenvoudig + uitgebreid (wetten.overheid.nl pariteit) met filters voor type, BES-scope, datum, rechtsgebied, overheidsthema, ministerie/ZBO/PBO, publicatie (Stb/Stcrt/Trb), kamerstuk, BWB-id en Juriconnect-ID. Dubbel datummodel (geldigheid + zicht + datumbereik).
- **Viewer** per regeling/staat met TOC, citation graph, identifier-panel (ELI / JCI 1.0 / 1.3 / wetten.nl `/id` / LiDO), TXT/RTF export, print, permalink kopiëren, ⋯-acties per artikel.
- **Coverage**: BWBR (regelingen) + BWBV (verdragen) + BWBW — ~45 k entiteiten, ~118 k staten, ~6.3 M artikelen, ~1.1 M citation-edges.
- **API**: JSON per regeling, zoek-API, health endpoint.

## Stack

- **Bun 1.x** — runtime + ingebouwde Postgres-driver (`Bun.sql`)
- **PostgreSQL 16** — Dutch FTS via tsvector + GIN/GIST-indexen
- **Next.js 16** + React 19 + Tailwind 3
- **fast-xml-parser** voor BWB-XML
- **Docker Compose** voor lokale dev + productie
- **Cloudflare** Tunnel + Cache Rules + WAF rate-limiting

## Setup

```bash
cp .env.example .env
docker compose up -d postgres
bun install
bun run migrate
```

### Initial ingest

Vraag de BWB-tarball op bij [data.overheid.nl/dataset/basis-wetten-bestand](https://data.overheid.nl/dataset/basis-wetten-bestand) en extract ergens op de host. Dan:

```bash
# Pre-resolve slug-collisions (één keer per delivery)
bun run bin/index-eli.ts --source /pad/naar/wetten

# Bulk-import alle BWB-entiteiten (BWBR + BWBV + BWBW)
bun run bulk-import --dir /pad/naar/wetten --concurrency 4
```

Throughput: ~30 regs/sec → 45 k entiteiten in ~25 min.

### Delta sync

Dagelijks via cron in de worker-container (04:00). Handmatige trigger:

```bash
docker compose --profile worker exec worker bun run bin/sync-delta.ts
```

Wijzigingen triggeren Cloudflare cache-purge per BWB-id zodra `CF_API_TOKEN` + `CF_ZONE_ID` zijn gezet.

## App draaien

```bash
docker compose up -d postgres app
curl http://localhost:3000/api/health
open http://localhost:3000/zoeken
```

## Tests

```bash
docker compose up -d postgres
bun test                      # alles
bun run test:unit             # alleen unit
bun run test:integration      # vereist postgres
```

## Pipeline

Zie de inline doc bovenaan elk pipeline-script:

| Script | Doel |
|---|---|
| `bin/koop-to-markdown.ts` | Unified transformer — KOOP XML → markdown én/of Postgres |
| `bin/bulk-import.ts` | Postgres-only ingest (sneller) |
| `bin/backfill-wti-metadata.ts` | Re-parse alleen WTI-metadata (rechtsgebied, publicatie, kamerstuk, …) zonder body-re-ingest |
| `bin/index-eli.ts` | Pre-resolve slug-collisions in `.eli-index.json` |
| `bin/sync-delta.ts` | KOOP SRU delta-feed + CF-purge |
| `bin/migrate.ts` | SQL-migraties uit `migrations/*.sql` |

## Cloudflare Tunnel

Volledig setup-script in `cloudflared/cache-rules.md`. Korte versie:

1. Cloudflare Zero Trust → **Networks → Tunnels → Create tunnel**, naam `wettenbank`
2. Cloudflared connector, kopieer token → `CF_TUNNEL_TOKEN=<token>` in `.env`
3. Public Hostname: `wettenbank.online → http://app:3000`
4. `docker compose --profile tunnel up -d cloudflared`
5. Configureer Cache Rules + WAF rate-limit zoals beschreven in `cloudflared/cache-rules.md`

## Security & privacy

- Geen cookies, geen tracking, geen analytics
- Strict CSP + HSTS + X-Frame-Options DENY + X-Content-Type-Options + Referrer-Policy
- Server-side HTML-escaping op alle BWB-content vóór `ts_headline` (XSS-safe)
- Generieke error-messages naar UI; volledige trace alleen in server-log
- WAF rate-limit op zoek/API-endpoints

## Licentie

[MIT](./LICENSE) — © 2026 David Gillot.

Vrij te gebruiken, kopiëren, wijzigen en distribueren mits de copyright notice behouden blijft.

**Brongegevens** (BWB-XML, geparseerde regelingen, gegenereerde markdown) vallen onder [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/deed.nl) — publiek domein conform Auteurswet artikel 11.

## Bijdragen

Bugs en feature-voorstellen via [GitHub Issues](https://github.com/tanarchytan/wettenbank/issues). E-mail: [David@Gillot.EU](mailto:David@Gillot.EU).
