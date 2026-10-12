import { formatDepth, stratumAt } from '@mohonaut/sdk';
import type { Address } from 'viem';

const SITE = 'https://mohonaut.com';

/** The public profile, which doubles as the invite link (docs/05 §3.4). */
export function profileUrl(address: Address, campaign?: string): string {
  const base = `${SITE}/s/${address.toLowerCase()}`;
  return campaign === undefined
    ? base
    : `${base}?utm_source=x&utm_medium=sharecard&utm_campaign=${encodeURIComponent(campaign)}`;
}

/**
 * The prefilled contribution post (docs/05 §3.4): World Bore contribution, crew and the bore
 * itself. Never DP, rank, MOHN amounts, earnings or prices (docs/01 §4.11).
 */
export function contributionPost(input: {
  contributionMm: bigint;
  crew: string | null;
  boreMm: bigint;
  address: Address;
}): string {
  const { current } = stratumAt(input.boreMm);
  const crew = input.crew === null ? '' : ` with Crew ${input.crew}`;
  return (
    `I've cored ${formatDepth(input.contributionMm)} of the World Bore${crew}. ` +
    `The bore is at ${formatDepth(input.boreMm)}, Stratum ${current.numeral}: ${current.name}. ` +
    `Race to the Moho. ${profileUrl(input.address, 'contribution')} (my invite link)`
  );
}

/** X web intent; the player reviews and sends it themselves (docs/05 §3.4). */
export function xIntentUrl(text: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
}

/** "0x1234…abcd" for players without a display name. */
export function shortAddress(a: Address | null): string {
  return a === null ? 'Unknown' : `${a.slice(0, 6)}…${a.slice(-4)}`;
}
