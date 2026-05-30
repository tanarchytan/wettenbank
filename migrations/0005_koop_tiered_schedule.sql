-- Migratie 0005 — tiered scheduling voor KOOP-sync
--
-- Doel: na initial 45k-pass minimaliseren we request-volume door BWBs in
-- frequentie-tiers in te delen op basis van hoe vaak ze historisch wijzigen.
-- Selector: WHERE koop_next_check_at IS NULL OR koop_next_check_at <= now()
-- zorgt voor automatische throttling per tier.
--
-- IF NOT EXISTS overal zodat de migratie idempotent is (auto-migrate-on-boot).

ALTER TABLE regulation
  ADD COLUMN IF NOT EXISTS koop_next_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS koop_tier smallint;  -- 1=actief 2=regelmatig 3=stabiel 4=dormant

-- Index voor selector. GEEN partial predicate met now(): now() is STABLE,
-- niet IMMUTABLE, dus een index-predicate ermee wordt door Postgres geweigerd
-- ("functions in index predicate must be marked IMMUTABLE"). De plain NULLS
-- FIRST b-tree dekt de selector-query (ASC NULLS FIRST) prima.
CREATE INDEX IF NOT EXISTS regulation_koop_next_check_idx
  ON regulation (koop_next_check_at NULLS FIRST);

-- Migratie van bestaande state: alle NULL = volgende run claim ze
-- (al gewerkt in sync-pipeline want we sorteren ASC NULLS FIRST)
