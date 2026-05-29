-- Migratie 0005 — tiered scheduling voor KOOP-sync
--
-- Doel: na initial 45k-pass minimaliseren we request-volume door BWBs in
-- frequentie-tiers in te delen op basis van hoe vaak ze historisch wijzigen.
-- Selector: WHERE koop_next_check_at IS NULL OR koop_next_check_at <= now()
-- zorgt voor automatische throttling per tier.

ALTER TABLE regulation
  ADD COLUMN koop_next_check_at timestamptz,
  ADD COLUMN koop_tier smallint;  -- 1=actief 2=regelmatig 3=stabiel 4=dormant

-- Index voor selector
CREATE INDEX regulation_koop_next_check_idx
  ON regulation (koop_next_check_at NULLS FIRST)
  WHERE koop_next_check_at IS NULL OR koop_next_check_at <= now();

-- Migratie van bestaande state: alle NULL = volgende run claim ze
-- (al gewerkt in sync-pipeline want we sorteren ASC NULLS FIRST)
