/**
 * Drizzle definitions of the tables in migrations/*.sql (the SQL is the source of truth;
 * test/schema.test.ts checks that both agree). Views are queried with raw SQL.
 */
import {
  bigint,
  bigserial,
  boolean,
  doublePrecision,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

/** wei / WAD amounts: numeric(78,0) mapped to bigint. */
const wei = (name: string) => numeric(name, { precision: 78, scale: 0, mode: 'bigint' });
const int64 = (name: string) => bigint(name, { mode: 'bigint' });

export const cursors = pgTable('cursors', {
  stream: text('stream').primaryKey(),
  block: int64('block').notNull(),
});

export const state = pgTable('state', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const events = pgTable(
  'events',
  {
    blockNumber: int64('block_number').notNull(),
    logIndex: integer('log_index').notNull(),
    txHash: text('tx_hash').notNull(),
    blockTime: int64('block_time').notNull(),
    address: text('address').notNull(),
    contract: text('contract').notNull(),
    event: text('event').notNull(),
    topics: jsonb('topics').$type<string[]>().notNull(),
    data: text('data').notNull(),
    args: jsonb('args').$type<Record<string, unknown>>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.blockNumber, t.logIndex] })],
);

export const accounts = pgTable('accounts', {
  address: text('address').primaryKey(),
  referrer: text('referrer'),
  registeredAt: int64('registered_at'),
  registeredBlock: int64('registered_block'),
  siteLevel: smallint('site_level').notNull().default(0),
  dp: wei('dp').notNull().default(0n),
  expiryHour: int64('expiry_hour').notNull().default(0n),
  fuelEth: wei('fuel_eth').notNull().default(0n),
  litres: wei('litres').notNull().default(0n),
  rigsBought: int64('rigs_bought').notNull().default(0n),
  rigsScrapped: int64('rigs_scrapped').notNull().default(0n),
  mohnSpent: wei('mohn_spent').notNull().default(0n),
  accrued: wei('accrued').notNull().default(0n),
  refined: wei('refined').notNull().default(0n),
  minted: wei('minted').notNull().default(0n),
  referralEarned: wei('referral_earned').notNull().default(0n),
  referrals: integer('referrals').notNull().default(0),
  lastActiveAt: int64('last_active_at'),
});

export const accountDays = pgTable(
  'account_days',
  {
    account: text('account').notNull(),
    day: integer('day').notNull(),
  },
  (t) => [primaryKey({ columns: [t.account, t.day] })],
);

export const rigs = pgTable(
  'rigs',
  {
    account: text('account').notNull(),
    typeId: integer('type_id').notNull(),
    owned: int64('owned').notNull().default(0n),
    active: int64('active').notNull().default(0n),
  },
  (t) => [primaryKey({ columns: [t.account, t.typeId] })],
);

export const machineTypes = pgTable('machine_types', {
  typeId: integer('type_id').primaryKey(),
  generation: smallint('generation').notNull(),
  dp: int64('dp').notNull(),
  burn: wei('burn').notNull(),
  premiumBps: integer('premium_bps').notNull(),
  minLevel: smallint('min_level').notNull(),
  addedAt: int64('added_at').notNull(),
});

export const hours = pgTable('hours', {
  hour: int64('hour').primaryKey(),
  emitted: wei('emitted').notNull().default(0n),
  reserveEnd: wei('reserve_end'),
  activeDpStart: wei('active_dp_start'),
  emissionRate: wei('emission_rate'),
  spendBurn: wei('spend_burn').notNull().default(0n),
  feeBurn: wei('fee_burn').notNull().default(0n),
  buybackBurn: wei('buyback_burn').notNull().default(0n),
  lpFeeBurn: wei('lp_fee_burn').notNull().default(0n),
  recycled: wei('recycled').notNull().default(0n),
  buybackFundedEth: wei('buyback_funded_eth').notNull().default(0n),
  buybackEth: wei('buyback_eth').notNull().default(0n),
  revenueEth: wei('revenue_eth').notNull().default(0n),
  fuelEth: wei('fuel_eth').notNull().default(0n),
  polEthAdded: wei('pol_eth_added').notNull().default(0n),
  minted: wei('minted').notNull().default(0n),
  tokenBurned: wei('token_burned').notNull().default(0n),
  refined: wei('refined').notNull().default(0n),
  refineFee: wei('refine_fee').notNull().default(0n),
  machineSpend: wei('machine_spend').notNull().default(0n),
  siteSpend: wei('site_spend').notNull().default(0n),
  dpSold: wei('dp_sold').notNull().default(0n),
  newAccounts: integer('new_accounts').notNull().default(0),
});

export const economyDaily = pgTable('economy_daily', {
  day: integer('day').primaryKey(),
  emitted: wei('emitted').notNull(),
  spendBurn: wei('spend_burn').notNull(),
  feeBurn: wei('fee_burn').notNull(),
  buybackBurn: wei('buyback_burn').notNull(),
  lpFeeBurn: wei('lp_fee_burn').notNull(),
  recycled: wei('recycled').notNull(),
  buybackFundedEth: wei('buyback_funded_eth').notNull(),
  buybackEth: wei('buyback_eth').notNull(),
  revenueEth: wei('revenue_eth').notNull(),
  fuelEth: wei('fuel_eth').notNull(),
  minted: wei('minted').notNull(),
  tokenBurned: wei('token_burned').notNull(),
  netEmission: wei('net_emission').notNull(),
  sinkRatio: doublePrecision('sink_ratio'),
  rcr: doublePrecision('rcr'),
  pStarEth: doublePrecision('p_star_eth'),
  reserveEnd: wei('reserve_end'),
  newAccounts: integer('new_accounts').notNull(),
  activeAccounts: integer('active_accounts').notNull(),
});

export const distributionDaily = pgTable(
  'distribution_daily',
  {
    day: integer('day').notNull(),
    kind: text('kind').$type<'mohn' | 'dp'>().notNull(),
    holders: integer('holders').notNull(),
    total: wei('total').notNull(),
    gini: doublePrecision('gini'),
    nakamoto: integer('nakamoto'),
    top10Share: doublePrecision('top10_share'),
  },
  (t) => [primaryKey({ columns: [t.day, t.kind] })],
);

export const balances = pgTable('balances', {
  address: text('address').primaryKey(),
  balance: wei('balance').notNull().default(0n),
});

export const vrgdaSales = pgTable(
  'vrgda_sales',
  {
    blockNumber: int64('block_number').notNull(),
    logIndex: integer('log_index').notNull(),
    time: int64('time').notNull(),
    account: text('account').notNull(),
    typeId: integer('type_id').notNull(),
    qty: int64('qty').notNull(),
    units: wei('units'),
    cost: wei('cost').notNull(),
    avgUnitPriceWad: wei('avg_unit_price_wad'),
  },
  (t) => [primaryKey({ columns: [t.blockNumber, t.logIndex] })],
);

export const vrgdaAnchors = pgTable(
  'vrgda_anchors',
  {
    blockNumber: int64('block_number').notNull(),
    logIndex: integer('log_index').notNull(),
    time: int64('time').notNull(),
    lnAnchor: wei('ln_anchor').notNull(),
    anchorTime: int64('anchor_time').notNull(),
    anchorSold: wei('anchor_sold').notNull(),
  },
  (t) => [primaryKey({ columns: [t.blockNumber, t.logIndex] })],
);

export const params = pgTable('params', {
  param: smallint('param').primaryKey(),
  name: text('name').notNull(),
  value: wei('value').notNull(),
  previous: wei('previous').notNull(),
  changedAt: int64('changed_at').notNull(),
});

export const refineRequests = pgTable(
  'refine_requests',
  {
    account: text('account').notNull(),
    requestId: int64('request_id').notNull(),
    amount: wei('amount').notNull(),
    readyAt: int64('ready_at').notNull(),
    queuedAt: int64('queued_at').notNull(),
    finalizedAt: int64('finalized_at'),
  },
  (t) => [primaryKey({ columns: [t.account, t.requestId] })],
);

export const timelockOps = pgTable(
  'timelock_ops',
  {
    timelock: text('timelock').notNull(),
    opId: text('op_id').notNull(),
    opIndex: integer('op_index').notNull(),
    target: text('target').notNull(),
    value: wei('value').notNull(),
    data: text('data').notNull(),
    predecessor: text('predecessor').notNull(),
    /** From CallSalt (null: zero salt, or not seen yet). */
    salt: text('salt'),
    delay: int64('delay').notNull(),
    fn: text('fn'),
    args: jsonb('args').$type<Record<string, unknown> | unknown[]>(),
    scheduledAt: int64('scheduled_at').notNull(),
    readyAt: int64('ready_at').notNull(),
    executedAt: int64('executed_at'),
    cancelledAt: int64('cancelled_at'),
  },
  (t) => [primaryKey({ columns: [t.timelock, t.opId, t.opIndex] })],
);

export const poolSwaps = pgTable(
  'pool_swaps',
  {
    blockNumber: int64('block_number').notNull(),
    logIndex: integer('log_index').notNull(),
    time: int64('time').notNull(),
    sender: text('sender').notNull(),
    amount0: wei('amount0').notNull(),
    amount1: wei('amount1').notNull(),
    sqrtPriceX96: wei('sqrt_price_x96').notNull(),
    liquidity: wei('liquidity').notNull(),
    tick: integer('tick').notNull(),
    fee: integer('fee').notNull(),
  },
  (t) => [primaryKey({ columns: [t.blockNumber, t.logIndex] })],
);

/** Alert outbox (migrations/0002_alerts.sql). Not rebuilt: (block, log, rule) is unique. */
export const alerts = pgTable(
  'alerts',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    blockNumber: int64('block_number').notNull(),
    logIndex: integer('log_index').notNull(),
    rule: text('rule').notNull(),
    severity: text('severity').$type<'critical' | 'warning' | 'info'>().notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    txHash: text('tx_hash').notNull(),
    blockTime: int64('block_time').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    attempts: integer('attempts').notNull().default(0),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    skipped: boolean('skipped').notNull().default(false),
  },
  (t) => [unique().on(t.blockNumber, t.logIndex, t.rule)],
);

/** Tables rebuilt from the raw events (everything except cursors and events). */
export const projectionTables = [
  state,
  accounts,
  accountDays,
  rigs,
  machineTypes,
  hours,
  economyDaily,
  distributionDaily,
  balances,
  vrgdaSales,
  vrgdaAnchors,
  params,
  refineRequests,
  timelockOps,
  poolSwaps,
] as const;

export const allTables = [cursors, events, alerts, ...projectionTables] as const;
