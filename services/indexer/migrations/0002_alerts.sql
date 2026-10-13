-- On-chain alerts (docs/03 §4.6, ADR-014): raised by the indexer from the events it already
-- reads (no extra RPC), delivered by the notifier (Telegram / webhook). An outbox: rows are never
-- deleted; one row per (block, log, rule), so re-indexing or a rebuild cannot raise one twice.
CREATE TABLE alerts (
  id bigserial PRIMARY KEY,
  block_number bigint NOT NULL,
  log_index integer NOT NULL,
  rule text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  title text NOT NULL,
  body text NOT NULL,
  tx_hash text NOT NULL,
  block_time bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  delivered_at timestamptz,
  -- Alerts older than the notifier's age limit (e.g. history on a first sync) are marked
  -- delivered with skipped = true instead of being sent.
  skipped boolean NOT NULL DEFAULT false,
  UNIQUE (block_number, log_index, rule)
);
CREATE INDEX alerts_pending_idx ON alerts (id) WHERE delivered_at IS NULL;
