'use client';

import { STRATA } from '@mohonaut/sdk';
import { useState } from 'react';
import { Badge, StratumBadge } from '../../components/Badge';
import { BoreLog } from '../../components/BoreLog';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Counter } from '../../components/Counter';
import { Modal } from '../../components/Modal';
import { Table } from '../../components/Table';
import { TankGauge } from '../../components/TankGauge';
import { useToast } from '../../components/Toast';

const E18 = 10n ** 18n;
const SHOWCASE_NOW = 1_791_900_000; // 13 Oct 2026 14:40 UTC

const SAMPLE_ROWS = [
  { rank: 1, name: 'night_driller', cored: '1,240 m' },
  { rank: 2, name: 'Bea', cored: '980 m' },
  { rank: 3, name: '0x1a2b…9f0e', cored: '37 cm' },
];

export function DesignShowcase({ theme }: { theme: 'dark' | 'light' }) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  // A fixed clock keeps the page identical on the server and in visual tests.
  const now = SHOWCASE_NOW;
  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-display text-3xl font-black uppercase">
        {theme === 'dark' ? 'Night shift' : 'Day shift'}
      </h2>

      <Card label="Tokens" title="Palette">
        <div className="grid grid-cols-4 gap-2 text-xs">
          {[
            'night',
            'charcoal',
            'graphite',
            'steel',
            'concrete',
            'bone',
            'orange',
            'amber',
            'cyan',
            'teal',
            'alarm',
            'ok',
          ].map((c) => (
            <div key={c} className="flex flex-col gap-1">
              <span
                className="h-8 rounded border border-line"
                style={{ background: `var(--color-${c})` }}
              />
              <span className="font-mono text-fg-muted">{c}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card label="Type" title="Big Shoulders">
        <p className="font-display text-4xl font-black uppercase">Race to the Moho</p>
        <p className="font-stencil text-lg uppercase">Rig 07 · Fuel line</p>
        <p className="text-lg">Barlow carries the interface and long text at 16 px or more.</p>
        <p className="font-condensed text-lg font-semibold uppercase">Barlow Condensed labels</p>
        <p className="num text-2xl">12,262.000 m · 0.00041 ETH</p>
      </Card>

      <Card label="Actions" title="Buttons">
        <div className="flex flex-wrap gap-3">
          <Button>Buy fuel</Button>
          <Button variant="secondary">Equipment Market</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="danger">Scrap rig</Button>
          <Button busy>Confirming</Button>
          <Button disabled>Refine</Button>
        </div>
      </Card>

      <Card label="Status" title="Badges">
        <div className="flex flex-wrap gap-2">
          <Badge>Idle</Badge>
          <Badge tone="ok">Fuelled</Badge>
          <Badge tone="warning">Timelock 96 h</Badge>
          <Badge tone="alarm">Paused</Badge>
          <Badge tone="data">Live</Badge>
        </div>
        <ul className="mt-4 flex flex-col gap-1">
          {STRATA.map((s, i) => (
            <li key={s.name}>
              <StratumBadge index={i} />
            </li>
          ))}
        </ul>
      </Card>

      <Card label="Instruments" title="Counter and tank">
        <p className="text-fg-muted">Unrefined MOHN</p>
        <Counter base={1240n * E18} perHour={(183n * E18) / 10n} since={now} unit="MOHN" />
        <div className="mt-4 flex flex-col gap-4">
          <TankGauge tank={432n * E18} capacity={720n * E18} burnPerHour={12n * E18} now={now} />
          <TankGauge tank={9n * E18} capacity={720n * E18} burnPerHour={12n * E18} now={now} />
          <TankGauge tank={0n} capacity={720n * E18} burnPerHour={12n * E18} now={now} />
        </div>
      </Card>

      <Card label="Signature" title="Bore log">
        <div className="flex gap-6">
          <BoreLog depthMm={1_184_000n} height={360} />
          <BoreLog depthMm={13_500_000n} height={360} />
        </div>
      </Card>

      <Card label="Data" title="Table">
        <Table
          caption="World Bore contribution"
          rowKey={(r) => String(r.rank)}
          columns={[
            { key: 'rank', header: '#', numeric: true, render: (r) => r.rank },
            { key: 'name', header: 'Driller', render: (r) => r.name },
            { key: 'cored', header: 'Cored', numeric: true, render: (r) => r.cored },
          ]}
          rows={SAMPLE_ROWS}
        />
      </Card>

      <Card label="Feedback" title="Toast and modal">
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            onClick={() => toast({ tone: 'success', title: 'Fuel bought', body: 'Tank: 432.0 ℓ' })}
          >
            Toast
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              toast({
                tone: 'alarm',
                title: 'Game paused',
                body: 'Player actions resume at 14 Oct 22:00 UTC.',
              })
            }
          >
            Alarm toast
          </Button>
          <Button variant="secondary" onClick={() => setOpen(true)}>
            Open modal
          </Button>
        </div>
        <Modal open={open} onClose={() => setOpen(false)} title="Refine 1,000 MOHN">
          <p className="text-fg-muted">Standard: 72 h queue, no fee. Fast: now, 8 % fee.</p>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setOpen(false)}>Queue refine</Button>
          </div>
        </Modal>
      </Card>
    </div>
  );
}
