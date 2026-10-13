import { formatUnits18, formatUtc } from '../lib/format';

/**
 * Player-friendly messages for MiningCore's custom errors (docs/06 4.3: oracle stale, pause,
 * network trouble). Unknown errors fall back to a generic line; nothing here blames the player.
 */
const MESSAGES: Record<string, (args: readonly unknown[]) => string> = {
  PreFillNotOpen: () => 'Drill sites open 24 hours before Genesis.',
  ZeroValue: () => 'Enter an amount first.',
  OracleStale: () =>
    'The ETH/USD price feed is late, so diesel sales are paused for now. Your rigs keep drilling.',
  OracleInvalid: () =>
    'The ETH/USD price feed returned no usable price. Diesel sales are paused for now.',
  SequencerDown: () =>
    'The chain sequencer has just restarted. Diesel sales resume within the hour.',
  TankCapExceeded: (a) =>
    `That is more diesel than your tank holds (max ${formatUnits18(big(a[0]), 1)} ℓ).`,
  NotRegistered: () => 'Fill your tank first: your first diesel purchase opens your drill site.',
  LevelTooLow: (a) => `This rig needs a level ${String(a[0])} site.`,
  NoFreePad: () => 'All pads are taken. Upgrade your site or scrap a rig first.',
  FuelLineFull: () => 'Your fuel line is at capacity. Upgrade your site or switch a rig off.',
  CostAboveMax: () => 'The price moved since you looked. Check the new price and try again.',
  InsufficientCredit: () => 'Not enough $MOHN (mined, wallet and scrap credit together).',
  NotOwned: () => 'You do not own that many of this rig.',
  TooManyUnits: () => 'That order is too large for one transaction (10,000 DP at most).',
  RefineClosed: () => 'Refining opens at Market Open, 72 hours after Genesis.',
  NotReady: (a) => `This refine is ready at ${formatUtc(Number(a[0]))}.`,
  AlreadyFinalized: () => 'This refine is already done.',
  MintWindowFull: () =>
    'The hourly mint limit is reached for now. Try again in a few minutes; nothing is lost.',
  RefineTooLarge: (a) => `One refine can move at most ${formatUnits18(big(a[0]), 0)} $MOHN.`,
  InsufficientUnrefined: (a) => `You have ${formatUnits18(big(a[0]), 2)} unrefined $MOHN.`,
  ProtocolPaused: (a) =>
    `The game is paused by the Guardian until ${formatUtc(Number(a[0]))}. Your balances are safe.`,
  CheckpointBehind: () => 'The game clock is catching up. Try again in a moment.',
};

function big(v: unknown): bigint {
  return typeof v === 'bigint' ? v : BigInt(String(v ?? 0));
}

/** Finds a decoded contract error (viem's ContractFunctionRevertedError) in an error chain. */
function revert(err: unknown): { name: string; args: readonly unknown[] } | null {
  for (
    let e: unknown = err;
    e !== null && typeof e === 'object';
    e = (e as { cause?: unknown }).cause
  ) {
    const data = (e as { data?: { errorName?: string; args?: readonly unknown[] } }).data;
    if (data?.errorName !== undefined) return { name: data.errorName, args: data.args ?? [] };
  }
  return null;
}

export function explain(err: unknown): string {
  const r = revert(err);
  if (r !== null) {
    const m = MESSAGES[r.name];
    return m === undefined ? `The game refused this (${r.name}).` : m(r.args);
  }
  const text = err instanceof Error ? err.message : String(err);
  if (/user rejected|denied/i.test(text)) return 'You cancelled the transaction in your wallet.';
  if (/insufficient funds/i.test(text))
    return 'Not enough ETH in your wallet for this and the network fee.';
  if (/fetch|network|timeout/i.test(text))
    return 'The network did not answer. Check your connection and try again.';
  return 'Something went wrong. Nothing was sent; try again.';
}
