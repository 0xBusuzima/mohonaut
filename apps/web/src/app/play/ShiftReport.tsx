'use client';

import { formatDepth } from '@mohonaut/sdk';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Address } from 'viem';
import { ForemanMo } from '../../game/pixel/ForemanMo';
import { shiftReport, snapshotOf } from '../../game/shift';
import type { ShiftSnapshot } from '../../game/shift';
import type { GameState } from '../../game/state';
import { formatDuration, formatLitres, formatMohn } from '../../lib/format';
import { shiftPost, xIntentUrl } from '../../social/share';
import type { Panel } from './Hud';
import { PxButton, PxModal } from './px';
import { Readout } from './windows';

const key = (address: string) => `mohonaut.shift.${address.toLowerCase()}`;

function stored(address: string): ShiftSnapshot | null {
  try {
    const raw = window.localStorage.getItem(key(address));
    return raw === null ? null : (JSON.parse(raw) as ShiftSnapshot);
  } catch {
    return null;
  }
}

function save(address: string, state: GameState): void {
  const snap = snapshotOf(state);
  if (snap === null) return;
  try {
    window.localStorage.setItem(key(address), JSON.stringify(snap));
  } catch {
    // Storage blocked: no report next time.
  }
}

/**
 * Back after an hour or more: Foreman Mo reports what the site did meanwhile, once. Otherwise
 * (and after it is closed) shows `children`. Keeps this device's snapshot of the site fresh.
 */
export function ShiftReportNotice({
  state,
  address,
  open,
  children,
}: {
  state: GameState;
  address: string;
  open: (p: Panel) => void;
  children?: ReactNode;
}) {
  const [report, setReport] = useState(() => {
    const prev = stored(address);
    return prev === null ? null : shiftReport(prev, state);
  });
  // While the report is open the old snapshot stays, so a window opened over it (or a lost
  // connection) does not lose the report; closing it saves the site as it is now.
  useEffect(() => {
    if (report === null) save(address, state);
  }, [state, address, report]);

  if (report === null) return <>{children}</>;
  const close = () => {
    save(address, state);
    setReport(null);
  };
  return (
    <PxModal title="Shift report" onClose={close}>
      <div className="flex items-center gap-4">
        <ForemanMo scale={3} label="Foreman Mo with the shift log" />
        <p className="text-lg">
          Welcome back. You were away {formatDuration(report.away)}; here is the shift log.
        </p>
      </div>
      <div className="mt-4">
        <Readout
          rows={[
            ['Cored, unrefined', formatMohn(report.cored)],
            ['Diesel burned', formatLitres(report.diesel)],
            ['World Bore', `${formatDepth(report.boreMm)} deeper`],
          ]}
        />
      </div>
      {report.tankEmpty && (
        <p role="status" className="mt-4 text-amber">
          The tank ran dry during the shift, so your rigs are standing still.
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        {report.tankEmpty && (
          <PxButton
            onClick={() => {
              close();
              open('fuel');
            }}
          >
            Fill the tank
          </PxButton>
        )}
        <PxButton variant={report.tankEmpty ? 'light' : 'primary'} onClick={close}>
          Back to work
        </PxButton>
        {report.boreMm > 0n && (
          <a
            href={xIntentUrl(
              shiftPost({
                boreMm: report.boreMm,
                awayHours: report.away / 3600,
                address: address as Address,
              }),
            )}
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
