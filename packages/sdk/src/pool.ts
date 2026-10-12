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

const Q96 = 2n ** 96n;
const MAX_FEE_PIPS = 1_000_000n;

/**
 * Exact-input ETH -> MOHN swap within one liquidity range (the protocol position is full
 * range, so no tick is crossed), as Uniswap v4 SwapMath computes it: the fee is taken from the
 * input, the price rounds up, the output rounds down. Returns the MOHN out and the new price.
 */
export function quoteEthForMohn(
  sqrtPriceX96: bigint,
  liquidity: bigint,
  ethIn: bigint,
  feePips: bigint = BigInt(MOHN_POOL_FEE),
): { mohnOut: bigint; sqrtPriceNextX96: bigint } {
  if (liquidity === 0n || ethIn === 0n) return { mohnOut: 0n, sqrtPriceNextX96: sqrtPriceX96 };
  const amountIn = (ethIn * (MAX_FEE_PIPS - feePips)) / MAX_FEE_PIPS;
  const numerator = liquidity << 96n;
  const denominator = numerator + amountIn * sqrtPriceX96;
  // mulDivRoundingUp(numerator, sqrtPrice, denominator)
  const next = (numerator * sqrtPriceX96 + denominator - 1n) / denominator;
  return { mohnOut: (liquidity * (sqrtPriceX96 - next)) / Q96, sqrtPriceNextX96: next };
}
