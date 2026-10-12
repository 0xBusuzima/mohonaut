/**
 * A fixed two-day history: pre-fill, 48 hours of emission taken from sim/vectors, rig and site
 * spending, fast and queued refines, a transfer, Market Open, a buyback, LP fees, a timelock
 * parameter change and pool swaps (ours and another pool's).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buybackBurnerAbi,
  liquidityManagerAbi,
  miningCoreAbi,
  mohnPoolKey,
  mohnTokenAbi,
  poolId,
  poolManagerEventsAbi,
  revenueRouterAbi,
  timelockControllerAbi,
} from '@mohonaut/sdk';
import { encodeFunctionData, getAddress, zeroAddress } from 'viem';
import type { Abi, Address, Hex } from 'viem';
import type { Deployment } from '../../src/config.js';
import { FakeChain } from './chain.js';

const E18 = 10n ** 18n;

export const deployment: Deployment = {
  chainId: 46630,
  genesisTime: 1_799_971_200, // a UTC midnight, so hour and day boundaries line up
  startBlock: 1000,
  MohnToken: getAddress('0x1000000000000000000000000000000000000001'),
  MiningCore: getAddress('0x1000000000000000000000000000000000000002'),
  RevenueRouter: getAddress('0x1000000000000000000000000000000000000003'),
  BuybackBurner: getAddress('0x1000000000000000000000000000000000000004'),
  LiquidityManager: getAddress('0x1000000000000000000000000000000000002000'),
  ParamsTimelock: getAddress('0x1000000000000000000000000000000000000006'),
  UpgradeTimelock: getAddress('0x1000000000000000000000000000000000000007'),
};

export const POOL_MANAGER: Address = getAddress('0x8366a39cc670b4001a1121b8f6a443a643e40951');
export const ALICE: Address = getAddress('0xa11ce00000000000000000000000000000000001');
export const BOB: Address = getAddress('0xb0b0000000000000000000000000000000000002');
export const CAROL: Address = getAddress('0xca201000000000000000000000000000000000c3');

const G = BigInt(deployment.genesisTime);
export const GENESIS_HOUR = G / 3600n;
export const DAY1 = Number(G / 86_400n);
export const DAY2 = DAY1 + 1;

interface EmissionVectors {
  rows: (string | number)[][];
}
const vectors = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../../sim/vectors/emission_hourly.json', import.meta.url)),
    'utf8',
  ),
) as EmissionVectors;
/** [R_h, E_h] for h = 0..48 from the simulator (no recycling, H > 0 every hour). */
export const EMISSION = vectors.rows
  .slice(0, 49)
  .map((r) => [BigInt(r[1] ?? 0), BigInt(r[2] ?? 0)] as const);

export const RIG_COST = 2200n * E18;
export const SITE_COST = 500n * E18;
export const FAST_AMOUNT = 1000n * E18;
export const FAST_FEE = 80n * E18;
export const QUEUED = 500n * E18;
export const LP_MINT = 40_000n * E18;
const BUYBACK_ETH = E18 / 1000n;
export const BUYBACK_BURN = 300n * E18;
export const LP_FEE_BURN = 5n * E18;
export const LP_FEE_ETH = E18 / 10_000n;
export const NEW_FUEL_PRICE = 12n * 10n ** 16n;
const OP_ID: Hex = `0x${'ab'.repeat(32)}`;

type Log = { address: Address; abi: Abi; event: string; args: Record<string, unknown> };
const core = (event: string, args: Record<string, unknown>): Log => ({
  address: deployment.MiningCore,
  abi: miningCoreAbi,
  event,
  args,
});
const token = (from: Address, to: Address, value: bigint): Log => ({
  address: deployment.MohnToken,
  abi: mohnTokenAbi,
  event: 'Transfer',
  args: { from, to, value },
});
const deposit = (amount: bigint): Log => ({
  address: deployment.RevenueRouter,
  abi: revenueRouterAbi,
  event: 'Deposited',
  args: {
    amount,
    toBuyback: (amount * 55n) / 100n,
    toPol: (amount * 30n) / 100n,
    toOps: amount - (amount * 85n) / 100n,
  },
});
const swap = (id: Hex, sqrtPriceX96: bigint): Log => ({
  address: POOL_MANAGER,
  abi: poolManagerEventsAbi,
  event: 'Swap',
  args: {
    id,
    sender: ALICE,
    amount0: -(10n ** 15n),
    amount1: 3n * E18,
    sqrtPriceX96,
    liquidity: 10n ** 20n,
    tick: -120,
    fee: 3000,
  },
});

const SET_PARAM_DATA = encodeFunctionData({
  abi: miningCoreAbi,
  functionName: 'setParam',
  args: [0, NEW_FUEL_PRICE],
});

export function buildChain(): FakeChain {
  const chain = new FakeChain(deployment.chainId, BigInt(deployment.startBlock), POOL_MANAGER);
  const ourPool = poolId(mohnPoolKey(deployment.MohnToken, deployment.LiquidityManager));
  const otherPool = poolId(
    mohnPoolKey('0x2000000000000000000000000000000000000001', deployment.LiquidityManager),
  );
  const expiry = GENESIS_HOUR + 1000n;

  // Deployment: the catalog.
  chain.tx(G - 7200n, [
    core('MachineTypeAdded', {
      typeId: 0n,
      generation: 1,
      dp: 10,
      burn: 25n * 10n ** 16n,
      premiumBps: 0,
      minLevel: 1,
    }),
    core('MachineTypeAdded', {
      typeId: 1n,
      generation: 1,
      dp: 100,
      burn: 2n * E18,
      premiumBps: 1000,
      minLevel: 1,
    }),
  ]);
  // Pre-fill: two players register and fuel.
  chain.tx(G - 3600n, [
    core('Registered', { account: ALICE, referrer: zeroAddress }),
    core('PositionUpdated', { account: ALICE, dp: 10n, expiryHour: expiry }),
    core('FuelBought', { account: ALICE, ethIn: E18 / 100n, litres: 5n * E18, expiryHour: expiry }),
    deposit(E18 / 100n),
  ]);
  chain.tx(G - 1800n, [
    core('Registered', { account: BOB, referrer: ALICE }),
    // Bob's fuel runs out during day 1, so he has no active DP at its end.
    core('PositionUpdated', { account: BOB, dp: 10n, expiryHour: GENESIS_HOUR + 10n }),
    core('FuelBought', {
      account: BOB,
      ethIn: E18 / 50n,
      litres: 10n * E18,
      expiryHour: GENESIS_HOUR + 10n,
    }),
    deposit(E18 / 50n),
  ]);

  // Reserve offset from recycling and the LP mint (the emission vector assumes neither).
  let offset = 0n;
  const recycle = (amount: bigint) => {
    offset += amount;
  };
  const hourClosed = (k: number): Log => {
    const [reserve, emission] = EMISSION[k] ?? [0n, 0n];
    return core('HourClosed', {
      hour: GENESIS_HOUR + BigInt(k),
      acc: 0n,
      activeDp: 110n,
      reserve: reserve + offset,
      hourEmission: emission,
    });
  };
  const at = (k: number, seconds: bigint) => G + BigInt(k) * 3600n + seconds;

  for (let k = 1; k <= 48; k++) {
    chain.tx(at(k, 1n), [hourClosed(k)]);
    if (k === 1) {
      // Alice buys two rigs from her unrefined credit and upgrades her site from her wallet later.
      chain.tx(at(k, 100n), [
        core('Paid', { account: ALICE, fromCredit: 0n, fromUnrefined: RIG_COST, fromWallet: 0n }),
        core('SpendSettled', {
          burned: (RIG_COST * 8n) / 10n,
          toReserve: RIG_COST - (RIG_COST * 8n) / 10n,
        }),
        core('MachinesBought', { account: ALICE, typeId: 1n, qty: 2, cost: RIG_COST }),
        core('PositionUpdated', { account: ALICE, dp: 210n, expiryHour: expiry }),
      ]);
      recycle(RIG_COST - (RIG_COST * 8n) / 10n);
      chain.tx(at(k, 200n), [
        core('Accrued', { account: ALICE, amount: 1500n * E18 }),
        core('SpendSettled', { burned: FAST_FEE - FAST_FEE / 2n, toReserve: FAST_FEE / 2n }),
        core('Refined', {
          account: ALICE,
          amount: FAST_AMOUNT,
          minted: FAST_AMOUNT - FAST_FEE,
          fee: FAST_FEE,
        }),
        token(zeroAddress, ALICE, FAST_AMOUNT - FAST_FEE),
      ]);
      recycle(FAST_FEE / 2n);
      chain.tx(at(k, 300n), [
        core('Accrued', { account: BOB, amount: 600n * E18 }),
        core('RefineQueued', {
          account: BOB,
          id: 0n,
          amount: QUEUED,
          readyAt: at(k, 300n) + 72n * 3600n,
        }),
      ]);
      chain.tx(at(k, 400n), [token(ALICE, CAROL, 100n * E18)]);
      chain.tx(at(k, 500n), [
        {
          address: deployment.ParamsTimelock,
          abi: timelockControllerAbi,
          event: 'CallScheduled',
          args: {
            id: OP_ID,
            index: 0n,
            target: deployment.MiningCore,
            value: 0n,
            data: SET_PARAM_DATA,
            predecessor: `0x${'00'.repeat(32)}`,
            delay: 345_600n,
          },
        },
      ]);
      chain.tx(at(k, 600n), [
        core('Paid', { account: ALICE, fromCredit: 0n, fromUnrefined: 0n, fromWallet: SITE_COST }),
        core('SpendSettled', {
          burned: (SITE_COST * 8n) / 10n,
          toReserve: SITE_COST - (SITE_COST * 8n) / 10n,
        }),
        token(ALICE, zeroAddress, SITE_COST),
        core('SiteUpgraded', { account: ALICE, level: 2, cost: SITE_COST }),
      ]);
      recycle(SITE_COST - (SITE_COST * 8n) / 10n);
    }
    if (k === 25) {
      // Day 2: Market Open, a new player, a buyback, LP fees, the parameter change, swaps.
      chain.tx(at(k, 100n), [
        core('MarketOpened', {
          p0Usd: 10n ** 17n,
          ethUsd: 3000n * E18,
          polEth: E18,
          mohnLp: LP_MINT,
          sqrtPriceX96: 2n ** 96n,
        }),
        token(zeroAddress, POOL_MANAGER, LP_MINT),
        {
          address: deployment.LiquidityManager,
          abi: liquidityManagerAbi,
          event: 'MarketOpened',
          args: { sqrtPriceX96: 2n ** 96n, ethIn: E18, mohnIn: LP_MINT, liquidity: 10n ** 20n },
        },
      ]);
      offset -= LP_MINT;
      chain.tx(at(k, 200n), [
        core('Registered', { account: CAROL, referrer: ALICE }),
        core('PositionUpdated', { account: CAROL, dp: 10n, expiryHour: expiry }),
        core('FuelBought', {
          account: CAROL,
          ethIn: E18 / 25n,
          litres: 20n * E18,
          expiryHour: expiry,
        }),
        deposit(E18 / 25n),
      ]);
      chain.tx(at(k, 300n), [
        token(POOL_MANAGER, deployment.BuybackBurner, BUYBACK_BURN),
        token(deployment.BuybackBurner, zeroAddress, BUYBACK_BURN),
        {
          address: deployment.BuybackBurner,
          abi: buybackBurnerAbi,
          event: 'BuybackExecuted',
          args: { ethIn: BUYBACK_ETH, mohnBurned: BUYBACK_BURN },
        },
        swap(ourPool, 2n ** 96n + 1n),
      ]);
      chain.tx(at(k, 400n), [swap(otherPool, 5n)]);
      chain.tx(at(k, 500n), [
        token(POOL_MANAGER, deployment.LiquidityManager, LP_FEE_BURN),
        token(deployment.LiquidityManager, zeroAddress, LP_FEE_BURN),
        {
          address: deployment.LiquidityManager,
          abi: liquidityManagerAbi,
          event: 'FeesCollected',
          args: { ethToBuyback: LP_FEE_ETH, mohnBurned: LP_FEE_BURN },
        },
      ]);
      chain.tx(at(k, 600n), [
        core('ParamChanged', { param: 0, oldValue: 10n ** 17n, newValue: NEW_FUEL_PRICE }),
        {
          address: deployment.ParamsTimelock,
          abi: timelockControllerAbi,
          event: 'CallExecuted',
          args: {
            id: OP_ID,
            index: 0n,
            target: deployment.MiningCore,
            value: 0n,
            data: SET_PARAM_DATA,
          },
        },
      ]);
      chain.tx(at(k, 700n), [core('ActiveRigsSet', { account: ALICE, typeId: 1n, active: 1 })]);
    }
  }
  return chain;
}
