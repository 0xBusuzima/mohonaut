-- Operator panel (docs/03 §5, modules 7 and 9): announcements and the support inbox.

-- In-game banners, maintenance notices and changelog entries, shown between starts_at and
-- ends_at (Unix seconds; no end = until replaced).
CREATE TABLE announcements (
  id serial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('banner', 'maintenance', 'changelog')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  body text NOT NULL CHECK (char_length(body) <= 4000),
  starts_at bigint NOT NULL,
  ends_at bigint,
  created_by bigint NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX announcements_window ON announcements (starts_at, ends_at);

-- Support requests from the in-game form; linked to the player when signed in.
CREATE TABLE support_tickets (
  id bigserial PRIMARY KEY,
  user_id bigint REFERENCES users (id) ON DELETE SET NULL,
  wallet text,
  contact text CHECK (contact IS NULL OR char_length(contact) <= 254),
  topic text NOT NULL CHECK (topic IN ('account', 'transaction', 'bug', 'safety', 'other')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 10 AND 4000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'closed')),
  note text CHECK (note IS NULL OR char_length(note) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_tickets_queue ON support_tickets (status, created_at DESC);
CREATE INDEX support_tickets_user ON support_tickets (user_id);
