'use client';

import { useState } from 'react';
import type { Address } from 'viem';
import { ForemanMo } from '../../game/pixel/ForemanMo';
import type { GameState } from '../../game/state';
import { nextTip } from '../../game/tips';
import type { TipTarget } from '../../game/tips';
import { apiEnabled } from '../../social/api';
import { PxButton } from './px';

const key = (a: Address) => `mohonaut.tips.${a.toLowerCase()}`;

function load(a: Address): Set<string> {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(key(a)) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

/**
 * Foreman Mo's tips at the bottom left of the site: one at a time, the next step in the game or
 * a warning about the tank. Dismissed tips are remembered on this device.
 */
export function Guide({
  state,
  address,
  open,
}: {
  state: GameState;
  address: Address;
  open: (target: TipTarget) => void;
}) {
  const [seen, setSeen] = useState(() => load(address));
  const tip = nextTip(state, seen, apiEnabled);
  if (tip === null) return null;

  const dismiss = () => {
    const next = new Set(seen).add(tip.id);
    setSeen(next);
    try {
      window.localStorage.setItem(key(address), JSON.stringify([...next]));
    } catch {
      // Storage blocked: the tip stays dismissed until the page closes.
    }
  };

  return (
    <aside
      aria-label="Foreman Mo"
      className="px-panel pointer-events-auto fixed inset-x-3 bottom-[6.5rem] z-20 flex items-end gap-3 p-3 font-pixel md:right-auto md:bottom-24 md:left-3 md:max-w-md"
    >
      <ForemanMo scale={3} />
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-xs tracking-widest text-amber uppercase">Foreman Mo</p>
        <p role="status" className="text-base">
          {tip.text}
        </p>
        <div className="flex flex-wrap gap-2">
          {tip.action !== null && (
            <PxButton
              className="!px-3 !py-1 !text-base"
              onClick={() => {
                if (tip.action !== null) open(tip.action.target);
                dismiss();
              }}
            >
              {tip.action.label}
            </PxButton>
          )}
          <PxButton variant="light" className="!px-3 !py-1 !text-base" onClick={dismiss}>
            Got it
          </PxButton>
        </div>
      </div>
    </aside>
  );
}
