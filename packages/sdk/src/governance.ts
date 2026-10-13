import { encodeAbiParameters, encodeFunctionData, keccak256, stringToBytes } from 'viem';
import type { Address, Hex } from 'viem';
import { miningCoreAbi } from './abi/MiningCore.js';
import { PARAM_NAMES } from './params.js';
import type { ParamName } from './params.js';

/**
 * Parameter changes through the Params Timelock, prepared for the Ops Safe (docs/03 §5 module 2).
 * No key is involved: this builds the calls and Safe Transaction Builder files; people sign in
 * the Safe app.
 */

export type ParamUnit = 'usdWad' | 'wad' | 'bps' | 'seconds' | 'hours';

export interface ParamSpec {
  index: number;
  name: ParamName;
  label: string;
  unit: ParamUnit;
  /** Coded bounds and limits: MiningCore.paramBounds (test/governance.test.ts compares). */
  min: bigint;
  max: bigint;
  /** Largest step per change in bps of the current value; 0 = any value within the bounds. */
  stepBps: bigint;
  /** Minimum seconds between two changes of this parameter. */
  period: number;
}

const E18 = 10n ** 18n;
const HOUR = 3600;
const DAY = 86_400;

export const PARAM_SPECS: readonly ParamSpec[] = [
  {
    index: 0,
    name: 'FuelPrice',
    label: 'Diesel price (USD per litre)',
    unit: 'usdWad',
    min: (3n * E18) / 100n,
    max: E18 / 2n,
    stepBps: 2500n,
    period: 7 * DAY,
  },
  {
    index: 1,
    name: 'VrgdaR',
    label: 'Market target (DP per day)',
    unit: 'wad',
    min: 1000n * E18,
    max: 100_000n * E18,
    stepBps: 2500n,
    period: 30 * DAY,
  },
  {
    index: 2,
    name: 'VrgdaK',
    label: 'Market price decay per day',
    unit: 'wad',
    min: (5n * E18) / 100n,
    max: (35n * E18) / 100n,
    stepBps: 2500n,
    period: 30 * DAY,
  },
  {
    index: 3,
    name: 'FastRefineFee',
    label: 'Fast refine fee',
    unit: 'bps',
    min: 0n,
    max: 1200n,
    stepBps: 0n,
    period: 7 * DAY,
  },
  {
    index: 4,
    name: 'RefineDelay',
    label: 'Standard refine queue',
    unit: 'seconds',
    min: 24n * 3600n,
    max: 168n * 3600n,
    stepBps: 0n,
    period: 7 * DAY,
  },
  {
    index: 5,
    name: 'MaxTankHours',
    label: 'Tank limit (hours of burn)',
    unit: 'hours',
    min: 168n,
    max: 2160n,
    stepBps: 0n,
    period: 7 * DAY,
  },
  {
    index: 6,
    name: 'OracleStaleness',
    label: 'Price feed staleness limit',
    unit: 'seconds',
    min: 25n * 3600n,
    max: 30n * 3600n,
    stepBps: 0n,
    period: 7 * DAY,
  },
  {
    index: 7,
    name: 'SiteCostScale',
    label: 'Site upgrade cost scale',
    unit: 'bps',
    min: 5000n,
    max: 20_000n,
    stepBps: 2500n,
    period: 30 * DAY,
  },
];

if (PARAM_SPECS.some((s, i) => s.index !== i || s.name !== PARAM_NAMES[i])) {
  throw new Error('PARAM_SPECS out of order with PARAM_NAMES');
}

/** The values a change may take now: the bounds, narrowed by the step limit (contract math). */
export function allowedRange(spec: ParamSpec, current: bigint): { lo: bigint; hi: bigint } {
  if (spec.stepBps === 0n) return { lo: spec.min, hi: spec.max };
  const lo = (current * (10_000n - spec.stepBps)) / 10_000n;
  const hi = (current * (10_000n + spec.stepBps)) / 10_000n;
  return { lo: lo > spec.min ? lo : spec.min, hi: hi < spec.max ? hi : spec.max };
}

/**
 * Why setParam would revert when executed at `executeAt` (Unix seconds), as player-readable
 * problems; empty when it would pass. Mirrors MiningCore.setParam.
 */
export function checkParamChange(input: {
  spec: ParamSpec;
  current: bigint;
  next: bigint;
  lastChangedAt: number | null;
  executeAt: number;
}): string[] {
  const { spec, current, next, lastChangedAt, executeAt } = input;
  const problems: string[] = [];
  if (next === current) problems.push('the new value equals the current one');
  if (next < spec.min || next > spec.max)
    problems.push(`outside the coded bounds ${spec.min} to ${spec.max}`);
  const { lo, hi } = allowedRange(spec, current);
  if (spec.stepBps !== 0n && (next < lo || next > hi)) {
    problems.push(`step too large: one change may move it to ${lo} to ${hi}`);
  }
  if (lastChangedAt !== null && executeAt < lastChangedAt + spec.period) {
    problems.push(`rate limit: the earliest execution is ${lastChangedAt + spec.period}`);
  }
  return problems;
}

export const ZERO_HASH: Hex = `0x${'00'.repeat(32)}`;

export function setParamData(index: number, value: bigint): Hex {
  return encodeFunctionData({ abi: miningCoreAbi, functionName: 'setParam', args: [index, value] });
}

/** OpenZeppelin TimelockController.hashOperation. */
export function operationId(op: {
  target: Address;
  value: bigint;
  data: Hex;
  predecessor: Hex;
  salt: Hex;
}): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'uint256' },
        { type: 'bytes' },
        { type: 'bytes32' },
        { type: 'bytes32' },
      ],
      [op.target, op.value, op.data, op.predecessor, op.salt],
    ),
  );
}

// ---------------------------------------------------------------- Safe Transaction Builder

interface MethodInput {
  internalType: string;
  name: string;
  type: string;
}

export interface SafeBatchTx {
  to: Address;
  value: string;
  data: null;
  contractMethod: { inputs: MethodInput[]; name: string; payable: boolean };
  contractInputsValues: Record<string, string>;
}

export interface SafeBatchFile {
  version: '1.0';
  chainId: string;
  createdAt: number;
  meta: {
    name: string;
    description: string;
    txBuilderVersion: string;
    createdFromSafeAddress: Address;
    createdFromOwnerAddress: string;
    checksum?: Hex;
  };
  transactions: SafeBatchTx[];
}

const OP_INPUTS: MethodInput[] = [
  { internalType: 'address', name: 'target', type: 'address' },
  { internalType: 'uint256', name: 'value', type: 'uint256' },
  { internalType: 'bytes', name: 'data', type: 'bytes' },
  { internalType: 'bytes32', name: 'predecessor', type: 'bytes32' },
  { internalType: 'bytes32', name: 'salt', type: 'bytes32' },
];

/** The Transaction Builder's own serialisation for its checksum (keys sorted, name left out). */
function serialize(json: unknown): string {
  if (Array.isArray(json)) return `[${json.map(serialize).join(',')}]`;
  if (typeof json === 'object' && json !== null) {
    const record = json as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    let out = `{${JSON.stringify(keys)}`;
    for (const k of keys) out += `${serialize(record[k])},`;
    return `${out}}`;
  }
  return JSON.stringify(json === undefined ? null : json);
}

export function batchChecksum(file: SafeBatchFile): Hex {
  // Computed without the checksum itself, and with the name blanked.
  const meta: Record<string, unknown> = { ...file.meta, name: null };
  delete meta['checksum'];
  return keccak256(stringToBytes(serialize({ ...file, meta })));
}

function batch(input: {
  chainId: number;
  safe: Address;
  name: string;
  description: string;
  createdAt: number;
  transactions: SafeBatchTx[];
}): SafeBatchFile {
  const file: SafeBatchFile = {
    version: '1.0',
    chainId: String(input.chainId),
    createdAt: input.createdAt,
    meta: {
      name: input.name,
      description: input.description,
      txBuilderVersion: '1.18.0',
      createdFromSafeAddress: input.safe,
      createdFromOwnerAddress: '',
    },
    transactions: input.transactions,
  };
  return { ...file, meta: { ...file.meta, checksum: batchChecksum(file) } };
}

/** One direct contract call as a Transaction Builder file (e.g. the Guardian Safe's pause()). */
export function safeCallBatch(input: {
  chainId: number;
  safe: Address;
  to: Address;
  method: string;
  inputs?: MethodInput[];
  values?: Record<string, string>;
  title: string;
  description: string;
  now: number;
}): SafeBatchFile {
  return batch({
    chainId: input.chainId,
    safe: input.safe,
    createdAt: input.now * 1000,
    name: input.title,
    description: input.description,
    transactions: [
      {
        to: input.to,
        value: '0',
        data: null,
        contractMethod: { name: input.method, payable: false, inputs: input.inputs ?? [] },
        contractInputsValues: input.values ?? {},
      },
    ],
  });
}

export interface TimelockProposal {
  opId: Hex;
  /** Unix seconds when execute becomes possible (schedule mined at `createdAt` at the latest). */
  readyAt: number;
  schedule: SafeBatchFile;
  execute: SafeBatchFile;
}

/**
 * Two Transaction Builder files for one timelocked call: schedule now (proposer: Ops Safe), and
 * execute once the delay has passed (anyone may execute; the Safe file is a convenience).
 */
export function timelockProposal(input: {
  chainId: number;
  safe: Address;
  timelock: Address;
  target: Address;
  data: Hex;
  salt: Hex;
  delay: number;
  title: string;
  /** Unix seconds; ms in the files, as the Transaction Builder writes them. */
  now: number;
}): TimelockProposal {
  const op = {
    target: input.target,
    value: 0n,
    data: input.data,
    predecessor: ZERO_HASH,
    salt: input.salt,
  };
  const values = {
    target: input.target,
    value: '0',
    data: input.data,
    predecessor: ZERO_HASH,
    salt: input.salt,
  };
  const opId = operationId(op);
  const common = { chainId: input.chainId, safe: input.safe, createdAt: input.now * 1000 };
  return {
    opId,
    readyAt: input.now + input.delay,
    schedule: batch({
      ...common,
      name: `Schedule: ${input.title}`,
      description: `Timelock operation ${opId}. Executable after ${input.delay} s.`,
      transactions: [
        {
          to: input.timelock,
          value: '0',
          data: null,
          contractMethod: {
            name: 'schedule',
            payable: false,
            inputs: [...OP_INPUTS, { internalType: 'uint256', name: 'delay', type: 'uint256' }],
          },
          contractInputsValues: { ...values, delay: String(input.delay) },
        },
      ],
    }),
    execute: batch({
      ...common,
      name: `Execute: ${input.title}`,
      description: `Timelock operation ${opId}. Valid only after its delay has passed.`,
      transactions: [
        {
          to: input.timelock,
          value: '0',
          data: null,
          contractMethod: {
            name: 'execute',
            payable: true,
            inputs: OP_INPUTS.map((i) => (i.name === 'data' ? { ...i, name: 'payload' } : i)),
          },
          contractInputsValues: {
            target: input.target,
            value: '0',
            payload: input.data,
            predecessor: ZERO_HASH,
            salt: input.salt,
          },
        },
      ],
    }),
  };
}

/** A parameter as people read it, from its on-chain units. */
export function formatParam(spec: ParamSpec, raw: bigint): string {
  switch (spec.unit) {
    case 'usdWad':
      return `$${(Number(raw) / 1e18).toFixed(4)}`;
    case 'wad':
      return (Number(raw) / 1e18).toLocaleString('en-US', { maximumFractionDigits: 4 });
    case 'bps':
      return `${(Number(raw) / 100).toFixed(2)}%`;
    case 'seconds':
      return `${(Number(raw) / HOUR).toLocaleString('en-US', { maximumFractionDigits: 2 })} h`;
    case 'hours':
      return `${raw.toString()} h`;
  }
}

/** On-chain units from what an operator types (USD, a plain number, %, hours). */
export function parseParam(spec: ParamSpec, text: string): bigint | null {
  const t = text.trim().replace(/[$%h,\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const [whole = '0', frac = ''] = t.split('.');
  const scaled = (decimals: number): bigint | null => {
    if (frac.length > decimals) return null;
    return (
      BigInt(whole) * 10n ** BigInt(decimals) +
      BigInt((frac + '0'.repeat(decimals)).slice(0, decimals) || '0')
    );
  };
  switch (spec.unit) {
    case 'usdWad':
    case 'wad':
      return scaled(18);
    case 'bps':
      return scaled(2); // percent with two decimals = bps
    case 'seconds': {
      const centiHours = scaled(2);
      return centiHours === null ? null : (centiHours * 3600n) / 100n;
    }
    case 'hours':
      return frac === '' ? BigInt(whole) : null;
  }
}
