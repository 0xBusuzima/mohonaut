'use client';

import { KOLA_LINE_M, MOHO_LINE_M, STRATA, stratumAt } from '@mohonaut/sdk';
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Address } from 'viem';
import { stratumPost, xIntentUrl } from '../../social/share';
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
export function StratumNotice({
  depthMm,
  address,
  children,
}: {
  depthMm: bigint;
  /** The player's wallet, for the share link (their invite link). */
  address?: Address;
  /** Shown when there is no crossing to announce (the next notice in line). */
  children?: ReactNode;
}) {
  const { current } = stratumAt(depthMm);
  const index = STRATA.findIndex((s) => s.numeral === current.numeral);
  // A first visit only notes where the bore is: crossings from here on are announced.
  const [seen, setSeen] = useState(() => {
    const stored = seenIndex();
    if (stored !== null) return stored;
    remember(index);
    return index;
  });
  if (index <= seen) return <>{children}</>;
  // A line crossed since this device last looked, even if a stratum went by unseen.
  const crossed = (m: number) => STRATA.slice(seen + 1, index + 1).some((st) => st.fromM === m);
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
          {crossed(KOLA_LINE_M) && (
            <p className="mt-2 text-cyan">
              Past the Kola Line: as deep as the deepest hole people have ever drilled.
            </p>
          )}
          {crossed(MOHO_LINE_M) && (
            <p className="mt-2 text-cyan">
              Past the Moho Line, where the crust ends and the mantle begins.
            </p>
          )}
        </div>
      </div>
      <div
        aria-hidden="true"
        className="mt-4 h-4 border-[3px] border-[#0b0d10]"
        style={{ background: current.colour }}
      />
      <div className="mt-5 flex flex-wrap gap-3">
        <PxButton className="grow" onClick={close}>
          Back to work
        </PxButton>
        {address !== undefined && (
          <a
            href={xIntentUrl(stratumPost({ ...current, address }))}
            target="_blank"
            rel="noopener noreferrer"
            className="px-btn px-btn-dark px-4 py-2 text-lg"
          >
            Share on X
          </a>
        )}
      </div>
    </PxModal>
  );
}
