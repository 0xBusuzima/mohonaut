import type { ReactNode } from 'react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { isTestnet } from '../../game/network';

/**
 * The play screen's frame: testnet band, header and main column. Shared by the prerendered
 * shell (shown while the wallet code loads) and the live screen, so nothing moves on swap.
 */
export function PlayFrame({ connect, children }: { connect: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      {isTestnet && (
        <p className="bg-amber px-4 py-1.5 text-center font-stencil text-sm tracking-widest text-night uppercase">
          Testnet · Season 0 — nothing here has value
        </p>
      )}
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
        <a
          href="/"
          className="font-display text-2xl font-black tracking-wide text-orange uppercase"
        >
          Mohonaut
        </a>
        <div className="flex h-10 min-w-40 justify-end">{connect}</div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-16">
        <h1 className="sr-only">Your drill site</h1>
        {children}
      </main>
    </div>
  );
}

/** The signed-out welcome; `connect` is the wallet button (a placeholder in the shell). */
export function Welcome({ connect }: { connect: ReactNode }) {
  return (
    <Card title="Open your drill site">
      <p className="max-w-2xl">
        Connect a wallet to see your site. Your first diesel purchase opens it with a free Pilot
        Rig. You pay your own network fees, and the game never asks you to approve token spending.
      </p>
      <div className="mt-4 h-10">{connect}</div>
    </Card>
  );
}

/**
 * Prerendered, and shown until the wallet code is wanted: same layout as the signed-out screen.
 * With `onConnect` the button is live (it loads the wallet code); without it, it waits.
 */
export function PlayShell({ onConnect }: { onConnect?: () => void }) {
  const button =
    onConnect === undefined ? (
      <span
        role="status"
        className="inline-flex h-10 items-center rounded-md border border-line px-4 text-fg-muted"
      >
        Loading wallets…
      </span>
    ) : (
      <Button onClick={onConnect}>Connect wallet</Button>
    );
  return (
    <PlayFrame connect={null}>
      <Welcome connect={button} />
    </PlayFrame>
  );
}
