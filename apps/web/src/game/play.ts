import { sitePads } from '@mohonaut/sdk';
import { isAddress, parseEther, zeroAddress } from 'viem';
import type { Address } from 'viem';
import { GEN1_RIGS } from '../lib/catalog';
import type { ScenePad } from './SiteScene';
import type { RigType } from './state';

export const rigName = (id: number) => GEN1_RIGS[id]?.name ?? `Rig type ${id}`;

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
