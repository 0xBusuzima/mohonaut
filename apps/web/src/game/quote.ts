'use client';

import { miningCoreAbi } from '@mohonaut/sdk';
import { useReadContract } from 'wagmi';
import { GAME } from './network';

/** A hook giving the cost of `qty` rigs of a type, and whether it is exact. */
export type QuoteHook = (
  typeId: number,
  qty: number,
  unitPrice: bigint,
) => { total: bigint; exact: boolean };

/**
 * The MOHN cost of `qty` rigs of a type (VRGDA batch price, before scrap credit). One rig uses
 * the price already read with the game state; more ask MiningCore.quoteMachines, and until the
 * answer arrives the estimate is the unit price times the count (`exact` false).
 */
export function useRigQuote(
  typeId: number,
  qty: number,
  unitPrice: bigint,
): { total: bigint; exact: boolean } {
  const q = useReadContract({
    address: GAME.MiningCore,
    abi: miningCoreAbi,
    chainId: GAME.chainId,
    functionName: 'quoteMachines',
    args: [BigInt(typeId), qty],
    query: { enabled: qty > 1, refetchInterval: 12_000 },
  });
  if (qty <= 1) return { total: unitPrice, exact: true };
  return q.data === undefined
    ? { total: unitPrice * BigInt(qty), exact: false }
    : { total: q.data, exact: true };
}
