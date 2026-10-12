'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { ME_KEY } from '../social/session';
import { siweAdapter } from './auth';
import { gameChain } from './network';

/**
 * Sign-In with Ethereum from inside the game (the onboarding step and the off-chain windows):
 * nonce, message, wallet signature, verification, then the session is read again.
 */
export function useSignIn(): { signIn: () => Promise<void>; busy: boolean; error: string | null } {
  const client = useQueryClient();
  const { address, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(): Promise<void> {
    if (address === undefined) return;
    setBusy(true);
    setError(null);
    try {
      const nonce = await siweAdapter.getNonce();
      const message = await siweAdapter.createMessage({
        nonce,
        address,
        chainId: chainId ?? gameChain.id,
      });
      const signature = await signMessageAsync({ message });
      const ok = await siweAdapter.verify({ message, signature });
      if (!ok) throw new Error('The sign-in was not accepted. Try again.');
      await client.invalidateQueries({ queryKey: ME_KEY });
    } catch (e) {
      setError(
        e instanceof Error ? (e.message.split('\n')[0] ?? 'Sign-in failed') : 'Sign-in failed',
      );
    } finally {
      setBusy(false);
    }
  }

  return { signIn, busy, error };
}
