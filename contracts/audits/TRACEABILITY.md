# Traceability: threats and invariants → tests

Every threat of `docs/04_GUVENLIK_TEST_DENETIM.md` §1 and every invariant of §2, mapped to the code
that enforces it and the tests that prove it. Paths are relative to `contracts/`. "Recon" means the
shared property harness in `test/recon/` (run by Medusa, Echidna and Foundry
`test/recon/CryticToFoundry.t.sol`).

Status: 2026-10-12, Phase 2.9 (after the internal audit fixes, `audits/FINDINGS.md`). 188 Foundry
tests and properties pass; coverage 99.9 % lines / 96.7 % branches of `src/`; Slither
`--fail-medium` clean; Aderyn no high; Halmos 3/3; Medusa 24/24 and Echidna all passing in smoke
campaigns (the 6-hour campaigns run nightly in CI).

## Threats (docs/04 §1)

| # | Threat | Enforced by | Proven by |
|---|---|---|---|
| T1 | Unlimited mint with a privileged key | `MohnToken`: immutable, single immutable minter, CAP, 500K/day cap; no owner | `unit/MohnToken.t.sol` (`test_mint_onlyMinter`, `test_hardCap_*`, `test_dailyCap_*`, `test_noOwnerOrAdminSurface`); `formal/MohnToken.halmos.t.sol` (`prove_onlyMinterCanMint`, `prove_totalSupplyNeverExceedsCap`, `prove_dailyMintNeverExceedsCap`); `invariant/MohnToken.invariant.t.sol`; Recon T1 |
| T2 | Malicious or broken upgrade | UUPS `_authorizeUpgrade` = `UPGRADER_ROLE` (7-day Timelock); `_disableInitializers`; ERC-7201 namespaced storage | `unit/Governance.t.sol` (`test_upgradeOnlyByUpgraderKeepsState`, V1→V2 keeps state); `unit/MiningCoreFuel.t.sol` (`test_initializeOnlyOnce`, `test_implementationCannotBeInitialized`, `test_onlyUpgraderCanUpgrade`); `slither-check-upgradeability` (only the expected initialize note); `test/script/Deploy.t.sol` (`test_wiredAndHandedOver`) |
| T3 | Reward accounting error | Single PREC=1e36 accumulator, settle before every change, `accAtHour` snapshots, all divisions round down | `unit/MiningAccounting.t.sol` (19 tests incl. `test_partialHourSegmentsNeverExceedHourEmission`, `test_pathIndependence_onePokeVsHourly`, `test_expiredPositionSettlesExactlyOnce`, `testFuzz_conservation`); `differential/MiningAccounting.diff.t.sol` (2,000 hours vs sim vectors); invariants E1–E5 below |
| T4 | Price manipulation | No mint or reward ever reads an AMM price; VRGDA uses time and sales; Market Open uses Chainlink; buyback/LP caps use pool depth only to size limits | `integration/Market.t.sol` (`test_pumpBeforeBuyback_isBoundedByCapAndMinOut`, `test_openMarket_formulaPriceAndLockedLiquidity`); `differential/VrgdaMath.diff.t.sol`; `differential/MarketOpenMath.diff.t.sol` |
| T5 | Oracle problems | 26 h staleness (25–30 h, Timelock), positive answer, no future timestamp, optional sequencer feed with 1 h grace; only fuel purchases stop | `unit/MiningCoreFuel.t.sol` (`test_oracleStale`, `test_oracleNonPositive`, `test_oracleFutureTimestamp`, `test_sequencerDownAndGrace`, `test_staleOracleDoesNotStopMining`, `test_feedWith18Decimals`, `test_feedWithMoreThan18Decimals`); `unit/Governance.t.sol` (`test_tankStalenessDelayFeeAndSiteScaleTakeEffect`) |
| T6 | Randomness exploits | No randomness in the economy (ADR-005); the only modulo on time is the mint-breaker ring buffer (justified Slither suppression) | Design; Slither `weak-prng` reviewed |
| T7 | Loops / DoS | `poke` handles ≤ 168 hour boundaries; the breaker loop is 13 buckets; generation additions ≤ 8 types; pull payments only | `unit/MiningAccounting.t.sol` (`test_longIdleNeedsMultiplePokes`, `test_gas_pokeOneWeek`); `unit/MiningCoreRigs.t.sol` (`test_addGenerationReverts`: 9 types rejected) |
| T8 | Reentrancy | CEI + `nonReentrant` on every state-changing entry point; the token has no hooks; router and Uniswap calls under `nonReentrant` | `unit/MiningCoreFuel.t.sol` (`test_reentrantRouterReverts`); Slither `reentrancy-*` reviewed; Aderyn `reentrancy-state-change` false positives documented in code |
| T9 | Stolen keeper key | Keeper can only: buy back ≤ 2 % pool ETH/day with its own minOut; add liquidity ≤ 4 %/day; finalize mature queues; refresh the testnet feed | `integration/Market.t.sol` (`test_buybackGuards`, `test_addLiquidityGuards`, `test_pumpBeforeBuyback_isBoundedByCapAndMinOut`) |
| T10 | Safe / UI takeover | Hardware wallets, independent tx-hash checks, two UIs (runbook) | Runbook and drills (docs/04 §6); on-chain: every change waits 96 h in the Timelock (`test/script/Deploy.t.sol` `test_parameterChangeThroughTimelock`) |
| T11 | Bots / sybils | Linear ETH fuel cost (sybil-neutral); free Pilot Rig earns no scrap credit; referral only from the treasury share and after ≥ 0.003 ETH of fuel | `unit/MiningCoreRigs.t.sol` (`test_scrapPilotRig_freesPadWithoutCredit`); `unit/MiningCoreRefinery.t.sol` (`test_noReferralBelowFuelThreshold`); sim sybil scenario |
| T12 | Launch sniping | No premine; the pool exists only from `openMarket`, at the formula price; the LiquidityManager hook blocks anyone else from initializing the pool | `integration/Market.t.sol` (`test_nobodyElseCanInitializeThePool`, `test_openMarketGuards`, `test_openMarket_formulaPriceAndLockedLiquidity`) |
| T13 | Web2 attacks | Cloudflare, CSP, no scripts on the current site, 2FA | Outside the contracts (docs/03 §4, docs/05) |
| T14 | Supply chain | Pinned submodule tags (OpenZeppelin 5.7.0, Solady 0.1.26, forge-std 1.17.0, Uniswap v4-core v4.0.0), npm lockfile, `npm audit`, gitleaks in CI | `.github/workflows/ci.yml` |
| T15 | Chain outage / halt | Timestamp-based accrual, idempotent catch-up pokes, no reliance on block numbers | `unit/MiningAccounting.t.sol` (`test_longIdleNeedsMultiplePokes`, `test_pathIndependence_onePokeVsHourly`); `differential/MiningAccounting.diff.t.sol` (`test_singleCatchUpEqualsHourlyPokes`) |

## Invariants (docs/04 §2)

| Code | Invariant | Foundry | Recon (Medusa/Echidna) | Formal |
|---|---|---|---|---|
| T1 | `totalSupply ≤ CAP` | `invariant/MohnToken.invariant.t.sol` `invariant_supplyNeverExceedsCap` | `invariant_T1_supplyBelowCap` | Halmos `prove_totalSupplyNeverExceedsCap` |
| T2 | Only the minter mints; the minter never changes | `invariant_onlyMinterMints`; `unit/MohnToken.t.sol` | (token is driven only through MiningCore) | Halmos `prove_onlyMinterCanMint` |
| T3 | ≤ 500K minted per UTC day | `invariant_dailyMintNeverExceedsCap` | via B1 | Halmos `prove_dailyMintNeverExceedsCap` |
| B1 | ≤ 150K minted in any 60 min (over-limit mints revert) | `invariant/MiningCoreEconomy.invariant.t.sol` `invariant_hourlyMintBreaker`; `unit/MiningCoreRefinery.t.sol` breaker tests | `invariant_B1_hourlyMint` | — |
| E1 | Claims ≤ distributed − used | `invariant_claimsBoundedByDistribution` (accounting and economy) | `invariant_E1_claimsBounded` | — |
| E2 | Supply conservation across every flow | `invariant_supplyConservation` (accounting, fuel, economy); `_conservation()` in unit and market tests | `invariant_E2_conservation` | Planned (needs a symbolic accumulator model) |
| E3 | Active DP = Σ fuelled DP | `invariant_activeDpMatchesPositions`, `invariant_activeDpMatchesFuelledSites` | `invariant_E3_activeDp` | — |
| E4 | An expired position never earns | `invariant/MiningAccounting.invariant.t.sol` `invariant_expiredNeverEarns` | via E1/E3 | — |
| E5 | ≤ E_h distributed per hour | `invariant_hourlyEmissionBound` | — | — |
| E6 | `E_h = floor(R_h·δ_h)` | `differential/EmissionMath.diff.t.sol` (2,000 hours exact) | — | — |
| M1 | Pads and fuel line respected | `invariant_padsCapacityAndTotals` | `invariant_M1_padsAndCapacity` | — |
| M2 | Catalog entries never change | `invariant_catalogImmutable`; `unit/MiningCoreRigs.t.sol` `test_addGeneration` | `invariant_M2_catalogImmutable` | — |
| V1 | No bulk discount | `fuzz/VrgdaMath.fuzz.t.sol` `testFuzz_noBulkDiscount` | — | — |
| V2 | Price monotone in sales and time | `testFuzz_priceMonotone`; `unit/MiningCoreRigs.t.sol` `test_costMatchesClosedFormAndRises` | — | — |
| S1 | Every spend 80 % burned / 20 % reserve | `invariant_spendSplit`; unit payment tests | `invariant_S1_spendSplit` | — |
| R1 | Router balance = buckets | `unit/RevenueRouter.t.sol` `testFuzz_r1`; `invariant_routerBuckets` | `invariant_R1_routerBuckets` | — |
| R2 | Referral ≤ treasury share | `invariant_referralBounded` (≤ 3 % of the miners' share); `unit/MiningCoreRefinery.t.sol` referral tests | `invariant_R2_referralBounded` | — |
| P1 | Parameters bounded, rate-limited, Timelock only | `invariant/Governance.invariant.t.sol`; `unit/Governance.t.sol` (`test_everyParamBoundedSteppedAndRateLimited`, `test_roleMatrix`, `test_stateChangingSurfaceIsReviewed`) | `invariant_P1_params` | — |
| P2 | Pause ≤ 72 h; Guardian cannot unpause | `invariant_guardianPauseBounded`; `unit/Governance.t.sol` pause tests | `invariant_P2_pauseBounded` | Planned |
| L1 | POL liquidity can never be removed | `integration/Market.t.sol` `test_noLiquidityRemovalFunction` (ABI pinned), `test_liquidityNeverDecreases` | — | Planned (needs a symbolic PoolManager) |

## Known gaps

- Halmos proofs exist for the token (T1–T3). E2, P2 and L1 have exhaustive tests and properties
  but no formal proof yet: E2 needs a symbolic model of the accumulator; L1 needs a symbolic
  Uniswap v4 PoolManager. They are listed for the independent audit.
- Mutation testing (Gambit) is set up in `audits/mutation/`; see its README for the latest
  survivor list.
- The long Medusa and Echidna campaigns run nightly in CI (`.github/workflows/nightly.yml`).
