import { encodeAbiParameters, keccak256, zeroAddress } from 'viem';
import type { Address, Hex } from 'viem';

/** The ETH/MOHN Uniswap v4 pool (contracts/src/lib/MohnPool.sol): native ETH, 0.3 %, spacing 60. */
export const MOHN_POOL_FEE = 3000;
export const MOHN_POOL_TICK_SPACING = 60;

export interface PoolKey {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}

/** The pool key; `hooks` is the LiquidityManager. */
export function mohnPoolKey(mohn: Address, hooks: Address): PoolKey {
  return {
    currency0: zeroAddress,
    currency1: mohn,
    fee: MOHN_POOL_FEE,
    tickSpacing: MOHN_POOL_TICK_SPACING,
    hooks,
  };
}

/** Uniswap v4 PoolId: keccak256 of the ABI-encoded key. */
export function poolId(key: PoolKey): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'address' },
        { type: 'uint24' },
        { type: 'int24' },
        { type: 'address' },
      ],
      [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks],
    ),
  );
}
