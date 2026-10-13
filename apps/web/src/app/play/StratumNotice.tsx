'use client';

import { STRATA, stratumAt } from '@mohonaut/sdk';
import { useState } from 'react';
import { ForemanMo } from '../../game/pixel/ForemanMo';
import { PxButton, PxModal } from './px';

const KEY = 'mohonaut.stratum';

function seenIndex(): number | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}

function remember(index: number): void {
  try {
    window.localStorage.setItem(KEY, String(index));
  } catch {
    // Storage blocked: the notice may show again on the next visit.
  }
}

/**
 * When the World Bore has broken into a new stratum since this device last looked, Foreman Mo
 * says so once. The first visit only notes where the bore is.
 */
export function StratumNotice({ depthMm }: { depthMm: bigint }) {
  const { current } = stratumAt(depthMm);
  const index = STRATA.findIndex((s) => s.numeral === current.numeral);
  // A first visit only notes where the bore is: crossings from here on are announced.
  const [seen, setSeen] = useState(() => {
    const stored = seenIndex();
    if (stored !== null) return stored;
    remember(index);
    return index;
  });
  if (index <= seen) return null;
  const close = () => {
    remember(index);
    setSeen(index);
  };
  return (
    <PxModal title="New stratum" onClose={close}>
      <div className="flex items-center gap-4">
        <ForemanMo scale={3} label="Foreman Mo, lifting his hard hat" />
        <div>
          <p className="text-2xl text-amber">
            {current.numeral}: {current.name}
          </p>
          <p className="mt-2">
            The World Bore has broken through at {current.fromM.toLocaleString('en-US')} m. Every
            driller&apos;s rigs are coring {current.name} now.
          </p>
        </div>
      </div>
      <div
        aria-hidden="true"
        className="mt-4 h-4 border-[3px] border-[#0b0d10]"
        style={{ background: current.colour }}
      />
      <PxButton className="mt-5 w-full" onClick={close}>
        Back to work
      </PxButton>
    </PxModal>
  );
}
