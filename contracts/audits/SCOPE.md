# Audit scope — Mohonaut contracts

Mohonaut is a fair-launched idle mining game on Robinhood Chain (Arbitrum Orbit, chain 4663;
testnet 46630). Players buy diesel with ETH, run rigs that earn MOHN from a reserve-based emission,
spend MOHN on rigs and site upgrades (80 % burned, 20 % back to the reserve) and refine it into
the ERC-20. Fuel revenue is split into buyback & burn, locked protocol liquidity (Uniswap v4) and
operations. Economy spec: `docs/02_TOKENOMI_VE_OYUN_MATEMATIGI.md` (v1.0, frozen); architecture:
`docs/03_TEKNIK_MIMARI.md`; threat model and invariants: `docs/04_GUVENLIK_TEST_DENETIM.md`.

Status: **unaudited**. The project launches guarded (immutable daily mint cap, hourly mint
breaker, 72 h Guardian pause, 96 h / 7-day Timelocks) with an "Unaudited" banner until an
independent audit funded from operations revenue.

## In scope (`contracts/src`, solc 0.8.30, EVM prague)

| Contract | nSLOC | Role |
|---|---|---|
| `MiningCore.sol` | 874 | UUPS proxy (ERC-7201). Registration, fuel (Chainlink ETH/USD), rigs and sites (LinearVRGDA), refinery, referral, dev/treasury withdrawals, hourly mint breaker, Market Open, bounded parameters, Guardian pause |
| `MiningAccounting.sol` | 298 | Abstract base of MiningCore: hourly epochs, reserve-based emission, 90/5/5 split, PREC=1e36 accumulator, expiry schedule, spend/refine/referral bookkeeping |
| `MohnToken.sol` | 43 | ERC-20 + Permit + Burnable + Capped (100M). Single immutable minter, 500K/UTC-day mint cap. No owner, no upgrade, no pause, no fee |
| `RevenueRouter.sol` | 83 | ETH buckets (55/30/15 by default), pull-only payouts by role, bounded split setter |
| `LiquidityManager.sol` | 159 | Full-range ETH/MOHN position held directly in the Uniswap v4 PoolManager; no removal path; also the pool's `beforeInitialize` hook |
| `BuybackBurner.sol` | 88 | Keeper buyback (≤ 2 % pool ETH/day, keeper minOut), 100 % burn |
| `PoolActor.sol` | 75 | Shared v4 settlement and pool-depth reads |
| `lib/EmissionMath.sol` | 24 | Hourly emission and split |
| `lib/VrgdaMath.sol` | 31 | LinearVRGDA price, batch cost, re-anchoring exponent (Solady expWad/lnWad) |
| `lib/SiteMath.sol` | 89 | Generated level tables (slots, fuel-line capacity, upgrade cost) |
| `lib/MarketOpenMath.sol` | 21 | Opening price, LP amount, sqrt price |
| `lib/MohnPool.sol` | 40 | Pool key, full-range ticks, liquidity for amounts |
| `interfaces/*` | 32 | |
| **Total** | **1,857** | |

Deployment script `script/Deploy.s.sol` (deploy → configure → hand over, asserts the deployer keeps
no role) is in scope for review; `script/testnet/ManualEthUsdFeed.sol` is testnet-only and refused
on mainnet.

## Out of scope

`lib/` dependencies (pinned tags): OpenZeppelin Contracts and Contracts Upgradeable 5.7.0, Solady
0.1.26, forge-std 1.17.0, Uniswap v4-core v4.0.0 (interfaces and libraries only; the deployed
PoolManager `0x8366a39cc670b4001a1121b8f6a443a643e40951` is Uniswap's). Tests, simulator, off-chain
services and the web client.

## Invariants

See `audits/TRACEABILITY.md` for every invariant with its Foundry, Medusa/Echidna and Halmos
evidence. Summary: T1 supply ≤ CAP; T2 only the minter mints; T3 ≤ 500K/day; B1 hourly breaker;
E1–E6 accounting; M1 pads/capacity; M2 catalog immutable; V1 no bulk discount; V2 price monotone;
S1 80/20 spend split; R1 router buckets; R2 referral ≤ treasury share; P1 bounded, rate-limited
parameters; P2 Guardian pause ≤ 72 h; L1 locked liquidity.

## Trust assumptions

| Actor | Can | Cannot |
|---|---|---|
| 96 h Timelock (proposer: ops Safe; executor: anyone) | Bounded parameters, new machine generations (stratum depth, 45 days, ≤ +15 % efficiency), recipients, sequencer feed, unpause/extend pause (≤ 30 days), router split, buyback cap, role management | Change the token, CAP, emission schedule, 90/5/5 or 80/20 splits, referral rate, existing machines, the Market Open formula (these live in the upgradeable MiningCore: only the 7-day upgrade Timelock can change them, publicly); skip its own delay |
| 7-day Timelock | Upgrade MiningCore | Anything else |
| Guardian Safe | Pause player actions for 72 h, at most once per 7 days | Unpause, move funds, change parameters |
| Keeper (hot key) | poke, finalize mature refines, buyback ≤ 2 %/day and add liquidity ≤ 4 %/day of pool ETH with its own slippage bound; testnet feed | Anything else. **Known issue (AI review AI-2):** the daily caps scale with the pool's active liquidity, which just-in-time liquidity can multiply 30-60x within a block, so a stolen key can sandwich far more than one day's nominal cap (measured: 38-59 % of the spend). Fix pending a founder decision on the cap basis |
| Deployer | Nothing after `Deploy.s.sol` (asserted on-chain in the script) | — |

External dependencies: Chainlink ETH/USD (8 decimals, 24 h heartbeat; no sequencer uptime feed on
this chain), Uniswap v4 PoolManager, Robinhood Chain's 96 KB code size limit (ADR-011).

## Known issues and design decisions

The internal multi-agent audit and its resolutions are in `audits/FINDINGS.md`.

1. **Code size.** MiningCore is ~35 KB; it relies on Robinhood Chain's verified 96 KB limit
   (ADR-011) and is not portable as is to chains enforcing EIP-170.
2. **VRGDA far behind schedule.** With no sales for a long time the unit price tends to 0
   (spec behaviour); the docs/02 §12 rule lowers `r` long before that.
3. **Pause drains tanks.** While paused, players cannot buy fuel; consumption continues.
4. **Referral timing.** Referral credit is computed when the invitee's accrual is settled (on the
   invitee's next action) and checks the referrer's fuel at that moment.
5. **Hourly mint limit.** 13 five-minute buckets: the window covers 60–65 minutes (conservative).
   A mint that would cross 150K reverts (`MintWindowFull`) and can be retried; there is no global
   "tripped" state (an earlier design let anyone freeze minting; see `audits/FINDINGS.md` #1).
   Refine requests are capped at 100K; the Market Open LP is clamped to the room left.
6. **Site cost scale bounds** (0.5×–2×) are an implementation choice; docs/02 gives only the rate.
7. **Market Open requires genesis activity**; with zero fuel or zero miner accrual it reverts
   (`NoGenesisActivity`).
8. **`pendingOf` is a view-only loop** over the hours since the last checkpoint. The keeper pokes
   hourly; after a long idle period a client should call `poke` first (each call processes up to
   168 hours) or the view may exceed an RPC's `eth_call` gas cap.
9. **Genesis tank cap uses the current burn rate**; buying fuel and then switching rigs off adds
   genesis fuel. It is paid in ETH that funds POL, so P0 and the POL rise together (FINDINGS #13).
10. **Buyback/LP caps read pool depth** (manipulable within a block); this only sizes the cap. The
   keeper's off-chain `minOut` is the price protection.

## How to run

```bash
cd contracts
forge build --sizes
forge test
forge coverage --report lcov --no-match-coverage "(test|script)/" --code-size-limit 300000
```

Static analysis, Halmos, Medusa and Echidna commands are in the repository's `CLAUDE.md`
("Komutlar") and `.github/workflows/`.
