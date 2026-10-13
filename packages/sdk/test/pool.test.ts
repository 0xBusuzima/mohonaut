import { describe, expect, it } from 'vitest';
import { mohnPoolKey, poolId, quoteEthForMohn } from '../src/index.js';

describe('MOHN pool id', () => {
  it('matches the Solidity vector (contracts/test/unit/MohnPool.t.sol)', () => {
    const key = mohnPoolKey(
      '0x1111111111111111111111111111111111111111',
      '0x0000000000000000000000000000000000002000',
    );
    expect(poolId(key)).toBe('0xe618da777871bd937c464672d56433cb28488bc498fe65a461f94636532e43da');
  });

  it('quotes an exact-input ETH swap like v4 SwapMath (MohnPool.t.sol test_quoteVector)', () => {
    expect(quoteEthForMohn(10n ** 27n, 10n ** 22n, 10n ** 17n)).toEqual({
      mohnOut: 15_883_124_355_272n,
      sqrtPriceNextX96: 999_999_874_160_924_234_619_179_008n,
    });
    expect(quoteEthForMohn(10n ** 27n, 0n, 10n ** 17n).mohnOut).toBe(0n);
  });
});
