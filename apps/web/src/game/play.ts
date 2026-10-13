import { sitePads } from '@mohonaut/sdk';
import { isAddress, parseEther, zeroAddress } from 'viem';
import type { Address } from 'viem';
import { GEN1_RIGS } from '../lib/catalog';
import type { Hit } from './pixel/world';
import type { RigType } from './state';

export interface ScenePad {
  /** Rig type on this pad, or null for an empty pad. */
  typeId: number | null;
  running: boolean;
}

export const rigName = (id: number) => GEN1_RIGS[id]?.name ?? `Rig type ${id}`;

/** What the yard shows besides rigs, in words (the canvas is a picture): flag, plaques, decor. */
export function yardWords(m: {
  crewTag?: string;
  plaques?: readonly number[];
  decor?: readonly unknown[];
}): string {
  const parts: string[] = [];
  if (m.crewTag !== undefined) parts.push(`The shack flies the ${m.crewTag} crew flag.`);
  const plaques = m.plaques?.length ?? 0;
  if (plaques > 0) parts.push(`${plaques} season plaque${plaques === 1 ? '' : 's'} on its wall.`);
  const decor = m.decor?.length ?? 0;
  if (decor > 0)
    parts.push(`${decor} Core Collection piece${decor === 1 ? '' : 's'} on show by the fence.`);
  return parts.join(' ');
}

/** Parses a decimal input ("0,5" or "0.5") into wei; 0 for anything invalid. */
export function parseAmount(text: string): bigint {
  try {
    return parseEther(text.trim().replace(',', '.') || '0');
  } catch {
    return 0n;
  }
}

/** The pads to draw: owned rigs (running ones first per type), then empty pads. */
export function scenePads(
  level: number,
  rigs: Pick<RigType, 'id' | 'owned' | 'active'>[],
  tank: bigint,
): ScenePad[] {
  if (level === 0) return [];
  const list: ScenePad[] = [];
  for (const r of rigs) {
    for (let i = 0; i < r.owned; i++)
      list.push({ typeId: r.id, running: i < r.active && tank > 0n });
  }
  while (list.length < sitePads(level)) list.push({ typeId: null, running: false });
  return list;
}

/** `?ref=0x...` on an invite link; the contract ignores self-referrals and late referrers. */
export function referrerFromUrl(): Address {
  if (typeof window === 'undefined') return zeroAddress;
  const ref = new URLSearchParams(window.location.search).get('ref');
  return ref !== null && isAddress(ref) ? ref : zeroAddress;
}

/** What the pointer is over on the site, for the label above it. */
export function describeHit(hit: Hit, pads: ScenePad[]): string {
  if (hit === 'tank') return 'Diesel tank';
  if (hit === 'market') return 'Equipment market';
  if (hit === 'shack') return 'Refinery';
  if (hit === 'bore') return 'World Bore';
  const pad = pads[Number(hit.slice(4))];
  if (pad === undefined) return 'Locked pad: upgrade the site';
  if (pad.typeId === null) return 'Empty pad: buy a rig';
  return `${rigName(pad.typeId)}: ${pad.running ? 'drilling' : 'stopped'}`;
}
