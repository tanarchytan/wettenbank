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

### Delta sync (twice-daily, via FRBR-feed)

De primary delta-updater draait elke 12u via `bin/koop-bwb-sync.ts`. Bron is de KOOP FRBR-feed:

```
https://repository.officiele-overheidspublicaties.nl/bwb/<BWBR>/manifest.xml
```

Werkflow per BWB:
1. `GET manifest.xml` met `If-Modified-Since` header
2. **304 Not Modified** → done (95% of cases na initial pass)
3. **200 OK** → diff manifest-expressions vs DB-states, alleen missende states downloaden
4. Parse XML door bestaande `parse-bwb-xml.ts` + `upsertRegulation`

Cron in de worker-container draait om 00:00 en 12:00 dagelijks. Handmatige trigger:

```bash
docker compose --profile worker exec worker bun run bin/koop-bwb-sync.ts --concurrency 4
```

Wijzigingen triggeren Cloudflare cache-purge per BWB-id zodra `CF_API_TOKEN` + `CF_ZONE_ID` zijn gezet.

#### Tier-based scheduling

Na de initial 45 k pass valt de request-load met factor ~8 doordat BWBs in frequentie-tiers ingedeeld worden:

| Tier | Criterium | Check-interval |
|---|---|---|
| 1 (actief) | <30 dagen sinds laatste change | 12u |
| 2 (regelmatig) | 30-365 dagen | 3 dagen |
| 3 (stabiel) | 1-5 jaar | 14 dagen |
| 4 (dormant) | >5 jaar | 30 dagen |

Bij elke detected change springt een BWB terug naar tier 1 voor 14 dagen.

Resultaat per 12u run na initial pass (~5 000 due BWBs ipv 45 k):
- 95% 304s → 0 bytes
- 5% updated → ~25 MB bandbreedte
- Totaal ~7 min runtime, <30 MB transfer

### Corpus delta-sync (`bin/sync-corpus.ts`)

De markdown-corpus repo (zie wettenbank-corpus) wordt in sync gehouden via DB-audit. Eén CLI doet alles:

```bash
bun run bin/sync-corpus.ts --out ../wettenbank-corpus --since 24h --commit --push
```

Flow:
1. Query `regulation_state.ingested_at > now() - 24h` → ~50 BWBs typisch
2. Per BWB: laad alle states uit DB, render markdown via bestaande `regulation-summary.ts`
3. Schrijf state-md files + README.md (versie-tabel) naar corpus-dir
4. `git add . && git commit -m "Delta YYYY-MM-DD: N regulations / M states" && git push`

Typische run: 32 BWBs → 1823 state-files + 32 README's in ~3 min, ~5 MB I/O. **Geen** full rebuild van 154 k files.

Aanbevolen cron op host (1u buffer na `koop-bwb-sync`):

```cron
30 1,13 * * * cd /pad/naar/wettenbank && bun run bin/sync-corpus.ts --out ../wettenbank-corpus --since 24h --commit --push
```

Host-side ipv in worker-container omdat git push SSH-credentials op host gebruikt.

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
