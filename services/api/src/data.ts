/** Read queries over the indexer's tables (packages/indexer schema) and the API's own tables. */
import { schema } from '@mohonaut/indexer';
import type { Database } from '@mohonaut/indexer';
import { and, asc, count, desc, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import { getAddress } from 'viem';
import type { Address } from 'viem';
import { crewMembers, crews, seasons, surveyFinds, users } from './db/schema.js';
import { KOLA_LINE_M } from '@mohonaut/sdk';

const { accounts, events, hours, machineTypes, rigs } = schema;
const WEI_PER_METRE = 1000n * 10n ** 18n;

/** Total emission accrued so far (the World Bore). */
export async function worldEmitted(database: Database): Promise<bigint> {
  const [row] = await database.db
    .select({ total: sql<string>`coalesce(sum(${hours.emitted}), 0)` })
    .from(hours);
  return BigInt(row?.total ?? 0);
}

export async function account(database: Database, address: Address) {
  const [row] = await database.db.select().from(accounts).where(eq(accounts.address, address));
  return row ?? null;
}

export async function fleet(database: Database, address: Address) {
  return database.db
    .select({
      typeId: rigs.typeId,
      owned: rigs.owned,
      active: rigs.active,
      dp: machineTypes.dp,
      burnWad: machineTypes.burn,
    })
    .from(rigs)
    .innerJoin(machineTypes, eq(machineTypes.typeId, rigs.typeId))
    .where(eq(rigs.account, address))
    .orderBy(asc(rigs.typeId));
}

/** First hour in which the cumulative emission passed the Kola Line, if it has. */
/** Whether an account ever asked for a refine (queued or fast). */
export async function hasRefined(database: Database, address: Address): Promise<boolean> {
  const [row] = await database.db
    .select({ n: count() })
    .from(schema.refineRequests)
    .where(eq(schema.refineRequests.account, address));
  return (row?.n ?? 0) > 0;
}

export async function kolaCrossingHour(database: Database): Promise<bigint | null> {
  const threshold = (BigInt(KOLA_LINE_M) * WEI_PER_METRE).toString();
  const rows = await database.query(
    `SELECT hour FROM (SELECT hour, sum(emitted) OVER (ORDER BY hour) AS cum FROM hours) h
     WHERE cum >= ${threshold} ORDER BY hour LIMIT 1`,
  );
  const hour = rows[0]?.['hour'];
  return hour === undefined || hour === null ? null : BigInt(String(hour));
}

/** Whether `address` had fuelled drill power during `hour` (its last position before then). */
export async function activeDuringHour(
  database: Database,
  address: Address,
  hour: bigint,
): Promise<boolean> {
  const [last] = await database.db
    .select({ args: events.args })
    .from(events)
    .where(
      and(
        eq(events.contract, 'MiningCore'),
        eq(events.event, 'PositionUpdated'),
        sql`${events.args}->>'account' = ${address}`,
        lte(events.blockTime, hour * 3600n),
      ),
    )
    .orderBy(desc(events.blockNumber), desc(events.logIndex))
    .limit(1);
  if (last === undefined) return false;
  const dp = BigInt(String(last.args['dp'] ?? '0'));
  const expiry = BigInt(String(last.args['expiryHour'] ?? '0'));
  return dp > 0n && expiry > hour;
}

export async function userByWallet(database: Database, address: Address) {
  const [row] = await database.db.select().from(users).where(eq(users.wallet, address));
  return row ?? null;
}

export async function crewOfUser(database: Database, userId: number) {
  const [row] = await database.db
    .select({ id: crews.id, name: crews.name, tag: crews.tag, captainUserId: crews.captainUserId })
    .from(crewMembers)
    .innerJoin(crews, eq(crews.id, crewMembers.crewId))
    .where(eq(crewMembers.userId, userId));
  return row ?? null;
}

export async function findsOf(database: Database, userId: number) {
  return database.db
    .select()
    .from(surveyFinds)
    .where(eq(surveyFinds.userId, userId))
    .orderBy(asc(surveyFinds.day));
}

/** Accrued MOHN of each wallet (the World Bore contribution), largest first. */
export async function contributionRanking(database: Database, limit: number, offset: number) {
  return database.db
    .select({
      address: accounts.address,
      accrued: accounts.accrued,
      displayName: users.displayName,
    })
    .from(accounts)
    .leftJoin(users, eq(users.wallet, accounts.address))
    .where(isNotNull(accounts.registeredAt))
    .orderBy(desc(accounts.accrued), asc(accounts.address))
    .limit(limit)
    .offset(offset);
}

/** Crews with their members' total accrual; `active` crews have at least 5 members. */
export async function crewRanking(database: Database) {
  const rows = await database.db
    .select({
      id: crews.id,
      name: crews.name,
      tag: crews.tag,
      members: count(crewMembers.userId),
      accrued: sql<string>`coalesce(sum(${accounts.accrued}), 0)`,
    })
    .from(crews)
    .innerJoin(crewMembers, eq(crewMembers.crewId, crews.id))
    .innerJoin(users, eq(users.id, crewMembers.userId))
    .leftJoin(accounts, eq(accounts.address, users.wallet))
    .groupBy(crews.id, crews.name, crews.tag);
  return rows
    .map((r) => ({ ...r, accrued: BigInt(r.accrued) }))
    .sort((a, b) => (a.accrued === b.accrued ? a.id - b.id : a.accrued > b.accrued ? -1 : 1));
}

export async function crewMembersWithAccrual(database: Database, crewId: number) {
  return database.db
    .select({
      userId: users.id,
      wallet: users.wallet,
      displayName: users.displayName,
      accrued: accounts.accrued,
      joinedAt: crewMembers.joinedAt,
    })
    .from(crewMembers)
    .innerJoin(users, eq(users.id, crewMembers.userId))
    .leftJoin(accounts, eq(accounts.address, users.wallet))
    .where(eq(crewMembers.crewId, crewId))
    .orderBy(asc(crewMembers.joinedAt), asc(users.id));
}

/**
 * Accrual inside [from, to) per wallet, from the indexer's raw Accrued events. Flagged accounts
 * take no place (they get no badges or plaques either); ties go by address, so a rank is stable.
 */
export async function seasonRanking(database: Database, from: number, to: number, limit: number) {
  const rows = await database.db
    .select({
      address: sql<string>`${events.args}->>'account'`,
      accrued: sql<string>`sum((${events.args}->>'amount')::numeric)`,
    })
    .from(events)
    .where(
      and(
        eq(events.contract, 'MiningCore'),
        eq(events.event, 'Accrued'),
        gte(events.blockTime, BigInt(from)),
        sql`${events.blockTime} < ${BigInt(to)}`,
        sql`NOT EXISTS (SELECT 1 FROM ${users} WHERE ${users.wallet} = ${events.args}->>'account' AND ${users.flagged})`,
      ),
    )
    .groupBy(sql`${events.args}->>'account'`)
    .orderBy(
      desc(sql`sum((${events.args}->>'amount')::numeric)`),
      asc(sql`lower(${events.args}->>'account')`),
    )
    .limit(limit);
  return rows.map((r) => ({ address: getAddress(r.address), accrued: BigInt(r.accrued) }));
}

/** Ranks in a season's World Bore contribution that carry a site plaque (docs/05 P-34). */
const PLAQUE_RANKS = 10;
/** An ended season's top ten is kept this long (seconds); a flag takes effect within it. */
const PLAQUE_CACHE_S = 600;
const plaqueTops = new WeakMap<Database, Map<number, { until: number; top: Address[] }>>();

/**
 * The player's season plaques: a top-10 World Bore contribution in a season that has ended
 * (`now` in Unix seconds), oldest season first. Flagged accounts get none and take no place.
 */
export async function seasonPlaques(database: Database, address: Address, now: number) {
  const ended = await database.db
    .select()
    .from(seasons)
    .where(lte(seasons.endsAt, now))
    .orderBy(asc(seasons.startsAt));
  const plaques: { season: number; name: string; rank: number }[] = [];
  // An ended season no longer changes: its top ten is read once per PLAQUE_CACHE_S, not on
  // every profile request (the ranking scans the season's events).
  let cache = plaqueTops.get(database);
  if (cache === undefined) {
    cache = new Map();
    plaqueTops.set(database, cache);
  }
  for (const s of ended) {
    let entry = cache.get(s.id);
    if (entry === undefined || entry.until <= now) {
      const rows = await seasonRanking(database, s.startsAt, s.endsAt, PLAQUE_RANKS);
      entry = { until: now + PLAQUE_CACHE_S, top: rows.map((r) => r.address) };
      cache.set(s.id, entry);
    }
    const at = entry.top.indexOf(address);
    if (at >= 0) plaques.push({ season: s.id, name: s.name, rank: at + 1 });
  }
  return plaques;
}

/** Rig sales since `fromTime` (Unix seconds): DP sold and the average price per DP (WAD). */
export async function dpSales(database: Database, fromTime: number) {
  return database.db
    .select({
      time: schema.vrgdaSales.time,
      units: schema.vrgdaSales.units,
      avgUnitPriceWad: schema.vrgdaSales.avgUnitPriceWad,
    })
    .from(schema.vrgdaSales)
    .where(gte(schema.vrgdaSales.time, BigInt(fromTime)));
}

export async function economyDays(database: Database, days: number) {
  return database.db
    .select()
    .from(schema.economyDaily)
    .orderBy(desc(schema.economyDaily.day))
    .limit(days);
}

export async function displayNames(database: Database, wallets: string[]) {
  if (wallets.length === 0) return new Map<string, string | null>();
  const rows = await database.db
    .select({ wallet: users.wallet, displayName: users.displayName })
    .from(users)
    .where(inArray(users.wallet, wallets));
  return new Map(rows.map((r) => [r.wallet ?? '', r.displayName]));
}
