/**
 * The game's state straight from the chain, for /status: one JSON-RPC batch to the public RPC,
 * no viem and none of our servers, so it still answers when they are down.
 */

/** MiningCore view selectors (test/chain-status.test.ts checks them against the signatures). */
export const SELECTORS = {
  pausedUntil: '0xda748b10',
  lastUpdate: '0xc0463711',
  marketOpened: '0x882567ca',
  marketOpenTime: '0x47c62c5b',
  quoteLitres: '0x1fc7fb0b',
} as const;

export interface ChainStatus {
  /** Unix seconds of the latest block. */
  blockTime: number;
  pausedUntil: number;
  /** The last checkpoint (hours are closed by the keeper or by any player action). */
  lastUpdate: number;
  marketOpened: boolean;
  marketOpenTime: number;
  /** The diesel price quote answers: the ETH/USD feed is fresh. */
  dieselOpen: boolean;
}

type RpcReply = { id: number; result?: unknown; error?: unknown };
type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const word = (n: bigint) => n.toString(16).padStart(64, '0');

export async function readChainStatus(
  rpc: string,
  core: string,
  fetchImpl: Fetch = fetch,
): Promise<ChainStatus> {
  const call = (id: number, data: string) => ({
    jsonrpc: '2.0',
    id,
    method: 'eth_call',
    params: [{ to: core, data }, 'latest'],
  });
  const body = [
    { jsonrpc: '2.0', id: 0, method: 'eth_getBlockByNumber', params: ['latest', false] },
    call(1, SELECTORS.pausedUntil),
    call(2, SELECTORS.lastUpdate),
    call(3, SELECTORS.marketOpened),
    call(4, SELECTORS.marketOpenTime),
    // The litres a thousandth of an ETH buys: reverts while the price feed is late.
    call(5, SELECTORS.quoteLitres + word(10n ** 15n)),
  ];
  const res = await fetchImpl(rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`RPC answered ${res.status}`);
  const replies = new Map(((await res.json()) as RpcReply[]).map((r) => [r.id, r]));
  const uint = (id: number): bigint => {
    const r = replies.get(id)?.result;
    if (typeof r !== 'string') throw new Error(`no answer to call ${id}`);
    return BigInt(r === '0x' ? '0x0' : r);
  };
  const block = replies.get(0)?.result as { timestamp?: string } | undefined;
  if (typeof block?.timestamp !== 'string') throw new Error('no latest block');
  const quote = replies.get(5)?.result;
  return {
    blockTime: Number(BigInt(block.timestamp)),
    pausedUntil: Number(uint(1)),
    lastUpdate: Number(uint(2)),
    marketOpened: uint(3) !== 0n,
    marketOpenTime: Number(uint(4)),
    dieselOpen: typeof quote === 'string' && quote !== '0x' && BigInt(quote) > 0n,
  };
}

export interface StatusRow {
  label: string;
  ok: boolean;
  text: string;
}

/** What /status says about each part, in words; `now` in Unix seconds. */
export function statusRows(s: ChainStatus, now: number, utc: (t: number) => string): StatusRow[] {
  const ago = (t: number) => {
    const m = Math.max(0, Math.round((now - t) / 60));
    return m < 1 ? 'under a minute ago' : m < 90 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
  };
  const paused = s.pausedUntil > s.blockTime;
  // An hour left open is closed by the next player action; the keeper closes them each hour.
  const checkpointLate = s.blockTime - s.lastUpdate > 2 * 3600;
  return [
    {
      label: 'Chain',
      ok: now - s.blockTime < 600,
      text: `Reachable. Latest block ${ago(s.blockTime)}.`,
    },
    {
      label: 'Player actions',
      ok: !paused,
      text: paused
        ? `Paused by the Guardian until ${utc(s.pausedUntil)}. Rigs and balances are safe; the pause ends by itself.`
        : 'Running.',
    },
    {
      label: 'Hourly checkpoint',
      ok: !checkpointLate,
      text: checkpointLate
        ? `Last one ${ago(s.lastUpdate)}: the keeper is late. The next action on the chain closes every missed hour, so nothing is lost.`
        : `Last one ${ago(s.lastUpdate)}.`,
    },
    {
      label: 'Diesel sales',
      ok: s.dieselOpen,
      text: s.dieselOpen ? 'Open.' : 'Paused: the ETH/USD price feed is late. Rigs keep drilling.',
    },
    {
      label: 'Market',
      ok: true,
      text: s.marketOpened
        ? 'Open.'
        : s.marketOpenTime > 0
          ? `Opens at Market Open, ${utc(s.marketOpenTime)}.`
          : 'Opens at Market Open.',
    },
  ];
}
