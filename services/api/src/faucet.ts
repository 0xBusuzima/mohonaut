import { readFileSync } from 'node:fs';
import { createPublicClient, createWalletClient, defineChain, http, isHex } from 'viem';
import type { Address, Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

/**
 * Season 0 testnet faucet (docs/05 §5, docs/06 7.2): a small hot wallet that the founder tops
 * up from public faucets. Testnet only, enforced here and in config: the key holds worthless
 * test ETH and is never a key that signs rewards or touches the game contracts.
 */
export const MAINNET_CHAIN_ID = 4663;

export interface FaucetConfig {
  keyFile: string;
  amountWei: bigint;
  /** Sends that would leave the faucet below this are refused (keeps gas for itself). */
  dailyBudgetWei: bigint;
  /** Recipients already holding this much get nothing (no hoarding). */
  maxRecipientBalanceWei: bigint;
}

export interface FaucetSender {
  readonly address: Address;
  balanceOf(address: Address): Promise<bigint>;
  send(to: Address, value: bigint): Promise<Hex>;
}

export function faucetSender(cfg: FaucetConfig, chainId: number, rpcUrl: string): FaucetSender {
  if (chainId === MAINNET_CHAIN_ID) throw new Error('the faucet never runs on mainnet');
  const raw = readFileSync(cfg.keyFile, 'utf8').trim();
  const key = (raw.startsWith('0x') ? raw : `0x${raw}`) as Hex;
  if (!isHex(key) || key.length !== 66)
    throw new Error('FAUCET_KEY_FILE must hold a 32-byte hex key');
  const account = privateKeyToAccount(key);
  const chain = defineChain({
    id: chainId,
    name: 'testnet',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
  const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });
  const reader = createPublicClient({ chain, transport: http(rpcUrl) });
  return {
    address: account.address,
    balanceOf: (address) => reader.getBalance({ address }),
    send: (to, value) => wallet.sendTransaction({ to, value }),
  };
}
