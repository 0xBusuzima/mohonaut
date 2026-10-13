'use client';

import { useState } from 'react';
import type { GameState } from '../../../game/state';
import type { Panel } from '../../play/Hud';
import { ShiftReportNotice } from '../../play/ShiftReport';

const ADDRESS = '0x000000000000000000000000000000000000dEaD';
const E18 = 10n ** 18n;

/** ?shift=1: the shift report as a player back after eight hours would see it. */
export function ShiftPreview({ state, open }: { state: GameState; open: (p: Panel) => void }) {
  // Stored before the report reads it: the site as it was eight hours earlier.
  useState(() => {
    const p = state.player;
    if (p === null) return;
    window.localStorage.setItem(
      `mohonaut.shift.${ADDRESS.toLowerCase()}`,
      JSON.stringify({
        at: state.at - 8 * 3600,
        pending: (p.pending - 2_890n * E18).toString(),
        tank: (p.tank + 56n * E18).toString(),
        emitted: (state.network.emitted - 16_000n * E18).toString(),
      }),
    );
  });
  return <ShiftReportNotice state={state} address={ADDRESS} open={open} />;
}
