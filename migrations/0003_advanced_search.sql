-- Migratie 0003 — uitgebreid_zoeken kolommen
--
-- Voegt metadata-velden uit BWB WTI XML toe die wetten.overheid.nl's uitgebreid
-- zoeken-pagina als filter aanbiedt:
--   - rechtsgebied / overheidsdomein (WTI <rechtsgebieden> / <overheidsdomeinen>)
--   - wetsfamilie (eerste BWB-id onder WTI <wetsfamilie>)
--   - regeling_subtype (Rijkswet / RijksKB / MinR-Archief — geleid uit type + WTI hints)
--   - ondertekening / inwerkingtreding-datum + publicatie-bron/jaar/nummer
--     (uit <details> + <ontstaansbron> in WTI)
--   - kamerstuk[] (dossiernummers — staat in <ontstaansbron><bron><dossiernummer>)
--   - ministerie_code / zbo_code / pbo_code (curated lookups op eerstverantwoordelijke)
--
-- Alle nieuwe kolommen zijn nullable — bestaande rijen blijven valide tot de
-- backfill draait. IF NOT EXISTS overal zodat de migratie idempotent is
-- (veilig opnieuw te draaien bij auto-migrate-on-boot).

ALTER TABLE regulation
  ADD COLUMN IF NOT EXISTS rechtsgebied        text[]      NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS overheidsdomein     text[]      NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS wetsfamilie         text,
  ADD COLUMN IF NOT EXISTS regeling_subtype    text,
  ADD COLUMN IF NOT EXISTS ondertekening_datum date,
  ADD COLUMN IF NOT EXISTS publicatie_bron     text,
  ADD COLUMN IF NOT EXISTS publicatie_jaar     int,
  ADD COLUMN IF NOT EXISTS publicatie_nummer   text,
  ADD COLUMN IF NOT EXISTS kamerstukken        text[]      NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ministerie_code     text,
  ADD COLUMN IF NOT EXISTS zbo_code            text,
  ADD COLUMN IF NOT EXISTS pbo_code            text,
  ADD COLUMN IF NOT EXISTS juriconnect_id      text;

-- GIN-indexen voor array-filters
CREATE INDEX IF NOT EXISTS regulation_rechtsgebied_idx   ON regulation USING GIN (rechtsgebied);
CREATE INDEX IF NOT EXISTS regulation_domein_idx         ON regulation USING GIN (overheidsdomein);
CREATE INDEX IF NOT EXISTS regulation_kamerstukken_idx   ON regulation USING GIN (kamerstukken);

-- B-tree voor scalar filters die we vaak gebruiken
CREATE INDEX IF NOT EXISTS regulation_wetsfamilie_idx    ON regulation (wetsfamilie);
CREATE INDEX IF NOT EXISTS regulation_subtype_idx        ON regulation (regeling_subtype);
CREATE INDEX IF NOT EXISTS regulation_min_idx            ON regulation (ministerie_code);
CREATE INDEX IF NOT EXISTS regulation_zbo_idx            ON regulation (zbo_code);
CREATE INDEX IF NOT EXISTS regulation_pbo_idx            ON regulation (pbo_code);
CREATE INDEX IF NOT EXISTS regulation_pub_idx            ON regulation (publicatie_bron, publicatie_jaar, publicatie_nummer);
CREATE INDEX IF NOT EXISTS regulation_ondertekening_idx  ON regulation (ondertekening_datum);

-- Per-article tsvector zodat 'Zoek op artikelnummer' + 'In de tekst' samen werken.
-- (article had nog geen tsv-kolom; voor uitgebreid zoeken willen we per-onderdeel
--  matching kunnen doen i.p.v. alleen op state-niveau.)
ALTER TABLE article
  ADD COLUMN IF NOT EXISTS tsv tsvector GENERATED ALWAYS AS (
    to_tsvector('dutch', coalesce(body_text, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS article_tsv_idx        ON article USING GIN (tsv);
CREATE INDEX IF NOT EXISTS article_number_idx     ON article (number);
