-- regulation: stable identity across all versions
CREATE TABLE regulation (
  bwb_id        text PRIMARY KEY,
  eli_uri       text UNIQUE NOT NULL,
  type          text NOT NULL,
  ministry      text,
  geo_scope     text NOT NULL DEFAULT 'NL',
  title         text NOT NULL,
  abbreviation  text,
  citetitle     text,
  created_at    timestamptz DEFAULT now()
);

-- regulation_state: a specific time-bound version
CREATE TABLE regulation_state (
  state_id       bigserial PRIMARY KEY,
  bwb_id         text NOT NULL REFERENCES regulation,
  valid_from     date NOT NULL,
  valid_to       date NOT NULL DEFAULT 'infinity',
  body_xml       xml NOT NULL,
  body_text      text NOT NULL,
  content_hash   bytea NOT NULL,
  title_snapshot text NOT NULL,
  tsv            tsvector GENERATED ALWAYS AS (
                   setweight(to_tsvector('dutch', coalesce(title_snapshot, '')), 'A') ||
                   setweight(to_tsvector('dutch', coalesce(body_text, '')), 'B')
                 ) STORED,
  ingested_at    timestamptz DEFAULT now(),
  UNIQUE (bwb_id, valid_from)
);

-- article: split per state for deep-linking
CREATE TABLE article (
  article_id  bigserial PRIMARY KEY,
  state_id    bigint NOT NULL REFERENCES regulation_state ON DELETE CASCADE,
  number      text NOT NULL,
  anchor_id   text NOT NULL,
  heading     text,
  body_xml    xml NOT NULL,
  body_text   text NOT NULL,
  ord         int NOT NULL,
  UNIQUE (state_id, anchor_id)
);

-- citation: directed edge between articles or regulations
CREATE TABLE citation (
  from_state_id bigint NOT NULL REFERENCES regulation_state ON DELETE CASCADE,
  from_article  text NOT NULL DEFAULT '',
  to_bwb_id     text NOT NULL,
  to_article    text NOT NULL DEFAULT '',
  kind          text NOT NULL,
  PRIMARY KEY (from_state_id, from_article, to_bwb_id, to_article, kind)
);

-- sync bookkeeping
CREATE TABLE sync_log (
  id            bigserial PRIMARY KEY,
  started_at    timestamptz NOT NULL,
  finished_at   timestamptz,
  kind          text NOT NULL,
  cursor        timestamptz,
  rows_upserted int,
  errors        jsonb
);
