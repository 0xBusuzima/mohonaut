'use client';

import { useEffect, useRef, useState } from 'react';

/** A second press sooner than this is the same gesture (a double click or a double tap). */
const SAME_GESTURE_MS = 400;
/** An armed button disarms by itself after this long (Safari never blurs a clicked button). */
const DISARM_MS = 5_000;

/**
 * Two presses for an action that cannot be undone: the first arms `key`, a second, separate
 * press on the same key acts. `armed` names the armed key, for the button text and for a polite
 * live region ("Press again to …").
 */
export function useTwoStep(): {
  armed: string | null;
  press: (key: string, act: () => void) => void;
  disarm: () => void;
} {
  const [armed, setArmed] = useState<string | null>(null);
  const armedAt = useRef(0);
  useEffect(() => {
    if (armed === null) return undefined;
    const id = window.setTimeout(() => setArmed(null), DISARM_MS);
    return () => window.clearTimeout(id);
  }, [armed]);
  return {
    armed,
    press: (key, act) => {
      const now = Date.now();
      if (armed !== key) {
        armedAt.current = now;
        setArmed(key);
        return;
      }
      if (now - armedAt.current < SAME_GESTURE_MS) return;
      setArmed(null);
      act();
    },
    disarm: () => setArmed(null),
  };
}
