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
import { forgetTx, pendingTx, rememberTx } from './pending';

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
      const hash = (await writeContractAsync({
        ...call,
        gas: (gas * GAS_MARGIN_PCT) / 100n,
      } as never)) as Hash;
      // From here the transaction exists: it is kept on the device until its receipt is seen,
      // so a reload or a lost connection never loses track of it (docs/09 7).
      rememberTx(address, { hash, done });
      const link = explorerLink(hash);
      let receipt;
      try {
        receipt = await client.waitForTransactionReceipt({ hash, timeout: RECEIPT_WAIT_MS });
      } catch {
        toast({ tone: 'info', title: 'Still waiting for the chain', ...link });
        return false;
      }
      forgetTx(address);
      if (receipt.status !== 'success') throw new Error('transaction reverted');
      toast({ tone: 'success', title: done, ...link });
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

/** How long an action waits for its receipt before saying it is still waiting. */
const RECEIPT_WAIT_MS = 120_000;

function explorerLink(hash: Hash): { link?: { href: string; label: string } } {
  const href = txUrl(hash);
  return href === null ? {} : { link: { href, label: 'View on the explorer' } };
}

/**
 * A transaction this device sent and never saw the receipt of (a reload, a lost connection):
 * waits for it once and says how it went.
 */
export function useResumeTx(onDone: () => void): void {
  const { address } = useAccount();
  const client = usePublicClient();
  const toast = useToast();
  useEffect(() => {
    if (address === undefined || client === undefined) return;
    const sent = pendingTx(address);
    if (sent === null) return;
    let live = true;
    client
      .waitForTransactionReceipt({ hash: sent.hash, timeout: RECEIPT_WAIT_MS })
      .then((receipt) => {
        forgetTx(address);
        if (!live) return;
        toast(
          receipt.status === 'success'
            ? { tone: 'success', title: sent.done, ...explorerLink(sent.hash) }
            : {
                tone: 'warning',
                title: 'Not done',
                body: 'The transaction reverted.',
                ...explorerLink(sent.hash),
              },
        );
        onDone();
      })
      .catch(() => {
        // Not mined yet or the RPC is down: try again on the next visit.
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per wallet and client
  }, [address, client]);
}
