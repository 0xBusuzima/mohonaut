'use client';

import {
  PARAM_SPECS,
  allowedRange,
  checkParamChange,
  formatParam,
  miningCoreAbi,
  parseParam,
  safeCallBatch,
  setParamData,
  timelockControllerAbi,
  timelockProposal,
} from '@mohonaut/sdk';
import type { SafeBatchFile, TimelockProposal } from '@mohonaut/sdk';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { bytesToHex, decodeFunctionData } from 'viem';
import type { Address, Hex } from 'viem';
import { useReadContracts } from 'wagmi';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Table } from '../components/Table';
import { GAME, gameChain } from '../game/network';
import { formatDuration, formatUtc } from '../lib/format';
import { call } from '../social/api';

/**
 * Parameter centre, timelock queue and emergency screen (docs/03 §5 modules 2 and 3). Nothing
 * here signs: it prepares Safe Transaction Builder files and shows what the chain says.
 */

interface QueueOp {
  timelock: string;
  opId: string;
  target: Address;
  fn: string | null;
  args: unknown[] | null;
  value: string;
  data: Hex;
  predecessor: Hex;
  salt: Hex | null;
  delay: number;
  scheduledAt: number;
  readyAt: number;
  executedAt: number | null;
  cancelledAt: number | null;
}
interface ParamRow {
  param: number;
  name: string;
  value: string;
  previous: string;
  changedAt: number;
}

// Operators need the latest state, not the public 60-second cache.
const governance = {
  queue: () =>
    call<{ pending: QueueOp[]; recent: QueueOp[] }>('GET', '/governance/timelock', {
      fresh: true,
    }),
  params: () => call<{ params: ParamRow[] }>('GET', '/governance/params', { fresh: true }),
};

const field = 'mt-1 block w-full rounded border border-line bg-surface-sunken px-3 py-2';
const core = { address: GAME.MiningCore, abi: miningCoreAbi } as const;

/** A JSON file the browser saves (data: URL, so the Content-Security-Policy stays strict). */
function Download({ file, name, label }: { file: SafeBatchFile; name: string; label: string }) {
  const href = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(file, null, 2))}`;
  return (
    <a
      href={href}
      download={name}
      className="inline-flex h-9 items-center rounded-md border border-line px-3 font-condensed text-sm font-semibold tracking-wide uppercase hover:bg-surface-raised"
    >
      {label}
    </a>
  );
}

/** "setParam(FuelPrice, $0.1200)" for a queued MiningCore call. */
export function describeOp(op: Pick<QueueOp, 'data' | 'target'>): string {
  if (op.target.toLowerCase() !== GAME.MiningCore.toLowerCase()) return `call to ${op.target}`;
  try {
    const d = decodeFunctionData({ abi: miningCoreAbi, data: op.data });
    if (d.functionName === 'setParam') {
      const [index, value] = d.args as readonly [number, bigint];
      const spec = PARAM_SPECS[index];
      return spec === undefined
        ? 'setParam(?)'
        : `setParam(${spec.name}, ${formatParam(spec, value)})`;
    }
    return `${d.functionName}(${(d.args ?? []).map(String).join(', ')})`;
  } catch {
    return 'unknown MiningCore call';
  }
}

function randomSalt(): Hex {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

// ------------------------------------------------------------------ parameter centre

export function ParamsScreen({ now }: { now: number }) {
  const reads = useReadContracts({
    contracts: [
      ...PARAM_SPECS.map((s) => ({ ...core, functionName: 'paramValue', args: [s.index] })),
      ...(GAME.ParamsTimelock === null
        ? []
        : [
            {
              address: GAME.ParamsTimelock,
              abi: timelockControllerAbi,
              functionName: 'getMinDelay',
            },
          ]),
    ] as never,
  });
  const changes = useQuery({ queryKey: ['governance', 'params'], queryFn: governance.params });
  const [selected, setSelected] = useState(0);
  const values = (reads.data as ({ result?: unknown } | undefined)[] | undefined)?.map(
    (r) => r?.result,
  );
  const delay = Number((values?.[PARAM_SPECS.length] as bigint | undefined) ?? 0n);
  const lastChange = (index: number) =>
    changes.data?.params.find((p) => p.param === index)?.changedAt ?? null;

  if (GAME.ParamsTimelock === null || GAME.OpsSafe === null) {
    return <p>This deployment record has no Params Timelock or Ops Safe.</p>;
  }
  if (values === undefined) return <p role="status">Reading parameters from the chain…</p>;

  return (
    <>
      <Card label="Parameter centre" title="Current values and coded limits">
        <Table
          caption="MiningCore parameters"
          rows={[...PARAM_SPECS]}
          rowKey={(s) => s.name}
          columns={[
            { key: 'n', header: 'Parameter', render: (s) => s.label },
            {
              key: 'v',
              header: 'Now',
              numeric: true,
              render: (s) => {
                const v = values[s.index] as bigint | undefined;
                return v === undefined ? '—' : formatParam(s, v);
              },
            },
            {
              key: 'b',
              header: 'Bounds',
              render: (s) => `${formatParam(s, s.min)} to ${formatParam(s, s.max)}`,
            },
            {
              key: 'l',
              header: 'Limit',
              render: (s) =>
                `${s.stepBps === 0n ? 'any step' : `±${Number(s.stepBps) / 100}%`} per ${formatDuration(s.period)}`,
            },
            {
              key: 'c',
              header: 'Last change',
              render: (s) => {
                const at = lastChange(s.index);
                return at === null ? 'never' : formatUtc(at);
              },
            },
            {
              key: 'p',
              header: 'Propose',
              render: (s) => (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelected(s.index)}
                  aria-label={`Propose a change to ${s.label}`}
                >
                  Change
                </Button>
              ),
            },
          ]}
        />
        <p className="mt-4 text-fg-muted">
          Changes go through the Params Timelock (minimum delay {formatDuration(delay)}). Every
          scheduled change is public on /economy before it can run.
        </p>
      </Card>
      <ProposeCard
        key={selected}
        index={selected}
        current={values[selected] as bigint | undefined}
        lastChangedAt={lastChange(selected)}
        delay={delay}
        now={now}
        timelock={GAME.ParamsTimelock}
        safe={GAME.OpsSafe}
      />
    </>
  );
}

function ProposeCard(props: {
  index: number;
  current: bigint | undefined;
  lastChangedAt: number | null;
  delay: number;
  now: number;
  timelock: Address;
  safe: Address;
}) {
  const spec = PARAM_SPECS[props.index];
  const [text, setText] = useState('');
  const [proposal, setProposal] = useState<TimelockProposal | null>(null);
  if (spec === undefined || props.current === undefined) return null;
  const current = props.current;
  const next = parseParam(spec, text);
  const executeAt = props.now + props.delay;
  const problems =
    next === null
      ? text === ''
        ? []
        : ['not a number in this unit']
      : checkParamChange({ spec, current, next, lastChangedAt: props.lastChangedAt, executeAt });
  const { lo, hi } = allowedRange(spec, current);
  const ready = next !== null && problems.length === 0;

  return (
    <Card label="Propose" title={spec.label}>
      <p>
        Now <span className="num">{formatParam(spec, current)}</span>. This change may set{' '}
        <span className="num">
          {formatParam(spec, lo)} to {formatParam(spec, hi)}
        </span>
        .
      </p>
      <label className="mt-4 block">
        <span className="text-fg-muted">New value</span>
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setProposal(null);
          }}
          className={`${field} num`}
        />
      </label>
      {problems.length > 0 && (
        <ul role="alert" className="mt-2 list-disc pl-5 text-warn">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <Button
        className="mt-4"
        disabled={!ready}
        onClick={() => {
          if (next === null) return;
          setProposal(
            timelockProposal({
              chainId: gameChain.id,
              safe: props.safe,
              timelock: props.timelock,
              target: GAME.MiningCore,
              data: setParamData(spec.index, next),
              salt: randomSalt(),
              delay: props.delay,
              title: `${spec.name} ${formatParam(spec, current)} -> ${formatParam(spec, next)}`,
              now: props.now,
            }),
          );
        }}
      >
        Prepare Safe files
      </Button>
      {proposal !== null && next !== null && (
        <div className="mt-6 flex flex-col gap-3">
          <p>
            Operation <span className="num break-all">{proposal.opId}</span>, executable from{' '}
            {formatUtc(proposal.readyAt)} if scheduled now.
          </p>
          <ol className="list-decimal pl-5">
            <li>
              Open the Ops Safe <span className="num break-all">{props.safe}</span> in the Safe app
              → Transaction Builder → drag in <strong>1-schedule</strong>, check, sign, collect the
              other signatures.
            </li>
            <li>
              Post the change and its reason publicly (docs/05 template) while the timelock runs.
            </li>
            <li>
              After the delay, run <strong>2-execute</strong> (any signer, or anyone: execution is
              open).
            </li>
          </ol>
          <div className="flex flex-wrap gap-3">
            <Download
              file={proposal.schedule}
              name={`1-schedule-${spec.name}.json`}
              label="1-schedule.json"
            />
            <Download
              file={proposal.execute}
              name={`2-execute-${spec.name}.json`}
              label="2-execute.json"
            />
          </div>
          <details>
            <summary className="cursor-pointer text-fg-muted">
              Without a Safe (testnet stand-in wallet)
            </summary>
            <pre
              tabIndex={0}
              className="mt-2 overflow-x-auto rounded bg-surface-sunken p-3 text-xs"
            >
              {`cast send ${props.timelock} "schedule(address,uint256,bytes,bytes32,bytes32,uint256)" \\\n  ${GAME.MiningCore} 0 ${setParamData(spec.index, next)} \\\n  0x${'00'.repeat(32)} ${String(proposal.schedule.transactions[0]?.contractInputsValues['salt'])} ${props.delay} \\\n  --account ops --rpc-url <RPC>`}
            </pre>
          </details>
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ timelock queue

export function TimelockScreen({ now }: { now: number }) {
  const q = useQuery({
    queryKey: ['governance', 'queue'],
    queryFn: governance.queue,
    refetchInterval: 60_000,
  });
  if (q.data === undefined) return <p role="status">Loading the queue…</p>;
  return (
    <>
      <Card label="Timelock" title="Pending">
        {q.data.pending.length === 0 ? (
          <p className="text-fg-muted">Nothing is scheduled.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {q.data.pending.map((op) => (
              <PendingOp key={`${op.opId}`} op={op} now={now} />
            ))}
          </ul>
        )}
      </Card>
      <Card label="Timelock" title="Recent">
        <Table
          caption="Recently executed or cancelled operations"
          rows={q.data.recent}
          rowKey={(op) => op.opId}
          empty="None yet."
          columns={[
            { key: 'w', header: 'Change', render: (op) => describeOp(op) },
            {
              key: 's',
              header: 'Outcome',
              render: (op) =>
                op.executedAt !== null ? (
                  <Badge tone="ok">executed</Badge>
                ) : (
                  <Badge>cancelled</Badge>
                ),
            },
            {
              key: 't',
              header: 'When',
              render: (op) => formatUtc(op.executedAt ?? op.cancelledAt ?? op.readyAt),
            },
          ]}
        />
      </Card>
    </>
  );
}

function PendingOp({ op, now }: { op: QueueOp; now: number }) {
  const ready = now >= op.readyAt;
  const timelock = op.timelock === 'ParamsTimelock' ? GAME.ParamsTimelock : GAME.UpgradeTimelock;
  const execute =
    op.salt === null || GAME.OpsSafe === null || timelock === null
      ? null
      : timelockProposal({
          chainId: gameChain.id,
          safe: GAME.OpsSafe,
          timelock,
          target: op.target,
          data: op.data,
          salt: op.salt,
          delay: op.delay,
          title: describeOp(op),
          now,
        }).execute;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
      <div>
        <p className="font-semibold">{describeOp(op)}</p>
        <p className="num text-sm text-fg-muted">
          {op.timelock} · {op.opId.slice(0, 18)}… · scheduled {formatUtc(op.scheduledAt)}
        </p>
      </div>
      {ready ? (
        execute === null ? (
          <Badge tone="warning">ready; salt unknown</Badge>
        ) : (
          <Download
            file={execute}
            name={`execute-${op.opId.slice(2, 10)}.json`}
            label="Execute file"
          />
        )
      ) : (
        <Badge tone="data">{`runs in ${formatDuration(op.readyAt - now)}`}</Badge>
      )}
    </li>
  );
}

// ------------------------------------------------------------------ emergency (module 3)

export function EmergencyScreen({ now }: { now: number }) {
  const reads = useReadContracts({
    contracts: [
      { ...core, functionName: 'pausedUntil' },
      { ...core, functionName: 'GUARDIAN_PAUSE' },
      { ...core, functionName: 'GUARDIAN_COOLDOWN' },
    ] as never,
  });
  const [file, setFile] = useState<SafeBatchFile | null>(null);
  const r = (reads.data as ({ result?: unknown } | undefined)[] | undefined)?.map((x) => x?.result);
  const pausedUntil = Number((r?.[0] as bigint | undefined) ?? 0n);
  const pauseLength = Number((r?.[1] as bigint | undefined) ?? 0n);
  const cooldown = Number((r?.[2] as bigint | undefined) ?? 0n);
  const paused = pausedUntil > now;
  return (
    <>
      <Card
        label="Emergency"
        title={paused ? 'Paused' : 'Running'}
        actions={paused ? <Badge tone="alarm">paused</Badge> : <Badge tone="ok">live</Badge>}
      >
        {paused ? (
          <p>
            Player actions are paused until {formatUtc(pausedUntil)} (
            {formatDuration(pausedUntil - now)} left). It ends by itself; extending or ending it
            early is a Params Timelock change.
          </p>
        ) : (
          <p>Player actions run normally.</p>
        )}
        <p className="mt-4 text-fg-muted">
          There is no pause button here by design. A Guardian pause lasts{' '}
          {formatDuration(pauseLength)}, at most once per {formatDuration(cooldown)}, and needs the
          Guardian Safe&apos;s signers.
        </p>
      </Card>
      <Card label="Runbook" title="Incident: pause first, then talk">
        <ol className="list-decimal pl-5">
          <li>Confirm the alert (Telegram, /ops Health, the explorer). Do not guess.</li>
          <li>
            Prepare the Guardian pause file below, open the Guardian Safe{' '}
            <span className="num break-all">{GAME.GuardianSafe ?? 'not set'}</span> → Transaction
            Builder → sign.
          </li>
          <li>
            Post the incident notice (docs/05 templates) on X and as a maintenance banner here.
          </li>
          <li>
            Follow the scenario runbook (docs/04 §6.2): investigate, fix through the timelocks,
            write the post-mortem.
          </li>
        </ol>
        {GAME.GuardianSafe !== null && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              variant="danger"
              onClick={() =>
                setFile(
                  safeCallBatch({
                    chainId: gameChain.id,
                    safe: GAME.GuardianSafe ?? GAME.MiningCore,
                    to: GAME.MiningCore,
                    method: 'pause',
                    title: 'Guardian pause',
                    description: `Pauses player actions for ${pauseLength} s. Prepared ${formatUtc(now)}.`,
                    now,
                  }),
                )
              }
            >
              Prepare Guardian pause file
            </Button>
            {file !== null && (
              <Download file={file} name="guardian-pause.json" label="guardian-pause.json" />
            )}
          </div>
        )}
      </Card>
    </>
  );
}
