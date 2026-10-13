-- The API's season tables, plaques and badge checks read one kind of event over a time range
-- (e.g. MiningCore Accrued in a season): the time column joins the kind index.
CREATE INDEX events_kind_time_idx ON events (contract, event, block_time);
DROP INDEX events_event_idx;
