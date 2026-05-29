CREATE INDEX regulation_state_tsv_idx       ON regulation_state USING GIN (tsv);
CREATE INDEX regulation_state_bwb_from_idx  ON regulation_state (bwb_id, valid_from DESC);
CREATE INDEX regulation_state_valid_idx     ON regulation_state USING GIST (daterange(valid_from, valid_to, '[)'));
CREATE INDEX article_state_ord_idx          ON article (state_id, ord);
CREATE INDEX citation_inbound_idx           ON citation (to_bwb_id, to_article);
