'use client';

import { useState } from 'react';
import type { GameState } from '../../../game/state';
import { MilestoneNotice } from '../../play/MilestoneNotice';

const ADDRESS = '0x000000000000000000000000000000000000dEaD';

/** ?milestone=1: Foreman Mo marks a new site level, then each rig type run for the first time. */
export function MilestonePreview({ state }: { state: GameState }) {
  // Stored before the notice reads it: the site one level lower, with only the Pilot Rig.
  useState(() => {
    const p = state.player;
    if (p === null) return;
    window.localStorage.setItem(
      `mohonaut.milestones.${ADDRESS.toLowerCase()}`,
      JSON.stringify({ level: Math.max(1, p.level - 1), types: [0] }),
    );
  });
  return <MilestoneNotice key={ADDRESS} address={ADDRESS} state={state} />;
}
