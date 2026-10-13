import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { describe, expect, it, vi } from 'vitest';
import { send } from '../src/jobs.js';
import type { JobContext } from '../src/jobs.js';

describe('sending a transaction', () => {
  it('signs with the keeper key itself, never asking the RPC to sign (eth_sendTransaction)', async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const writeContract = vi.fn(async (_request: unknown) => '0x01' as const);
    const inc = vi.fn();
    const ctx = {
      clients: {
        address: account.address,
        // The simulation names the keeper by address only, as viem does.
        publicClient: {
          simulateContract: async (call: object) => ({ request: { ...call } }),
          estimateContractGas: async () => 100_000n,
          waitForTransactionReceipt: async () => ({ status: 'success' }),
        },
        walletClient: { account, writeContract },
      },
      metrics: { txs: { inc } },
    } as unknown as JobContext;

    await send(ctx, 'poke', {
      address: '0x0000000000000000000000000000000000000001',
      abi: [],
      functionName: 'poke',
    });

    const request = writeContract.mock.calls[0]?.[0] as { account: unknown; gas: bigint };
    // The local account object (it signs), not the bare address (the RPC would have to).
    expect(request.account).toBe(account);
    expect(request.gas).toBe(125_000n);
    expect(inc).toHaveBeenCalledWith({ task: 'poke', status: 'success' });
  });
});
