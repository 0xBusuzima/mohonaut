'use client';

import { useEffect } from 'react';
import { reportError } from '../lib/errors';
import { Button } from './Button';

/** What an error boundary shows: the game state lives on-chain, so nothing is lost. */
export function ErrorScreen({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => reportError(error), [error]);
  return (
    <div role="alert" className="mx-auto max-w-xl px-4 py-16">
      <h1 className="font-display text-4xl font-black tracking-wide uppercase">
        Something broke on this page
      </h1>
      <p className="mt-4">
        Your drill site is safe: rigs, diesel and $MOHN live on-chain, not in this page. Try again,
        or reload. If it keeps happening, tell us on X.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    </div>
  );
}
