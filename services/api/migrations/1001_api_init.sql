-- API schema v1 (docs/03 §4.2, §4.4). Lives in the indexer's database; the API reads the
-- indexer's tables (accounts, hours, economy_daily, ...) and owns these.

-- Our own user table, so the login provider can change without losing players.
CREATE TABLE users (
  id bigserial PRIMARY KEY,
  auth_provider text NOT NULL,
  provider_user_id text NOT NULL,
  wallet text UNIQUE,
  display_name text,
  linked_x text,
  risk_score integer NOT NULL DEFAULT 0,
  flagged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (auth_provider, provider_user_id)
);
CREATE UNIQUE INDEX users_display_name_idx ON users (lower(display_name));

-- Session tokens are random; only their SHA-256 is stored.
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- Crews: 5-25 players, social only (docs/01 §4.7). One crew per player.
CREATE TABLE crews (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  tag text NOT NULL,
  captain_user_id bigint NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX crews_name_idx ON crews (lower(name));
CREATE UNIQUE INDEX crews_tag_idx ON crews (upper(tag));

CREATE TABLE crew_members (
  user_id bigint PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  crew_id bigint NOT NULL REFERENCES crews (id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crew_members_crew_idx ON crew_members (crew_id);

-- One free Survey per player per UTC day: a cosmetic find with no economic value (docs/01 §4.9).
CREATE TABLE survey_finds (
  user_id bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  day integer NOT NULL,
  item_id text NOT NULL,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE notification_prefs (
  user_id bigint PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  email text,
  telegram_chat_id text,
  events jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seasons (~8 weeks); rankings are computed from the indexer's events.
CREATE TABLE seasons (
  id serial PRIMARY KEY,
  name text NOT NULL,
  starts_at bigint NOT NULL,
  ends_at bigint NOT NULL,
  CHECK (ends_at > starts_at)
);

-- Operator roles (admin, economist, support, moderator).
CREATE TABLE admin_roles (
  user_id bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'economist', 'support', 'moderator')),
  PRIMARY KEY (user_id, role)
);

-- Append-only audit log of operator actions: who, what, before/after, why.
CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor_user_id bigint NOT NULL,
  action text NOT NULL,
  target text NOT NULL,
  before jsonb,
  after jsonb,
  reason text NOT NULL
);

CREATE FUNCTION audit_log_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_append_only();
