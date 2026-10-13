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

/**
 * The shift report post (docs/05 §3.4): how much deeper the World Bore went while the player was
 * away. Never an amount of $MOHN.
 */
export function shiftPost(input: { boreMm: bigint; awayHours: number; address: Address }): string {
  return (
    `Back on shift after ${Math.max(1, Math.round(input.awayHours))} h: the World Bore went ` +
    `${formatDepth(input.boreMm)} deeper while I was away. Race to the Moho. ` +
    `${profileUrl(input.address, 'shift')} (my invite link)`
  );
}

/** A Survey find (docs/05 §3.4): what turned up, free and once a day. Never a value. */
export function findPost(input: { find: string; address: Address }): string {
  return (
    `Today's survey at my Mohonaut drill site turned up a find for my Core Collection: ` +
    `${input.find}. Free, once a day, nothing to buy. Race to the Moho. ` +
    `${profileUrl(input.address, 'survey')} (my invite link)`
  );
}

/** A stratum crossing (docs/05 §3.4): an event for everyone who drills, not a personal score. */
export function stratumPost(input: {
  numeral: string;
  name: string;
  fromM: number;
  address: Address;
}): string {
  return (
    `The World Bore has broken through into Stratum ${input.numeral}: ${input.name}, at ` +
    `${input.fromM.toLocaleString('en-US')} m. Every Mohonaut driller cored it together. ` +
    `Race to the Moho. ${profileUrl(input.address, 'stratum')} (my invite link)`
  );
}

/** The training site's post: what was built, never an amount of tokens (docs/09 §A). */
export function trainingPost(input: { level: number; rigs: number }): string {
  return (
    `I ran a test rig at the Mohonaut training site: a level ${input.level} drill site with ` +
    `${input.rigs} rig${input.rigs === 1 ? '' : 's'}, all simulated, no wallet. ` +
    'Try it: https://mohonaut.com/train/'
  );
}

/** A badge moment (docs/05 §3.4): what it marks, never a value. */
export function badgePost(input: { name: string; description: string; address: Address }): string {
  return (
    `Got the ${input.name} badge at my Mohonaut drill site: ${input.description} ` +
    `Badges are cosmetic. Race to the Moho. ${profileUrl(input.address, 'badge')} (my invite link)`
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
