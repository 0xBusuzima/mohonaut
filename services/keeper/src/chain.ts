import { mohnPoolKey, poolId } from '@mohonaut/sdk';
import type { Deployment } from '@mohonaut/indexer';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodePacked,
  hexToBigInt,
  http,
  keccak256,
  parseAbi,
  toHex,
} from 'viem';
import type {
  Address,
  Chain,
  Hex,
  PrivateKeyAccount,
  PublicClient,
  Transport,
  WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const poolManagerStateAbi = parseAbi(['function extsload(bytes32 slot) view returns (bytes32)']);

/** scripts/testnet ManualEthUsdFeed (keeper-owned; testnet only). */
export const manualFeedAbi = parseAbi([
  'function owner() view returns (address)',
  'function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)',
  'function set(int256 answer)',
]);

/** Uniswap v4 StateLibrary: `pools` mapping slot of the PoolManager, liquidity offset. */
const POOLS_SLOT = 6n;
const LIQUIDITY_OFFSET = 3n;

export interface Clients {
  /** The keeper account. */
  address: Address;
  publicClient: PublicClient<Transport, Chain>;
  /** Null in dry-run mode: transactions are simulated from `address`, never sent. */
  walletClient: WalletClient<Transport, Chain, PrivateKeyAccount> | null;
}

export type Signer = { privateKey: Hex } | { address: Address };

export function makeClients(rpcUrl: string, chainId: number, signer: Signer): Clients {
  const chain = defineChain({
    id: chainId,
    name: `robinhood-${chainId}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
  const transport = http(rpcUrl, { retryCount: 3, timeout: 30_000 });
  const publicClient = createPublicClient({ chain, transport });
  if ('address' in signer) return { address: signer.address, publicClient, walletClient: null };
  const account: PrivateKeyAccount = privateKeyToAccount(signer.privateKey);
  return {
    address: account.address,
    publicClient,
    walletClient: createWalletClient({ chain, transport, account }),
  };
}

/** Current price and in-range liquidity of the MOHN pool, read from PoolManager storage. */
export async function poolState(
  clients: Clients,
  deployment: Deployment,
  poolManager: Address,
): Promise<{ sqrtPriceX96: bigint; tick: number; liquidity: bigint }> {
  const id = poolId(mohnPoolKey(deployment.MohnToken, deployment.LiquidityManager));
  const stateSlot = hexToBigInt(keccak256(encodePacked(['bytes32', 'uint256'], [id, POOLS_SLOT])));
  const read = (slot: bigint) =>
    clients.publicClient.readContract({
      address: poolManager,
      abi: poolManagerStateAbi,
      functionName: 'extsload',
      args: [toHex(slot, { size: 32 })],
    });
  const [slot0, liquidityWord] = await Promise.all([
    read(stateSlot),
    read(stateSlot + LIQUIDITY_OFFSET),
  ]);
  return {
    sqrtPriceX96: hexToBigInt(slot0) & ((1n << 160n) - 1n),
    tick: Number(BigInt.asIntN(24, hexToBigInt(slot0) >> 160n)),
    liquidity: hexToBigInt(liquidityWord) & ((1n << 128n) - 1n),
  };
}
