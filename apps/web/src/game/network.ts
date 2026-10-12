import { defineChain, getAddress } from 'viem';
import type { Address } from 'viem';
import testnet from '../../../../deployments/46630.json';

/** The contracts the client talks to (deployments/<chainId>.json, Deploy.s.sol). */
export interface GameDeployment {
  chainId: number;
  genesisTime: number;
  MiningCore: Address;
  MohnToken: Address;
  /** Governance addresses for the operator panel (null when the record has none). */
  ParamsTimelock: Address | null;
  UpgradeTimelock: Address | null;
  OpsSafe: Address | null;
  GuardianSafe: Address | null;
}

/**
 * Which deployment the client plays against. Default: the public testnet record. A build can
 * inline another one (the end-to-end tests point at a local anvil deployment) through
 * NEXT_PUBLIC_DEPLOYMENT_JSON.
 */
const optional = (v: unknown): Address | null =>
  typeof v === 'string' && v !== '' ? getAddress(v) : null;

function load(): GameDeployment {
  const inline = process.env['NEXT_PUBLIC_DEPLOYMENT_JSON'];
  const d = (inline !== undefined && inline !== '' ? JSON.parse(inline) : testnet) as Record<
    string,
    unknown
  >;
  return {
    chainId: Number(d['chainId']),
    genesisTime: Number(d['genesisTime']),
    MiningCore: getAddress(String(d['MiningCore'])),
    MohnToken: getAddress(String(d['MohnToken'])),
    ParamsTimelock: optional(d['ParamsTimelock']),
    UpgradeTimelock: optional(d['UpgradeTimelock']),
    OpsSafe: optional(d['OpsSafe']),
    GuardianSafe: optional(d['GuardianSafe']),
  };
}

export const GAME = load();

const RPC: Record<number, string> = {
  4663: 'https://rpc.mainnet.chain.robinhood.com',
  46630: 'https://rpc.testnet.chain.robinhood.com',
  31337: 'http://127.0.0.1:8545',
};

const EXPLORER: Record<number, string> = {
  4663: 'https://robinhoodchain.blockscout.com',
  46630: 'https://explorer.testnet.chain.robinhood.com',
};

export const gameChain = defineChain({
  id: GAME.chainId,
  name:
    GAME.chainId === 4663
      ? 'Robinhood Chain'
      : GAME.chainId === 46630
        ? 'Robinhood Chain Testnet'
        : 'Local chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [process.env['NEXT_PUBLIC_RPC_URL'] ?? RPC[GAME.chainId] ?? ''] } },
  // The canonical Multicall3 (same bytecode on 4663 and 46630): one eth_call per state read.
  contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } },
  ...(EXPLORER[GAME.chainId] === undefined
    ? {}
    : { blockExplorers: { default: { name: 'Blockscout', url: EXPLORER[GAME.chainId] ?? '' } } }),
  testnet: GAME.chainId !== 4663,
});

export const isTestnet = GAME.chainId !== 4663;

export function txUrl(hash: string): string | null {
  const base = EXPLORER[GAME.chainId];
  return base === undefined ? null : `${base}/tx/${hash}`;
}
