import type { Address } from 'viem';
import type { Plaque } from '../game/plaques';
import { API_URL } from '../lib/site';
import { turnstileToken } from './turnstile';

/** Response shapes of services/api (GET /openapi.json is the reference). */
interface Depth {
  mm: string;
  text: string;
}
export interface Me {
  id: number;
  wallet: Address | null;
  displayName: string | null;
  roles: string[];
  crewId: number | null;
}
export interface Crew {
  id: number;
  name: string;
  tag: string;
  ranked: boolean;
  contribution: Depth;
  members: {
    wallet: Address | null;
    displayName: string | null;
    captain: boolean;
    contribution: Depth;
  }[];
  /** The latest set phrases sent to the crew, newest first; absent from an older API. */
  signals?: {
    id: number;
    signal: string;
    text: string;
    wallet: Address | null;
    displayName: string | null;
    at: string;
  }[];
}
export interface CrewRow {
  rank: number | null;
  id: number;
  name: string;
  tag: string;
  members: number;
  contribution: Depth;
}
export interface Season {
  id: number;
  name: string;
  startsAt: number;
  endsAt: number;
}
export interface ContributionRow {
  rank: number;
  address: Address;
  displayName: string | null;
  contribution: Depth;
}
export interface Find {
  id: string;
  name: string;
  setId: string;
}
export interface Collection {
  finds: { day: number; itemId: string }[];
  sets: {
    id: string;
    name: string;
    title: string;
    found: number;
    total: number;
    complete: boolean;
  }[];
}
export const NOTIFY_EVENTS = [
  'fuel-low',
  'refine-ready',
  'stratum',
  'season',
  'announcements',
] as const;
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number];
export interface Prefs {
  email: string | null;
  telegramChatId: string | null;
  events: NotifyEvent[];
}
export interface Profile {
  address: Address;
  displayName: string | null;
  registered: boolean;
  siteLevel: number;
  activeDp: string;
  fuelledUntilHour: string;
  rigs: { typeId: number; owned: string; active: string }[];
  contribution: Depth;
  crew: { id: number; name: string; tag: string } | null;
  badges: { id: string; name: string; description: string }[];
  /** Season plaques; absent from an API older than them. */
  plaques?: Plaque[];
  collection: { finds: number; completedSets: string[] };
  /** Titles from completed Core Collection sets; absent from an older API. */
  titles?: string[];
}
/** One day of rig sales: the average paid per DP (wei), null without sales. */
export interface DpPriceDay {
  day: number;
  date: string;
  perDp: string | null;
  dpSold: string;
  sales: number;
}
export interface World {
  depth: Depth;
  stratum: { numeral: string; name: string; fromM: number };
}

export interface Notice {
  id: number;
  kind: 'banner' | 'maintenance' | 'changelog';
  title: string;
  body: string;
  startsAt: number;
  endsAt: number | null;
}
export const SUPPORT_TOPICS = [
  'account',
  'transaction',
  'bug',
  'safety',
  'collab',
  'other',
] as const;
export type SupportTopic = (typeof SUPPORT_TOPICS)[number];

export interface FaucetInfo {
  enabled: boolean;
  amountWei: string | null;
  address: Address | null;
  balanceWei: string | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const apiEnabled = API_URL !== '';

/** Player-facing text for an API failure. */
export function apiMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'The game server cannot be reached. Try again shortly.';
  if (err.status === 401) return 'Sign in with your wallet first.';
  if (err.status === 429) return 'Too many tries. Wait a little and try again.';
  if (err.status === 403) return 'The bot check did not pass. Try again.';
  return err.message.charAt(0).toUpperCase() + err.message.slice(1) + '.';
}

export async function call<T>(
  method: string,
  path: string,
  opts: { body?: unknown; botCheck?: boolean; fresh?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  // The API refuses cross-site writes without a JSON content type, even when there is no body.
  if (method !== 'GET') headers['content-type'] = 'application/json';
  if (opts.botCheck === true) {
    const token = await turnstileToken();
    if (token !== null) headers['cf-turnstile-response'] = token;
  }
  const res = await fetch(`${API_URL}${path}`, {
    method,
    credentials: 'include',
    headers,
    ...(opts.fresh === true ? { cache: 'no-cache' as const } : {}),
    ...(method === 'GET' ? {} : { body: JSON.stringify(opts.body ?? {}) }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? `request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export const api = {
  me: () => call<Me>('GET', '/me'),
  setName: (displayName: string) => call<{ ok: true }>('PATCH', '/me', { body: { displayName } }),
  crew: (id: number) => call<Crew>('GET', `/crews/${id}`),
  crews: () => call<{ rows: CrewRow[] }>('GET', '/leaderboards/crews'),
  createCrew: (name: string, tag: string) =>
    call<{ id: number }>('POST', '/crews', { body: { name, tag }, botCheck: true }),
  joinCrew: (id: number) => call<{ ok: true }>('POST', `/crews/${id}/join`),
  leaveCrew: () => call<{ ok: true }>('POST', '/crews/leave'),
  signal: (signal: string) => call<{ ok: true }>('POST', '/crews/signal', { body: { signal } }),
  survey: () =>
    call<{ day: number; find: Find; isNew: boolean }>('POST', '/survey', { botCheck: true }),
  collection: () => call<Collection>('GET', '/me/collection'),
  seasons: () => call<{ seasons: Season[] }>('GET', '/seasons'),
  seasonBoard: (id: number) =>
    call<{ season: Season; rows: ContributionRow[] }>('GET', `/seasons/${id}/leaderboard`),
  contributionBoard: () =>
    call<{ rows: ContributionRow[] }>('GET', '/leaderboards/contribution?limit=50'),
  prefs: () => call<Prefs>('GET', '/me/notifications'),
  setPrefs: (p: Prefs) => call<{ ok: true }>('PUT', '/me/notifications', { body: p }),
  profile: (address: Address) => call<Profile>('GET', `/profiles/${address}`),
  world: () => call<World>('GET', '/world'),
  /** `fresh`: the chart refreshes every 30 s while the market is open. */
  marketPrices: () => call<{ days: DpPriceDay[] }>('GET', '/market/prices', { fresh: true }),
  cardUrl: (address: Address) => `${API_URL}/cards/${address}`,
  /** `fresh` skips the browser cache (the API allows 60 s): a new notice shows on next load. */
  faucetInfo: () => call<FaucetInfo>('GET', '/faucet', { fresh: true }),
  faucet: (address: Address) =>
    call<{ txHash: string; amountWei: string }>('POST', '/faucet', {
      body: { address },
      botCheck: true,
    }),
  announcements: (fresh = false) =>
    call<{ active: Notice[]; changelog: Notice[] }>('GET', '/announcements', { fresh }),
  support: (body: {
    topic: SupportTopic;
    body: string;
    contact: string | null;
    wallet: Address | null;
  }) => call<{ id: number }>('POST', '/support', { body, botCheck: true }),
};

/** SIWE verification needs the bot check too (POST /auth/siwe). */
export async function siweVerify(message: string, signature: string): Promise<boolean> {
  try {
    await call('POST', '/auth/siwe', { body: { message, signature }, botCheck: true });
    return true;
  } catch {
    return false;
  }
}
