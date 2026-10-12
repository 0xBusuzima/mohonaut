-- Indexer schema v1 (docs/03 §4.3). Amounts are wei (numeric(78,0)); times are Unix seconds;
-- hours and days are absolute indexes (timestamp / 3600, timestamp / 86400), as in MiningCore.

CREATE TABLE cursors (
  stream text PRIMARY KEY,
  block bigint NOT NULL
);

-- Projection state carried between batches (e.g. the reserve at the last hour boundary).
CREATE TABLE state (
  key text PRIMARY KEY,
  value text NOT NULL
);

-- Every log of the indexed contracts, kept raw so that projections can be rebuilt offline.
CREATE TABLE events (
  block_number bigint NOT NULL,
  log_index integer NOT NULL,
  tx_hash text NOT NULL,
  block_time bigint NOT NULL,
  address text NOT NULL,
  contract text NOT NULL,
  event text NOT NULL,
  topics jsonb NOT NULL,
  data text NOT NULL,
  args jsonb NOT NULL,
  PRIMARY KEY (block_number, log_index)
);
CREATE INDEX events_event_idx ON events (contract, event);

CREATE TABLE accounts (
  address text PRIMARY KEY,
  referrer text,
  registered_at bigint,
  registered_block bigint,
  site_level smallint NOT NULL DEFAULT 0,
  dp numeric(78, 0) NOT NULL DEFAULT 0,
  expiry_hour bigint NOT NULL DEFAULT 0,
  fuel_eth numeric(78, 0) NOT NULL DEFAULT 0,
  litres numeric(78, 0) NOT NULL DEFAULT 0,
  rigs_bought bigint NOT NULL DEFAULT 0,
  rigs_scrapped bigint NOT NULL DEFAULT 0,
  mohn_spent numeric(78, 0) NOT NULL DEFAULT 0,
  accrued numeric(78, 0) NOT NULL DEFAULT 0,
  refined numeric(78, 0) NOT NULL DEFAULT 0,
  minted numeric(78, 0) NOT NULL DEFAULT 0,
  referral_earned numeric(78, 0) NOT NULL DEFAULT 0,
  referrals integer NOT NULL DEFAULT 0,
  last_active_at bigint
);

-- Days on which an account acted (cohort retention).
CREATE TABLE account_days (
  account text NOT NULL,
  day integer NOT NULL,
  PRIMARY KEY (account, day)
);

CREATE TABLE rigs (
  account text NOT NULL,
  type_id integer NOT NULL,
  owned bigint NOT NULL DEFAULT 0,
  active bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (account, type_id)
);

CREATE TABLE machine_types (
  type_id integer PRIMARY KEY,
  generation smallint NOT NULL,
  dp bigint NOT NULL,
  burn numeric(78, 0) NOT NULL,
  premium_bps integer NOT NULL,
  min_level smallint NOT NULL,
  added_at bigint NOT NULL
);

-- Hourly economy. `emitted`, `reserve_end`, `active_dp_start` and `emission_rate` come from
-- MiningCore's HourClosed events; the other flows are summed by block time.
CREATE TABLE hours (
  hour bigint PRIMARY KEY,
  emitted numeric(78, 0) NOT NULL DEFAULT 0,
  reserve_end numeric(78, 0),
  active_dp_start numeric(78, 0),
  emission_rate numeric(78, 0),
  spend_burn numeric(78, 0) NOT NULL DEFAULT 0,
  fee_burn numeric(78, 0) NOT NULL DEFAULT 0,
  buyback_burn numeric(78, 0) NOT NULL DEFAULT 0,
  lp_fee_burn numeric(78, 0) NOT NULL DEFAULT 0,
  recycled numeric(78, 0) NOT NULL DEFAULT 0,
  buyback_funded_eth numeric(78, 0) NOT NULL DEFAULT 0,
  buyback_eth numeric(78, 0) NOT NULL DEFAULT 0,
  revenue_eth numeric(78, 0) NOT NULL DEFAULT 0,
  fuel_eth numeric(78, 0) NOT NULL DEFAULT 0,
  pol_eth_added numeric(78, 0) NOT NULL DEFAULT 0,
  minted numeric(78, 0) NOT NULL DEFAULT 0,
  token_burned numeric(78, 0) NOT NULL DEFAULT 0,
  refined numeric(78, 0) NOT NULL DEFAULT 0,
  refine_fee numeric(78, 0) NOT NULL DEFAULT 0,
  machine_spend numeric(78, 0) NOT NULL DEFAULT 0,
  site_spend numeric(78, 0) NOT NULL DEFAULT 0,
  dp_sold numeric(78, 0) NOT NULL DEFAULT 0,
  new_accounts integer NOT NULL DEFAULT 0
);

-- Daily economy with the docs/02 §10 metrics of the day (formulas from packages/sdk).
CREATE TABLE economy_daily (
  day integer PRIMARY KEY,
  emitted numeric(78, 0) NOT NULL,
  spend_burn numeric(78, 0) NOT NULL,
  fee_burn numeric(78, 0) NOT NULL,
  buyback_burn numeric(78, 0) NOT NULL,
  lp_fee_burn numeric(78, 0) NOT NULL,
  recycled numeric(78, 0) NOT NULL,
  buyback_funded_eth numeric(78, 0) NOT NULL,
  buyback_eth numeric(78, 0) NOT NULL,
  revenue_eth numeric(78, 0) NOT NULL,
  fuel_eth numeric(78, 0) NOT NULL,
  minted numeric(78, 0) NOT NULL,
  token_burned numeric(78, 0) NOT NULL,
  net_emission numeric(78, 0) NOT NULL,
  sink_ratio double precision,
  rcr double precision,
  p_star_eth double precision,
  reserve_end numeric(78, 0),
  new_accounts integer NOT NULL,
  active_accounts integer NOT NULL
);

-- End-of-day distribution of MOHN holdings ('mohn', protocol contracts excluded) and of active
-- drill power ('dp').
CREATE TABLE distribution_daily (
  day integer NOT NULL,
  kind text NOT NULL,
  holders integer NOT NULL,
  total numeric(78, 0) NOT NULL,
  gini double precision,
  nakamoto integer,
  top10_share double precision,
  PRIMARY KEY (day, kind)
);

CREATE TABLE balances (
  address text PRIMARY KEY,
  balance numeric(78, 0) NOT NULL DEFAULT 0
);

CREATE TABLE vrgda_sales (
  block_number bigint NOT NULL,
  log_index integer NOT NULL,
  time bigint NOT NULL,
  account text NOT NULL,
  type_id integer NOT NULL,
  qty bigint NOT NULL,
  units numeric(78, 0),
  cost numeric(78, 0) NOT NULL,
  avg_unit_price_wad numeric(78, 0),
  PRIMARY KEY (block_number, log_index)
);

CREATE TABLE vrgda_anchors (
  block_number bigint NOT NULL,
  log_index integer NOT NULL,
  time bigint NOT NULL,
  ln_anchor numeric(78, 0) NOT NULL,
  anchor_time bigint NOT NULL,
  anchor_sold numeric(78, 0) NOT NULL,
  PRIMARY KEY (block_number, log_index)
);

CREATE TABLE params (
  param smallint PRIMARY KEY,
  name text NOT NULL,
  value numeric(78, 0) NOT NULL,
  previous numeric(78, 0) NOT NULL,
  changed_at bigint NOT NULL
);

CREATE TABLE refine_requests (
  account text NOT NULL,
  request_id bigint NOT NULL,
  amount numeric(78, 0) NOT NULL,
  ready_at bigint NOT NULL,
  queued_at bigint NOT NULL,
  finalized_at bigint,
  PRIMARY KEY (account, request_id)
);

CREATE TABLE timelock_ops (
  timelock text NOT NULL,
  op_id text NOT NULL,
  op_index integer NOT NULL,
  target text NOT NULL,
  value numeric(78, 0) NOT NULL,
  data text NOT NULL,
  predecessor text NOT NULL,
  delay bigint NOT NULL,
  fn text,
  args jsonb,
  scheduled_at bigint NOT NULL,
  ready_at bigint NOT NULL,
  executed_at bigint,
  cancelled_at bigint,
  PRIMARY KEY (timelock, op_id, op_index)
);

CREATE TABLE pool_swaps (
  block_number bigint NOT NULL,
  log_index integer NOT NULL,
  time bigint NOT NULL,
  sender text NOT NULL,
  amount0 numeric(78, 0) NOT NULL,
  amount1 numeric(78, 0) NOT NULL,
  sqrt_price_x96 numeric(78, 0) NOT NULL,
  liquidity numeric(78, 0) NOT NULL,
  tick integer NOT NULL,
  fee integer NOT NULL,
  PRIMARY KEY (block_number, log_index)
);

-- Read models for the API. Ranking ties break by address so pages are stable.
CREATE VIEW leaderboard_drill_power AS
SELECT address, dp, site_level, expiry_hour
FROM accounts
WHERE registered_at IS NOT NULL AND expiry_hour * 3600 > extract(epoch FROM now())
ORDER BY dp DESC, address;

CREATE VIEW leaderboard_mined AS
SELECT address, accrued, site_level
FROM accounts
WHERE registered_at IS NOT NULL
ORDER BY accrued DESC, address;

-- Weekly join cohorts (weeks counted from the Unix epoch, i.e. starting Thursday 00:00 UTC):
-- how many accounts of each cohort acted in each later week.
CREATE VIEW cohort_weekly AS
SELECT a.registered_at / 604800 AS cohort_week,
       d.day / 7 - a.registered_at / 604800 AS weeks_after,
       count(DISTINCT a.address) AS active_accounts
FROM accounts a
JOIN account_days d ON d.account = a.address
WHERE a.registered_at IS NOT NULL
GROUP BY 1, 2;

-- Timelock operations that are scheduled and neither executed nor cancelled.
CREATE VIEW timelock_queue AS
SELECT *
FROM timelock_ops
WHERE executed_at IS NULL AND cancelled_at IS NULL
ORDER BY ready_at;
