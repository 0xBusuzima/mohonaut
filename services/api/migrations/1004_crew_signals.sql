-- Crew signals: set phrases only, no free text (docs/01 §6.7). A crew keeps its latest few.
CREATE TABLE crew_signals (
  id bigserial PRIMARY KEY,
  crew_id bigint NOT NULL REFERENCES crews (id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  signal text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crew_signals_crew_idx ON crew_signals (crew_id, id DESC);
