'use client';

import dynamic from 'next/dynamic';
import { useState, useSyncExternalStore } from 'react';
import { LoadingScreen, PlayShell } from './Shell';

/** The game reads the wallet and the chain in the browser only; only its frame is prerendered. */
const PlayApp = dynamic(() => import('./PlayApp').then((m) => m.PlayApp), {
  ssr: false,
  loading: () => <LoadingScreen />,
});

const E2E = (process.env['NEXT_PUBLIC_E2E_ACCOUNT'] ?? '') !== '';

/** A wallet was connected here before (wagmi's own storage): reconnect right away. */
export function knownWallet(storage: Pick<Storage, 'getItem'>): boolean {
  try {
    return storage.getItem('wagmi.recentConnectorId') !== null;
  } catch {
    return false;
  }
}

const noSubscribe = () => () => {};

/**
 * First visits get the light, prerendered welcome; the wallet code (about 300 KB) loads when
 * the player asks to connect. Returning players with a known wallet load it straight away.
 */
export function PlayLoader() {
  const known = useSyncExternalStore(
    noSubscribe,
    () => E2E || knownWallet(window.localStorage),
    () => false,
  );
  const [asked, setAsked] = useState(false);
  if (!known && !asked) return <PlayShell onConnect={() => setAsked(true)} />;
  return <PlayApp openConnect={asked} />;
}
