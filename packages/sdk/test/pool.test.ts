import { describe, expect, it } from 'vitest';
import { mohnPoolKey, poolId } from '../src/index.js';

describe('MOHN pool id', () => {
  it('matches the Solidity vector (contracts/test/unit/MohnPool.t.sol)', () => {
    const key = mohnPoolKey(
      '0x1111111111111111111111111111111111111111',
      '0x0000000000000000000000000000000000002000',
    );
    expect(poolId(key)).toBe('0xe618da777871bd937c464672d56433cb28488bc498fe65a461f94636532e43da');
  });
});
