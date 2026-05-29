-- Migratie 0004 — KOOP-sync state per regulation
--
-- Track conditional-request state per BWB-id zodat we If-Modified-Since
-- kunnen sturen en 304's kunnen herkennen. Voorkomt 95%+ van de payload-
-- transfers bij twice-daily sync.

ALTER TABLE regulation
  ADD COLUMN koop_last_checked_at   timestamptz,
  ADD COLUMN koop_manifest_modified text,
  ADD COLUMN koop_manifest_etag     text,
  ADD COLUMN koop_last_status       text,    -- 'ok' | '304' | '404' | '5xx' | 'parse-error' | 'rate-limited'
  ADD COLUMN koop_consecutive_errors int DEFAULT 0;

-- Index voor "welke BWBs zijn het langst niet gecheckt" — driver voor next-batch selection
CREATE INDEX regulation_koop_check_idx ON regulation (koop_last_checked_at NULLS FIRST);

-- Tabel voor sync-runs zodat we throughput + errors kunnen meten
CREATE TABLE koop_sync_run (
  id                bigserial PRIMARY KEY,
  started_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz,
  cursor_before     timestamptz,
  checked_count     int DEFAULT 0,
  not_modified_count int DEFAULT 0,
  updated_count     int DEFAULT 0,
  new_states_count  int DEFAULT 0,
  error_count       int DEFAULT 0,
  bytes_downloaded  bigint DEFAULT 0,
  avg_response_ms   int,
  notes             text
);

CREATE INDEX koop_sync_run_started_idx ON koop_sync_run (started_at DESC);
