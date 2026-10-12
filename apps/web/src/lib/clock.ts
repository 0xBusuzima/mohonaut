'use client';

import { useSyncExternalStore } from 'react';

/**
 * The current time (ms), updated every `intervalMs`. Null during the static prerender and the
 * first hydration pass, so server and client HTML match; components show a placeholder then.
 */
export function useNow(intervalMs = 1000): number | null {
  return useSyncExternalStore(
    (onChange) => {
      const id = setInterval(onChange, intervalMs);
      return () => clearInterval(id);
    },
    () => quantise(Date.now(), intervalMs),
    () => null,
  );
}

/** Snapshots must be stable between renders: round to the tick. */
function quantise(ms: number, step: number): number {
  return ms - (ms % step);
}
