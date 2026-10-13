import { formatUnits, keccak256, toBytes, zeroHash } from 'viem';
import type { Address, Hex } from 'viem';
import { decodeCall, toJson } from '../contracts.js';
import type { ContractName, IndexedEvent } from '../contracts.js';
import type { NewAlert } from '../projections/context.js';

/**
 * On-chain alert rules (docs/03 §4.6, ADR-014). Governance and privilege changes are critical:
 * each one is either a public Timelock step or a Guardian action, and someone must look at it
 * within minutes. Market events and large token movements are warnings.
 */

const ROLE_NAMES = [
  'UPGRADER_ROLE',
  'CATALOG_ROLE',
  'GUARDIAN_ROLE',
  'KEEPER_ROLE',
  'DEPOSITOR_ROLE',
  'FEE_DEPOSITOR_ROLE',
  'POL_ROLE',
  'BUYBACK_ROLE',
  'OPS_ROLE',
  'LOCKED_ROLE',
  'PROPOSER_ROLE',
  'EXECUTOR_ROLE',
  'CANCELLER_ROLE',
];
const ROLES = new Map<string, string>([
  [zeroHash, 'DEFAULT_ADMIN_ROLE'],
  ...ROLE_NAMES.map((n) => [keccak256(toBytes(n)), n] as [string, string]),
]);
const roleName = (role: unknown) => ROLES.get(String(role)) ?? String(role);

const CRITICAL = new Set([
  'Upgraded',
  'RoleGranted',
  'RoleRevoked',
  'RoleAdminChanged',
  'Paused',
  'Unpaused',
  'CallScheduled',
  'Cancelled',
  'MinDelayChange',
  'RecipientsChanged',
  'SequencerFeedChanged',
  'LiquidityManagerWired',
  'BucketRolesLocked',
  'SplitChanged',
  'DailyBpsChanged',
]);
const WARNING = new Set(['CallExecuted', 'ParamChanged', 'MachineTypeAdded']);

export interface AlertOptions {
  /** MOHN transfers and mints at or above this (wei) raise a warning. */
  largeTransferWei: bigint;
  byAddress: ReadonlyMap<Address, ContractName>;
}

const mohn = (wei: unknown) => `${formatUnits(BigInt(String(wei)), 18)} MOHN`;

function describe(ev: IndexedEvent, byAddress: ReadonlyMap<Address, ContractName>): string {
  const a = ev.args;
  switch (ev.event) {
    case 'RoleGranted':
    case 'RoleRevoked':
      return `${roleName(a['role'])} ${ev.event === 'RoleGranted' ? 'granted to' : 'revoked from'} ${String(a['account'])} by ${String(a['sender'])}`;
    case 'RoleAdminChanged':
      return `admin of ${roleName(a['role'])}: ${roleName(a['previousAdminRole'])} -> ${roleName(a['newAdminRole'])}`;
    case 'CallScheduled': {
      const call = decodeCall(a['target'] as Address, a['data'] as Hex, byAddress);
      const what =
        call === null
          ? `${String(a['target'])} ${String(a['data']).slice(0, 10)}…`
          : `${call.fn}(${(toJson(call.args) as unknown[]).join(', ')})`;
      return `${what}, executable in ${Number(BigInt(String(a['delay']))) / 3600} h`;
    }
    case 'Paused':
      return `paused by ${String(a['by'])} until ${new Date(Number(BigInt(String(a['until']))) * 1000).toISOString()}`;
    default:
      return JSON.stringify(toJson(a));
  }
}

/** Alerts for one decoded event (in addition to those raised by projections, e.g. the mint check). */
export function eventAlerts(ev: IndexedEvent, opts: AlertOptions): NewAlert[] {
  if (ev.contract === 'PoolManager' || ev.event === 'Unknown') return [];
  const out: NewAlert[] = [];
  const name = `${ev.contract}.${ev.event}`;
  if (CRITICAL.has(ev.event)) {
    out.push({ rule: name, severity: 'critical', title: name, body: describe(ev, opts.byAddress) });
  } else if (WARNING.has(ev.event)) {
    out.push({ rule: name, severity: 'warning', title: name, body: describe(ev, opts.byAddress) });
  } else if (name === 'MiningCore.MarketOpened') {
    out.push({
      rule: name,
      severity: 'warning',
      title: 'Market Open',
      body: `pool opened with ${mohn(ev.args['mohnLp'])} and ${formatUnits(BigInt(String(ev.args['polEth'])), 18)} ETH of protocol liquidity`,
    });
  }
  if (name === 'MohnToken.Transfer' && BigInt(String(ev.args['value'])) >= opts.largeTransferWei) {
    const from = String(ev.args['from']);
    const mint = BigInt(from) === 0n;
    out.push({
      rule: mint ? 'large-mint' : 'large-transfer',
      severity: 'warning',
      title: mint ? 'Large MOHN mint' : 'Large MOHN transfer',
      body: `${mohn(ev.args['value'])} ${mint ? '' : `from ${from} `}to ${String(ev.args['to'])}`,
    });
  }
  return out;
}

const EXPLORERS: Record<number, string> = {
  4663: 'https://robinhoodchain.blockscout.com',
  46630: 'https://explorer.testnet.chain.robinhood.com',
};

export function txLink(chainId: number, txHash: string): string | null {
  const base = EXPLORERS[chainId];
  return base === undefined ? null : `${base}/tx/${txHash}`;
}
