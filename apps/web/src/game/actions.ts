'use client';

import { miningCoreAbi } from '@mohonaut/sdk';
import { useState } from 'react';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { useToast } from '../components/Toast';
import { cue } from './audio';
import type { Cue } from './audio';
import { explain } from './errors';
import { GAME, txUrl } from './network';

const GAS_MARGIN_PCT = 125n;

type Fn =
  | 'buyFuel'
  | 'buyMachines'
  | 'setActiveRigs'
  | 'scrapMachines'
  | 'upgradeSite'
  | 'refine'
  | 'finalizeRefine';

export interface ActionInput {
  fn: Fn;
  args: readonly unknown[];
  value?: bigint;
  /** Toast title on success, e.g. "Fuel bought". */
  done: string;
}

/** The sound each call makes when it goes through (only with sound on). */
const CUES: Record<Fn, Cue> = {
  buyFuel: 'fuel',
  buyMachines: 'buy',
  setActiveRigs: 'switch',
  scrapMachines: 'scrap',
  upgradeSite: 'upgrade',
  refine: 'refine',
  finalizeRefine: 'refine',
};

/**
 * Sends one MiningCore call: estimate first (so a revert is explained before the wallet opens),
 * then sign, wait for the receipt and refresh the state. One action at a time.
 */
export function useGameAction(onDone: () => void) {
  const { address } = useAccount();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const toast = useToast();
  const [busy, setBusy] = useState<Fn | null>(null);

  async function run({ fn, args, value, done }: ActionInput): Promise<boolean> {
    if (address === undefined || client === undefined) return false;
    setBusy(fn);
    try {
      const call = {
        address: GAME.MiningCore,
        abi: miningCoreAbi,
        functionName: fn,
        args,
        account: address,
        ...(value === undefined ? {} : { value }),
      } as const;
      // The estimate doubles as the simulation. Wallet estimates miss refund-heavy paths
      // (e.g. restarting a rig), so the gas limit carries the keeper's 25% margin.
      const gas = await client.estimateContractGas(call as never);
      const hash = await writeContractAsync({
        ...call,
        gas: (gas * GAS_MARGIN_PCT) / 100n,
      } as never);
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error('transaction reverted');
      const link = txUrl(hash);
      toast({
        tone: 'success',
        title: done,
        ...(link === null ? {} : { body: `Confirmed: ${link}` }),
      });
      cue(CUES[fn]);
      onDone();
      return true;
    } catch (err) {
      toast({ tone: 'warning', title: 'Not done', body: explain(err) });
      cue('error');
      return false;
    } finally {
      setBusy(null);
    }
  }

  return { run, busy };
}

export type Action = ReturnType<typeof useGameAction>;
