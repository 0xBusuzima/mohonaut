'use client';

import dynamic from 'next/dynamic';

/** The game reads the wallet and the chain in the browser only; nothing is prerendered. */
const PlayApp = dynamic(() => import('./PlayApp').then((m) => m.PlayApp), {
  ssr: false,
  loading: () => (
    <p role="status" className="p-8 text-fg-muted">
      Loading the drill site…
    </p>
  ),
});

export function PlayLoader() {
  return <PlayApp />;
}
