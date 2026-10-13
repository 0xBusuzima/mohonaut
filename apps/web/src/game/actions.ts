'use client';

import { miningCoreAbi } from '@mohonaut/sdk';
import { useEffect, useState } from 'react';
import type { Hash } from 'viem';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { useToast } from '../components/Toast';
import { cue } from './audio';
import type { Cue } from './audio';
import { explain } from './errors';
import { GAME, txUrl } from './network';
import { follow, isFollowing, pendingTx, rememberTx } from './pending';

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
    // One transaction at a time: a player who thinks a slow one failed must not pay twice.
    if (isFollowing(address)) {
      toast({
        tone: 'info',
        title: 'Your last transaction is still on its way',
        body: 'The game says so here as soon as the chain confirms it.',
      });
      return false;
    }
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
      const hash = (await writeContractAsync({
        ...call,
        gas: (gas * GAS_MARGIN_PCT) / 100n,
      } as never)) as Hash;
      // From here the transaction exists: it is kept on the device until its receipt is seen,
      // so a reload or a lost connection never loses track of it (docs/09 7).
      const sent = { hash, done };
      rememberTx(address, sent);
      const ok = await follow({ client, address, sent, toast, link: explorerLink, onDone });
      cue(ok ? CUES[fn] : 'error');
      return ok;
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

function explorerLink(hash: Hash): { href: string; label: string } | undefined {
  const href = txUrl(hash);
  return href === null ? undefined : { href, label: 'View on the explorer' };
}

/**
 * A transaction this device sent and never saw the receipt of (a reload, a lost connection):
 * follows it (once, even if the action that sent it is still following it) and says how it went.
 */
export function useResumeTx(onDone: () => void): void {
  const { address } = useAccount();
  const client = usePublicClient();
  const toast = useToast();
  useEffect(() => {
    if (address === undefined || client === undefined) return;
    const sent = pendingTx(address);
    if (sent === null) return;
    void follow({ client, address, sent, toast, link: explorerLink, onDone });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per wallet and client
  }, [address, client]);
}
