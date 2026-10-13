# Specification audit: contracts vs docs/02, sim/params.json, sim/engine, sim/vectors

Role: specification auditor (independent, AI). Date: 2026-10-12. Scope: every economic formula and
constant in `contracts/src` (all `.sol`, `lib/`, `interfaces/`) and `script/Deploy.s.sol`, compared
with `docs/02_TOKENOMI_VE_OYUN_MATEMATIGI.md` (v1.0, with the v1.0.1 row of its changelog),
`sim/params.json`, `sim/engine/*`, `sim/vectors/*`, `contracts/audits/SCOPE.md` and
`contracts/audits/TRACEABILITY.md`. No existing file was modified.

Paths below: `MiningCore.sol` etc. are under `contracts/src/`; `docs/02` is
`docs/02_TOKENOMI_VE_OYUN_MATEMATIGI.md`; `params.json`, `model.py`, `amm.py`, `governance.py` are
under `sim/` and `sim/engine/`.

## Evidence produced (all under `contracts/audit-tests/spec/`)

| File | What it does | Result |
|---|---|---|
| `spec_check.py` | Parses every constant/table from the `.sol` sources and compares it with docs/02 values, `params.json`, the vectors and an 80-digit `Decimal` recomputation (delta_h, capacity and upgrade tables, yearly emission, strata days, docs tables). Output: `spec_check.out.txt` | 62 checks: 50 OK, 12 DIFF |
| `SpecConformance.t.sol` | Foundry test of the deployed initial state (proxy + token + router + buyback burner) against docs/02; `test_diff_*` tests pin each numeric difference | 12/12 pass (`FOUNDRY_TEST=audit-tests/spec FOUNDRY_OUT=out-spec FOUNDRY_CACHE_PATH=cache-spec forge test -vv`) |
| `pol_cap_experiment.py` | Runs the unchanged simulator (v1.0-aligned: 500K daily cap, 96 h delay) with and without the contract's 4 %/day POL-addition cap (in-memory monkeypatch). Output: `pol_cap_experiment.out.txt` | see SPEC-1 |
| `cosmetic_sink_share.py` | Share of the simulator's sinks that come from cosmetic burns (no on-chain counterpart). Output: `cosmetic_sink_share.out.txt` | see SPEC-15 |

## 1. Everything checked

Verdict: OK = code equals docs/02 and sim; DIFF = see the finding in the last column.

### 1.1 Token, mint limits, emission

| # | Item | Code (value, location) | docs/02 | sim | Verdict |
|---|---|---|---|---|---|
| C01 | CAP | 100,000,000e18 `MohnToken.sol:19`, `lib/EmissionMath.sol:12` | 100M, 18 dec (S2, :49) | 100,000,000 (`params.json:3`) | OK |
| C02 | Daily mint cap | 500,000e18 per UTC day `MohnToken.sol:22,51-57` | 500,000 (S2, :55) | **2,000,000** (`params.json:66`) | DIFF SPEC-3 |
| C03 | Hourly mint limit | 150,000e18; 13 x 5-min ring = 60-65 min window `MiningCore.sol:105-107,824-853` | 150K / sliding 60 min (S2, :56) | not enforced (hourly stats only, `minting.py`) | OK (window stricter); sim gap SPEC-3 |
| C04 | Max refine per request | 100,000e18 `MiningCore.sol:103,735` | 100K (S2, :56) | not modelled | OK |
| C05 | delta_h | 20,838,326,282,491 `lib/EmissionMath.sol:15` | 1-(1-0.0005)^(1/24) (S3.1, :73) | same (`vectors/emission_hourly.json`, `params.json:5`); 80-digit recomputation equal | OK |
| C06 | Emission split | 9000/500/remainder to treasury `lib/EmissionMath.sol:18-19,37-39` | 90/5/5 (S3.3, :106-108) | 0.90/0.05/0.05 (`params.json:6-8`), `split_int` | OK |
| C07 | E_h formula | floor(R_h x delta_h / 1e18), fixed at the hour start, spread per second, only while H > 0 `MiningAccounting.sol:126-150` | S3.1 :74-78 | `emission.py:105-113`; 2,000-hour vector (existing diff test) | OK |
| C08 | MAX_HOURS_PER_POKE | 168 `MiningAccounting.sol:24` | 168 (S4, :149) | n/a | OK |
| C09 | Accumulator scale | PREC = 1e36 `MiningAccounting.sol:21` | 1e18 (S4, :142-143) | float | DIFF SPEC-11 |
| C10 | Expiry / accAtHour / dpEndingAt | `MiningAccounting.sol:139-149,179-193` | S4 :144-148 | n/a (daily) | OK |
| C11 | Yearly table, half-life | keep = 0.833147, half-life 1,385.9 d (derived) | 0.83314, 1,386 d, table (S3.2, :85-98) | `emission.py:71-83` | OK (0.83314 is truncated) |
| C12 | Strata thresholds | 2,000 / 6,000 / 12,262 / 20,000 / 35,000 / 60,000 / 85,000 m for gen 2..8+ `MiningCore.sol:718-721` | S3.4 :124-131; day estimates recomputed, all within 1 day | `depth_m` `model.py:783` | OK (Gen-8+ DOC-GAP SPEC-19) |
| C13 | World Depth | emitted / 1,000e18, all three shares, recycled included `MiningCore.sol:92`, `MiningAccounting.sol:165` | S3.4 :117-120 | `accrued_total` `model.py:329,783` | OK |

### 1.2 Fuel, oracle, genesis

| # | Item | Code | docs/02 | sim | Verdict |
|---|---|---|---|---|---|
| C14 | Fuel price | 0.1e18 USD/L `script/Deploy.s.sol:36` | $0.10 (S5.1, :173) | 0.10 (`params.json:15`, key `price_usd_per_kwh`) | OK (naming SPEC-16) |
| C15 | Fuel price bounds | 0.03e18-0.5e18, +-2500 bps, 7 days `MiningCore.sol:1014` | $0.03-0.50, +-25 %/7 d (S5.1, S12) | constant | OK |
| C16 | Litres per ETH | wei x ethUsdWad / priceWad, floor `MiningCore.sol:448-451` | l x pi / ETHUSD (S5.1, :168) | `model.py:399` | OK |
| C17 | ETH/USD decimals | scaled to 18 `MiningCore.sol:474-477` | Chainlink 8 dec (vectors README) | n/a | OK |
| C18 | Tank cap | capacity(L) x 720 h `MiningCore.sol:65,438` | capacity x 720 h, bounds 168-2,160 h, rate "-" (S5.1, :174) | 720 (`params.json:16`) | OK; 7-day rate limit DOC-GAP SPEC-17 |
| C19 | Oracle staleness | 26 h; 25-30 h, once/7 d `MiningCore.sol:67,1020` | 26 h, 25-30 h, rate "-" (S5.1, :175) | n/a | OK; rate DOC-GAP SPEC-17 |
| C20 | Sequencer feed / grace | optional (address(0) skips), 1 h grace `MiningCore.sol:68,454-464` | optional, no grace value (S5.1, :176) | n/a | DIFF SPEC-18 |
| C21 | Oracle stale effect | buyFuel and **openMarket** revert `MiningCore.sol:373,899` | "only fuel purchases stop" (S5.1, :179) | n/a | DIFF SPEC-21 |
| C22 | Expiry hour | floor((max(now,T0) + tank x 3600 / burn) / 3600) `MiningCore.sol:426-431` | floor_hour(now + tank / active rate) (S5.1, :167) | n/a | OK (wording SPEC-16) |
| C23 | Fuel consumption | ceil(burn x dt / 3600), only from genesis, only until expiry `MiningCore.sol:409-419` | S5.1 :165-166 | n/a | OK |
| C24 | Genesis tank grace | Market Open + 24 h, uses current burn `MiningCore.sol:63,437-445` | Market Open + 24 h (S11, :353) | 24 (`params.json:63`) | OK |
| C25 | Pre-fill / genesis | 24 h / 72 h `MiningCore.sol:60-61,365,809` | T0-24 h / T0+72 h (S11, :340-342) | `genesis.days` 3 (`params.json:58`) | OK |
| C26 | Genesis fuel USD | litres x price, purchases before T0+72 h incl. pre-fill `MiningCore.sol:380-382` | "Genesis yakıt harcaması (USD)" (S11, :345) | purchased basis (`params.json:97`) | OK |

### 1.3 Machines and VRGDA

| # | Item | Code | docs/02 | sim | Verdict |
|---|---|---|---|---|---|
| C27 | Type 0 Pilot Rig | 10 DP, 0.25 L/h, 0 %, L1, free, 1 per site `MiningCore.sol:72-73,333,394-406` | 10 / 0.25 / eta 40 / free (S6.1, :202) | 10 / 0.25 / 0 / 1 (`params.json:20-23`) | OK (sim name SPEC-16) |
| C28 | Type 1 Rotary Rig | 50, 1.0, 0 bps, L1 `MiningCore.sol:334` | :203 | same | OK |
| C29 | Type 2 Top Drive | 150, 2.5, 800 bps, L3 `MiningCore.sol:335` | :204 | same | OK |
| C30 | Type 3 Diamond Core Drill | 420, 6.0, 1700 bps, L6 `MiningCore.sol:336` | :205 | same | OK |
| C31 | Type 4 Turbodrill | 1000, 12.5, 2700 bps, L10 `MiningCore.sol:337` | :206 | same | OK |
| C32 | Type 5 Plasma Bore | 2700, 30, 4000 bps, L15 `MiningCore.sol:338` | :207 | same | OK |
| C33 | Efficiencies | 40/50/60/70/80/90 DP per L/h; best 90e18 `MiningCore.sol:341` | eta column (S6.1) | `config.py:33` | OK |
| C34 | Docs price column | first-buy quote 501.0 / 1,629.8 / 4,998.6 / 13,229.7 / 42,265.6 MOHN | 500 / 1,620 / 4,914 / 12,700 / 37,800 (S6.1, :200-207) | 42,265.6 for T5 (`vectors/vrgda_costs.json` row 1) | DIFF SPEC-6 |
| C35 | p0 | 10e18 `MiningCore.sol:76` | 10 (S6.2, :234) | 10 (`params.json:26`) | OK |
| C36 | k | 0.15e18; 0.05-0.35, +-25 %/30 d `MiningCore.sol:77,1016` | :235 | 0.15 (`params.json:27`) | OK |
| C37 | r | 2000e18; 1,000-100,000, +-25 %/30 d `MiningCore.sol:78,1015` | :236 | 2000; 1,000-100,000, step 0.25, 30 d (`params.json:28,75-78`) | OK |
| C38 | Max units per tx | 10,000 DP units `MiningCore.sol:79,498` | 10,000 (:237) | 10,000 (`params.json:29`) | OK |
| C39 | Price formula | exp(lnAnchor + ln(1-k) x ((t-tA) - (n-nA)/r)) `lib/VrgdaMath.sol:24-43` | p0 (1-k)^(t-n/r) (:218) | `vrgda.py:135-137` | OK (rounding SPEC-22) |
| C40 | Batch cost / unit convention | p(t,n)(a^q-1)/(a-1), unit j at n+j, ceil `lib/VrgdaMath.sol:46-63` | :227-229 | `vrgda.py:140-148` | OK |
| C41 | Tier premium | mulDivUp(batch, 10000+prem, 10000) `MiningCore.sol:699-706` | x (1 + prim) (:229) | `vrgda.py:146-148` | OK |
| C42 | Time origin | anchor = genesisTime, elapsed 0 during pre-fill `MiningCore.sol:327,688-696` | "lansmandan beri gün" (:221) | day 0 = T0 (`scenarios.py:4`) | OK |
| C43 | Re-anchoring | on r **and** k change, ln-anchor `MiningCore.sol:944,1070-1082` | on r change only (S13, :393) | r only (`governance.py:255-258`) | DIFF SPEC-20 |
| C44 | Next generation rule | eff <= best x 1.15, >= 45 d apart, stratum reached `MiningCore.sol:85-90,606-639` | :370 | not modelled | OK; extra guards SPEC-19 |
| C45 | Scrap credit | floor(DP x qty x unitPrice x 2000 / 10000); none for Pilot Rig `MiningCore.sol:81,575-579` | DP x p(t,n) x 20 % (S6.4, :251) | 0.20 (`params.json:35`) | OK; Pilot rule SPEC-19 |

### 1.4 Spending, refinery, referral, dev/treasury

| # | Item | Code | docs/02 | sim | Verdict |
|---|---|---|---|---|---|
| C46 | Spend split | reserve = floor(20 %), burn = rest `MiningAccounting.sol:27,232-236` | 80/20 (S6.3, :244-245) | 0.80 (`params.json:33`) | OK |
| C47 | Payment order | scrap credit, unrefined, wallet; credit part neither burned nor recycled `MiningCore.sol:662-675` | S6.4 :251 | `model.py` "pay: scrap credit, then unrefined, then wallet" | OK |
| C48 | Cosmetic spend | no on-chain sink | 100 % burn (S6.3, :246) | 1.0 (`params.json:34`) | DIFF SPEC-15 |
| C49 | Fast refine fee | 800 bps, ceil; reserve floor(fee/2), burn rest `MiningCore.sol:98,742-746` | 8 % = 4 % + 4 %, bounds 0-12 % (S8, :284,289) | 0.08, burn share 0.5 (`params.json:48-49`) | OK; rate DOC-GAP SPEC-17 |
| C50 | Refine delay | 72 h; 24-168 h `MiningCore.sol:99,1018` | 72 h; 24-168 h (S8, :283,289) | 3 days (`params.json:50`) | OK; rate DOC-GAP SPEC-17 |
| C51 | Refine closed in genesis | `MiningCore.sol:807-810` | S11 :341 | `model.py:370` | OK |
| C52 | Dev/treasury limit | 100K per UTC day (=> per request) `MiningCore.sol:101,786-805` | 100K per request and day (S3.3, :112) | dev withdrawn daily, no cap | OK; sim gap SPEC-3 |
| C53 | Dev/treasury queue | `refineDelay` (24-168 h) `MiningCore.sol:804,812-820` | "72 saat" (S3.3, :112) | 72 h | DIFF SPEC-7 |
| C54 | Referral rate / source | 300 bps of the invitee's accrual from a 3 % earmark inside the treasury share `MiningAccounting.sol:31,161-163,262-272`, `MiningCore.sol:857-869` | 3 %, treasury, <= 2.7 % (S9, :296-301; v1.0.1 :437) | 0.03 (`params.json:11`), `emission.py:49-68` | OK |
| C55 | Referral conditions | invitee fuel >= 0.003 ETH, referrer fuelled, checked once at settlement `MiningCore.sol:96,861-866` | :298 | 0.003 ETH (`params.json:12`), per day | DIFF SPEC-8 |

### 1.5 Drill site

| # | Item | Code | docs/02 | sim | Verdict |
|---|---|---|---|---|---|
| C56 | Slots | 3 + L `lib/SiteMath.sol:16` | :258 | 3 (`params.json:38`) | OK |
| C57 | Capacity table | 30 entries, equal to the wei to floor(6 x 1.22^(L-1)) and `outpost_costs.json` `lib/SiteMath.sol:38-72` | :259 | 6, 1.22 (`params.json:39-40`) | OK |
| C58 | Upgrade cost table | 29 entries, equal to the wei to floor(150 x L^2.2) (80-digit) and vectors `lib/SiteMath.sol:74-108` | :260 | 150, 2.2 (`params.json:41-42`) | OK |
| C59 | Max level | 30 `lib/SiteMath.sol:9` | L1-L30 (:258) | 30 (`params.json:45`) | OK |
| C60 | idx | clamp(floor(p x 1e18 / P0), 0.25, 4) `MiningCore.sol:82-83,711` | clamp(p/p0, 0.25, 4) (:261) | 0.25 / 4 (`params.json:43-44`) | OK (floor: SPEC-22) |
| C61 | Upgrade cost | ceil(ceil(table x idx) x scale / 10000) `MiningCore.sol:710-714` | 150 L^2.2 idx (:260) | `vrgda.py:216-218` | OK |
| C62 | Site cost scale | 1x, 0.5x-2x, +-25 %/30 d `MiningCore.sol:115,1021` | +-25 %/30 d, no bounds (S12, :371) | absent | DIFF SPEC-10 |
| C63 | Docs S7 table | L29 1,571.18, L30 1,916.84 L/h; L5 cost 5,174.0; total 2,367,148 | 1,565 / ~1,909 / 5,180 / ~2.3M (:259,264-273) | - | DIFF SPEC-12 |
| C64 | Fuel-line check | active burn <= capacity(L) `MiningCore.sol:655-658` | S5.1 :165 | capacity limit on purchases (`vrgda.py:212-213`) | OK |

### 1.6 Revenue, buyback, liquidity, Market Open

| # | Item | Code | docs/02 | sim | Verdict |
|---|---|---|---|---|---|
| C65 | Revenue split | 5500/3000/remainder (ops) `RevenueRouter.sol:29-30,95-97` | 55/30/15 (S10, :310-312) | 0.55/0.30/0.15 (`params.json:53-55`) | OK (dust to ops, documented docs/03) |
| C66 | Split bounds | bb 30-60 %, POL 20-50 %, ops 10-35 %, once/30 d `RevenueRouter.sol:31,76-84` | same bounds, no rate (S10) | - | OK; rate DOC-GAP SPEC-17 |
| C67 | Genesis split | same router split | S11 :354 | 0.55/0.30/0.15 (`params.json:60-62`) | OK |
| C68 | Buyback 100 % burn | `BuybackBurner.sol:99` | :310 | `model.py:435` | OK |
| C69 | Buyback daily cap | 200 bps of pool ETH; 50-500 bps, once/7 d `BuybackBurner.sol:27-28,59-70,81` | "günlük tavan" without a value (:310; S12 :372) | 0.02 (`params.json:93`) | OK vs sim; DOC-GAP SPEC-9 |
| C70 | POL addition cap | 400 bps of pool ETH per UTC day, immutable `LiquidityManager.sol:36,233-240` | not defined (:311) | whole POL bucket every day (`model.py:440-442`) | DIFF SPEC-1, SPEC-9 |
| C71 | POL fee routing | MOHN fees burned, ETH fees to buyback `LiquidityManager.sol:127-147` | "POL işlem ücretleri" revenue (:330) | fees compound in the pool (`amm.py:3-5`) | DIFF SPEC-5 |
| C72 | Pool | v4, ETH currency0, 0.3 %, tick 60, full range, no removal path `lib/MohnPool.sol`, `LiquidityManager.sol` | v4, full range, "pozisyon NFT'si" (:350) | fee 0.003 (`params.json:88`) | OK (NFT wording SPEC-16) |
| C73 | P0 | floor(fuelUsd x 1e18 / genesis miner accrual) `lib/MarketOpenMath.sol:25` | :345 | `market_open.json` (existing diff test exact) | OK (rounding SPEC-23) |
| C74 | LP | min(floor(polEth x ethUsd / P0), 1M, room) `lib/MarketOpenMath.sol:12,32`, `MiningCore.sol:903-910` | :346-349 | min(..., 1M), no room (`model.py:701`) | OK; unreachable 1M SPEC-13 |
| C75 | Opening price | sqrt(ethUsd x 2^192 / P0) (MOHN per ETH) `lib/MarketOpenMath.sol:39` | :350 | `Pool.create` | OK |
| C76 | Genesis accrual snapshot | minersDistributed at hour (T0+72h)/3600 `MiningCore.sol:311`, `MiningAccounting.sol:144` | :345 | `model.py:697-707` | OK |

### 1.7 Governance

| # | Item | Code | docs/02 | sim | Verdict |
|---|---|---|---|---|---|
| C77 | Timelocks | 96 h params, 7 d upgrades `script/Deploy.s.sol:34-35,147-148` | 96 h, upgrades 7 d (S0.5 :17, S12 :364) | **72 h** (`params.json:70`) | DIFF SPEC-4 |
| C78 | Immutables | token immutable; everything else in UUPS MiningCore `MiningCore.sol:47-53,355` | "değiştirilemez" list (S0.4 :16, S12 :364-372) | - | DIFF SPEC-2 |
| C79 | Guardian pause | 72 h, cooldown 7 d, Timelock extension <= 30 d `MiningCore.sol:111-113,956-984` | not in docs/02 | - | DIFF SPEC-18 |
| C80 | Recipients / sequencer feed | once/30 d each `MiningCore.sol:987-1003` | not in docs/02 | - | DIFF SPEC-17 |
| C81 | Step rule | lo = floor(old x 0.75), hi = floor(old x 1.25) `MiningCore.sol:939-943` | +-25 % | step 0.25 | OK (rounding SPEC-24) |
| C82 | Intervention rule | off-chain | :376-379 | sr 0.5, ratio 0.25/4, 4 weeks (`params.json:71-75`) | OK |

### 1.8 Rounding direction (docs/02 S4 :150 "always in the protocol's favour")

| # | Operation | Location | Direction | Verdict |
|---|---|---|---|---|
| R01 | E_h, partial-hour emission, split (remainder to treasury) | `lib/EmissionMath.sol:23,37-39`; `MiningAccounting.sol:130` | down, dust stays in reserve | OK |
| R02 | Accumulator increment, earned | `MiningAccounting.sol:132,184` | down | OK |
| R03 | Referral owed / earmark | `MiningCore.sol:860`; `MiningAccounting.sol:163,264` | down, capped by earmark | OK |
| R04 | Spend reserve share | `MiningAccounting.sol:234` | reserve down, burn gets the wei | OK |
| R05 | Fast refine fee | `MiningCore.sol:742,745` | fee up; reserve half down | OK |
| R06 | Scrap credit | `MiningCore.sol:577` | down | OK |
| R07 | Machine cost | `lib/VrgdaMath.sol:62`; `MiningCore.sol:705` | up | OK |
| R08 | VRGDA exponent | `lib/VrgdaMath.sol:31-32,55,57`; ln/exp round trip | mixed; p(0,0) = p0 - 11 wei | DIFF SPEC-22 |
| R09 | Site idx / site cost | `MiningCore.sol:711` (idx down), `:712-713` (up) | idx down (cost 300 wei low at L1) | DIFF SPEC-22 |
| R10 | Litres bought, runtime, genesis tank limit | `MiningCore.sol:450,428,443` | down | OK |
| R11 | Fuel burned | `MiningCore.sol:414` | up | OK |
| R12 | Genesis fuel USD, P0 | `MiningCore.sol:381`; `lib/MarketOpenMath.sol:25` | down => LP up | DIFF SPEC-23 |
| R13 | LP, clamped POL ETH, sqrt price | `lib/MarketOpenMath.sol:32,39`; `MiningCore.sol:908` | down | OK |
| R14 | Router split | `RevenueRouter.sol:95-97` | down, remainder to ops | OK |
| R15 | Buyback / POL caps, full-range liquidity | `BuybackBurner.sol:81`; `LiquidityManager.sol:236`; `lib/MohnPool.sol:43-58` | down | OK |
| R16 | Step bounds | `MiningCore.sol:940-941` | lo down (permits <= 1 unit below -25 %) | DIFF SPEC-24 |

### 1.9 Units and decimals

All amounts WAD (18 decimals): MOHN, ETH (wei), USD (WAD), litres and L/h (WAD), DP units (integer),
r in DP units/day (WAD), k and idx (WAD), efficiency DP per L/h (WAD, `dp x 1e36 / burn`), fees and
shares in bps. Every product/division was dimension-checked (`_litresFor`, `genesisFuelUsd`,
`openingPrice`, `lpAmount`, `sqrtPriceX96`, scrap credit, idx, `lnPrice`): no unit error found.

### 1.10 SCOPE.md and TRACEABILITY.md claims

| # | Claim | Check | Verdict |
|---|---|---|---|
| T01 | Every test named in TRACEABILITY exists | 76 distinct names grepped in `contracts/test` (wildcards `test_hardCap_*`, `test_dailyCap_*` resolve to 7 tests) | OK |
| T02 | Every test file named exists | all paths present | OK |
| T03 | Recon properties T1, B1, E1-E3, M1, M2, S1, R1, R2, P1, P2 | all in `test/recon/Properties.sol` | OK |
| T04 | Mutation 1,253 / 1,260 | `audits/mutation/README.md:25` | OK (not re-run) |
| T05 | "188 Foundry tests and properties pass" | not re-run (instructions forbid running the main suite outside `audit-tests/spec`); static count of `test*/invariant*/prove*` functions in `test/` is 232 incl. harness copies | not verified |
| T06 | Threat/invariant mechanisms (500K/day, 150K window, 26 h staleness, 1 h sequencer grace, 168-hour poke, 13 buckets, <= 8 types, keeper 2 %/4 %) | match the code | OK |
| T07 | SCOPE trust table: 96 h Timelock can do "breaker reset" | no such function since v1.0.1 | DIFF SPEC-14 |
| T08 | SCOPE trust table: Timelocks "cannot change ... emission schedule, 90/5/5 or 80/20, referral rate, existing machines, Market Open formula" | true for the 96 h Timelock; the 7-day Timelock can change all of them by upgrade | DIFF SPEC-2 |
| T09 | SCOPE known issues 4, 5, 6, 9 | match the code (referral timing, 60-65 min window, scale bounds, genesis tank) | OK |

Totals: 82 constant/formula checks (C01-C82), 16 rounding checks (R01-R16), 9 SCOPE/TRACEABILITY
checks (T01-T09): **107 items**: 83 OK (several carry a DOC-GAP note), 23 DIFF, 1 not verified
(T05). Several DIFF rows share a finding.

## 2. Findings

Severity is by economic impact. None of the findings allows minting beyond the emission schedule or
moving funds; the two Medium findings concern whether the simulated economy and the published
"immutable" promise describe the deployed code.

| ID | Class | Severity | Title | Locations |
|---|---|---|---|---|
| SPEC-1 | MISMATCH | Medium | POL is added at most 4 % of pool ETH per day on-chain; the simulator adds the whole POL bucket daily | `LiquidityManager.sol:34-36,233-240`; `model.py:440-442`; `amm.py:52-70`; docs/02:311,354-356 |
| SPEC-2 | STALE-DOC | Medium | "Değiştirilemez" economy (schedule, 90/5/5, 80/20, referral, existing machines, Market Open) lives in the UUPS-upgradeable MiningCore | docs/02:16,364-372; `MiningCore.sol:47-53,355`; `script/Deploy.s.sol:35,202`; `SCOPE.md:56` |
| SPEC-3 | MISMATCH | Low | sim/params.json still uses the v0.2 daily mint cap (2M) and models none of the v1.0/v1.0.1 mint limits | `params.json:66`; `MohnToken.sol:22`; docs/02:55-56,112; `minting.py:332-351`; `sim/PARAMS.md:3` |
| SPEC-4 | MISMATCH | Low | Simulator timelock delay 72 h vs 96 h | `params.json:70`; `config.py:58`; docs/02:17,364; `script/Deploy.s.sol:34` |
| SPEC-5 | MISMATCH | Low | POL fees: contract burns MOHN fees and routes ETH fees to buyback; simulator compounds them into the pool | `LiquidityManager.sol:127-147`; `amm.py:3-5`; docs/02:330 |
| SPEC-6 | STALE-DOC | Low | docs/02 S6.1 "Fiyat @ p0=10" column understates the real first-purchase price by 0.2-11.8 % | docs/02:200-207,211; `lib/VrgdaMath.sol:46-63`; `MiningCore.sol:699-706` |
| SPEC-7 | STALE-DOC | Low | Dev/treasury withdrawals promise 72 h visibility; they use the adjustable refine delay (24-168 h) | docs/02:112; `MiningCore.sol:804,812-820,1018` |
| SPEC-8 | MISMATCH | Low | Referral conditions are evaluated once per settlement, not per accrual period | `MiningCore.sol:857-869`; docs/02:296-302; `emission.py:49-68`; `model.py:321-323` |
| SPEC-9 | DOC-GAP | Low | Buyback cap (2 %, 0.5-5 %, 7 d) and POL-addition cap (4 %, immutable) not in docs/02 | `BuybackBurner.sol:27-28,59-70`; `LiquidityManager.sol:36`; docs/02:310-311,372 |
| SPEC-10 | DOC-GAP | Low | Site cost scale absolute bounds 0.5x-2x not in docs/02 | `MiningCore.sol:1021`; docs/02:371 |
| SPEC-11 | STALE-DOC | Info | Accumulator scale 1e18 in docs/02 S4, 1e36 in code | docs/02:142-143; `MiningAccounting.sol:21` |
| SPEC-12 | STALE-DOC | Info | docs/02 S7 table and formula line numbers | docs/02:259,267,271,273 |
| SPEC-13 | STALE-DOC | Info | Market Open 1M LP cap is unreachable (hourly room <= 150K); simulator has no room clamp | docs/02:346-349; `lib/MarketOpenMath.sol:12`; `MiningCore.sol:904-910`; `model.py:701` |
| SPEC-14 | STALE-DOC | Info | "Breaker reset" still documented; function removed in v1.0.1 | `MiningCore.sol:42`; `SCOPE.md:56`; `docs/03_TEKNIK_MIMARI.md:112` |
| SPEC-15 | DOC-GAP | Info | Cosmetic MOHN spend (100 % burn) has no on-chain sink; simulator counts it | docs/02:246; `params.json:34`; `metrics.py:69-83` |
| SPEC-16 | STALE-DOC | Info | Version and theme leftovers (v0.2/MOHO, kW, old machine names, position NFT) | docs/02:1-3,167,350,437-438; `params.json:15,19,21`; `sim/PARAMS.md:3`; `sim/vectors/README.md:3-4` |
| SPEC-17 | DOC-GAP | Info | Rate limits not in docs/02 (fee, delay, tank, staleness 7 d; split, recipients, sequencer feed 30 d) | `MiningCore.sol:990,1000,1017-1020`; `RevenueRouter.sol:31,82`; docs/02:174-175,289,310-312 |
| SPEC-18 | DOC-GAP | Info | Guardian pause 72 h / cooldown 7 d / extension 30 d, sequencer grace 1 h not in docs/02 | `MiningCore.sol:68,111-113,461,956-984`; docs/02:176 |
| SPEC-19 | DOC-GAP | Info | Generation guards (<= 8 types, premium <= 100 %, DP <= 10,000, minLevel 1-30, Gen-8+ at 85,000 m) and "Pilot Rig earns no scrap credit" | `MiningCore.sol:87-90,576,606-639,718-721`; docs/02:122-135,202,251,370 |
| SPEC-20 | DOC-GAP | Info | k changes are re-anchored too; docs/02 formula and sim cover only r | `MiningCore.sol:944,1043-1046,1070-1082`; docs/02:393; `governance.py:255-258` |
| SPEC-21 | DOC-GAP | Info | A stale oracle also blocks openMarket, not only fuel purchases | `MiningCore.sol:899`; docs/02:179 |
| SPEC-22 | ROUNDING | Info | VRGDA ln/exp round trip and truncations price slightly low (p(0,0) = p0 - 11 wei; idx floored) | `MiningCore.sol:322,711`; `lib/VrgdaMath.sol:31-32,55,57` |
| SPEC-23 | ROUNDING | Info | P0 floored, so the Market Open LP minted from the reserve rounds up | `MiningCore.sol:381`; `lib/MarketOpenMath.sol:25,32` |
| SPEC-24 | ROUNDING | Info | Parameter step lower bound floored | `MiningCore.sol:940` |
| SPEC-25 | STALE-DOC | Info | docs/02 names a competitor project (repo rule) | docs/02:15,209 |

Counts. By class: MISMATCH 5 (SPEC-1, 3, 4, 5, 8), STALE-DOC 9 (SPEC-2, 6, 7, 11, 12, 13, 14, 16,
25), DOC-GAP 8 (SPEC-9, 10, 15, 17, 18, 19, 20, 21), ROUNDING 3 (SPEC-22, 23, 24). By severity:
High 0, Medium 2, Low 8, Info 15.

## 3. Finding details

### SPEC-1 (MISMATCH, Medium): POL addition capped at 4 % of pool ETH per day vs uncapped in the simulator

- Code: `LiquidityManager.sol:34-36` `ADD_DAILY_BPS = 400` (immutable, no setter);
  `_useDailyCap` (`:233-240`) reverts `addLiquidity` above 4 % of the pool's ETH per UTC day.
  The rest waits in the router POL bucket (docs/02:349 says so only for the Market Open remainder).
- Simulator: `model.py:440-442` zaps the whole `pol_pending` every day (`amm.py:52-70`, optimal
  swap). `params.json` has no POL cap. docs/02 S10 (:311) gives no cap either.
- Size: after Market Open the pool holds ~0.55 ETH (docs/02:356) while 30 % of daily fuel revenue
  (~0.2 ETH/day in the genesis runs) is POL, i.e. ~35 % of the pool per day against a 4 % cap.
  `pol_cap_experiment.py` (5 seeds, unchanged model, v1.0-aligned, medians):

  | Scenario / metric | Simulator as is | With the 4 %/day cap |
  |---|---|---|
  | base pool ETH day 30 / 90 / 365 | 6.39 / 33.9 / 522 | 0.63 / 2.18 / 189 (-90 / -94 / -64 %) |
  | base price USD day 30 / 90 / 365 | 0.101 / 0.159 / 1.89 | 0.017 / 0.015 / 0.61 (-84 / -90 / -68 %) |
  | mean abs daily log-return days 3-93 | 0.137 | 0.205 (+50 %) |
  | max POL backlog in the router | 0 | 9.8 ETH |
  | bear / deep bear pool ETH day 365 | 316 / 305 | 195 / 160 |

  (Within the model a shallow pool also caps discretionary buying at 10 % of pool ETH, so the price
  effect is the model's, not a forecast; the direction and the depth gap are robust.)
- Impact: the docs/02 S13 acceptance results (price resilience, cohort payback, SR, Gini) were
  obtained with a pool roughly 10x deeper in the first three months than the contracts can build.
  The deployed launch would be markedly thinner and more volatile than simulated, with ETH idling
  in the router.
- Recommendation: founder decision. Either specify the cap in docs/02 S10 and re-run the S13
  study with it (add `pol_add_max_daily_frac_of_pool_eth` to `params.json`), or make the cap
  scale with the bucket (e.g. allow max(4 % of pool ETH, a fixed ETH floor) or a larger cap while
  the pool is young). Keep the keeper's minOut as the price protection.

### SPEC-2 (STALE-DOC, Medium): "immutable" economy is upgradeable

- docs/02:16 (S0.4) lists as "değiştirilemez": token, cap, emission schedule, 90/5/5, 80/20,
  existing machine stats; docs/02:364-372 (S12) "Değiştirilemez (kodda sabit)": CAP, token, minter,
  delta_d and schedule, 90/5/5, 80/20, existing machines, Genesis/Market Open formula, referral rate.
- Code: only `MohnToken` (CAP, 500K/day, minter) is immutable. All other items are constants or
  storage of `MiningCore`, a UUPS proxy (`MiningCore.sol:47-53`, `_authorizeUpgrade` `:355`)
  upgradeable by the 7-day Timelock (`script/Deploy.s.sol:35,148,202`). docs/02:17 mentions
  "yükseltmeler 7 gün" but never says the immutable list is subject to it. `SCOPE.md:56` lists the
  same items under "Cannot" for the 96 h Timelock only.
- Impact: a public promise stronger than the code. Supply is still bounded by the token (CAP and
  500K/day), but an upgrade after 7 days could change emission split, burn ratio, referral rate or
  machine stats.
- Recommendation: reword docs/02 S0.4/S12 to "immutable in the token; in MiningCore fixed except
  through a 7-day timelocked upgrade (public queue)" and add the 7-day path to the SCOPE trust table.

### SPEC-3 (MISMATCH, Low): simulator parameters not aligned with v1.0/v1.0.1 mint limits

- `params.json:66` `token.daily_mint_cap = 2,000,000`; docs/02:55 and `MohnToken.sol:22` 500,000
  (v1.0 changelog :438). `sim/PARAMS.md:3` still says the spec mirrors "v0.2 (token MOHO)".
- The 150K sliding-hour limit, the 100K per refine request and the 100K/day dev/treasury limit
  (docs/02:56,112; `MiningCore.sol:101-107`) are not enforced in the simulator (`minting.py`
  records hourly statistics only; `model.py:121` withdraws the dev share daily without a cap).
- Impact: low, because the simulator's largest legitimate day is 141K (docs/02:55) and the
  experiment runs with 500K showed no binding; but the reference model no longer reproduces the
  contract limits, so the docs/02 claims "Tavan hiç devreye girmedi" and "en yüksek meşru saat 71K"
  are not tested against the v1.0.1 rules (e.g. a 100K per-request cap splits bank-run refines).
- Recommendation: set `daily_mint_cap` to 500,000 in `params.json`, add the hourly and per-request
  limits to `MintMeter`, update `PARAMS.md`, regenerate results.

### SPEC-4 (MISMATCH, Low): simulator timelock 72 h vs 96 h

- `params.json:70` `governance.delay_days = 3` (72 h); docs/02:17,364 and `Deploy.s.sol:34` 96 h.
  `sim/PARAMS.md:17` documents a 96 h side run (`v02_delay96`, metric differences <= 0.03).
- Recommendation: switch the main parameter set to 4 days so the canonical results use 96 h.

### SPEC-5 (MISMATCH, Low): POL fee routing

- Code: `collectFees` (anyone) and every `addLiquidity` take the position's accrued fees out of the
  pool; MOHN fees are burned, ETH fees go to the buyback bucket (`LiquidityManager.sol:127-147`).
- Simulator: fees stay in the reserves and deepen the pool (`amm.py:3-5`). docs/02:330 only calls
  POL fees a revenue source.
- Impact: the on-chain pool grows slower than simulated (compounds SPEC-1); MOHN fees are an extra
  sink and ETH fees extra buyback, neither modelled. Recommendation: specify the routing in docs/02
  S10 and model it.

### SPEC-6 (STALE-DOC, Low): docs/02 S6.1 price column

- docs/02:200-207 "Fiyat @ p0=10": 500 / 1,620 / 4,914 / 12,700 / 37,800 = DP x 10 x (1 + premium).
- The contract charges the VRGDA batch cost, which rises inside the batch (unit j at p(t, n+j),
  `lib/VrgdaMath.sol:46-63`). Measured first-buy quotes at t = 0, n = 0
  (`SpecConformance.t.sol::test_diff_docsPriceColumnUnderstatesVrgdaBatchCost`):
  500.997 / 1,629.85 / 4,998.61 / 13,229.73 / 42,265.61 MOHN (+0.2 / +0.6 / +1.7 / +4.2 / +11.8 %).
  42,265.6 is also the vector value (`vrgda_costs.json` row 1).
- The S6.1 example "prim 4 MOHN/DP" (:211) is likewise at p0, ignoring the in-batch rise.
- Recommendation: relabel the column ("DP x p0 x (1 + prim), before the in-batch rise") or print
  the batch cost.

### SPEC-7 (STALE-DOC, Low): dev/treasury visibility window

- docs/02:112: founder and treasury shares only through the "standart 72 saatlik rafine kuyruğu",
  "her çekimi ... 72 saat önce zincirde ... görünür". Code queues them with `c.refineDelay`
  (`MiningCore.sol:804,814`), which the Timelock may set to 24-168 h (`:1018`). At 24 h the advance
  notice is 24 h (after a 96 h public Timelock queue). Recommendation: say "standart kuyruk
  (varsayılan 72 saat, 24-168 saat)" or give the share queue its own fixed 72 h minimum.

### SPEC-8 (MISMATCH, Low): referral conditions evaluated at settlement

- `MiningCore.sol:857-869` (`_onAccrued`) checks "invitee fuel >= 0.003 ETH" and "referrer has fuel"
  once, when the invitee's accrual is settled, and applies the result to the whole interval since
  the last settlement. The simulator applies the conditions per day (`model.py:321-323`,
  `emission.py:49-68`). docs/02:298 states the conditions without timing (SCOPE known issue 4).
- Impact: a referrer that is fuelled only at the moment the invitee acts receives the credit for
  the whole interval, and one whose fuel ran out minutes earlier loses all of it (returned to the
  treasury). Bounded by 3 % of the invitee's accrual; no new emission. Recommendation: document
  the timing in docs/02 S9.

### SPEC-9 (DOC-GAP, Low): buyback and POL-addition caps

- `BuybackBurner.sol:27-28,59-70,81`: 200 bps of pool ETH per UTC day, Timelock 50-500 bps, once
  per 7 days. The value comes from `params.json:93` (model assumption), not from docs/02
  (:310 "günlük tavan", :372 "günlük buyback tavanı" adjustable, no value or bounds).
- `LiquidityManager.sol:36`: 400 bps, immutable, not in docs/02 at all (see SPEC-1).
- Recommendation: add both values, bounds and rates to docs/02 S10/S12.

### SPEC-10 (DOC-GAP, Low): site cost scale bounds

- `MiningCore.sol:1021` `SiteCostScale` 5,000-20,000 bps (0.5x-2x), +-25 % per 30 days; docs/02:371
  gives only the rate. Already SCOPE known issue 6 / docs/03 ("kurucu onayı bekliyor"). Add to docs/02.

### SPEC-11 (STALE-DOC, Info): accumulator scale

- docs/02:142-143 `acc += distributed x 1e18 / H`, `pending = h x (acc - debt) / 1e18`; code uses
  `PREC = 1e36` (`MiningAccounting.sol:21,132,184`). The code is more precise (less dust); update S4.

### SPEC-12 (STALE-DOC, Info): docs/02 S7 numbers

- Capacity L29 "~1,565" vs 1,571.18 L/h; L30 "~1,909" (:259) vs 1,916.84 (`lib/SiteMath.sol`,
  exact; `test_diff_docsCapacityL29L30`). L5 next-level cost "5,180" vs 5,173.99 (3 significant
  figures would be 5,170). Total to L30 "≈ 2.3M" (:273) vs 2,367,148 (≈ 2.4M). Tables in code are
  exact to the wei against an 80-digit recomputation and `outpost_costs.json`.

### SPEC-13 (STALE-DOC, Info): unreachable 1M LP cap

- `MarketOpenMath.LP_CAP = 1,000,000e18` (`lib/MarketOpenMath.sol:12`) can never bind:
  `openMarket` first clamps to the hourly room (<= 150K, `MiningCore.sol:904-910`). docs/02:346-347
  presents 1M as a live cap; `market_open.json` has a row hitting 1M that the full flow cannot
  produce. The simulator (`model.py:701`) has no room clamp (fine at ~40K). Note in docs/02 S11.

### SPEC-14 (STALE-DOC, Info): "breaker reset"

- `MiningCore.sol:42` header ("catalog, breaker reset, unpause"), `SCOPE.md:56` (Timelock "Can ...
  breaker reset") and `docs/03_TEKNIK_MIMARI.md:112` (`resetMintBreaker()`) describe a function
  removed with the v1.0.1 hard limit (no tripped state exists). Remove the references.

### SPEC-15 (DOC-GAP, Info): cosmetic MOHN sink

- docs/02:246 "Kozmetik MOHN harcamaları: %100 kalıcı yakım"; `params.json:34`; the simulator counts
  `burn_cosmetic` in the sink ratio (`metrics.py:69-83`). The v1 contracts have no cosmetic MOHN
  purchase (cosmetics are off-chain/free per docs/06). `cosmetic_sink_share.py`: cosmetic burns are
  0.9 % (base) / 0.3 % (bear) of month-12 sinks; SR28 0.775 -> 0.772 without them. Negligible;
  docs/02 should say the cosmetic sink is not in v1 contracts.

### SPEC-16 (STALE-DOC, Info): version and theme leftovers

- docs/02 header (:1-3) still "v1.0 — DONDURULDU" while the changelog has v1.0.1 (:437, listed
  above the v1.0 row :438). docs/02:167 "tank / aktif_kW" (energy theme). docs/02:350
  "pozisyon NFT'si" (the code holds the position directly in the PoolManager, no NFT).
- `params.json:15,16,21` keys `energy.price_usd_per_kwh`, `kw`; `params.json:19` names
  "Hand Auger, Rotary Drill, Percussion Rig, Thermal Lance" vs docs/code "Pilot Rig, Rotary Rig,
  Top Drive, Turbodrill". `sim/PARAMS.md:3` and `sim/vectors/README.md:3-4` say "v0.2, token MOHO".
  Values are identical; only names and versions are stale.

### SPEC-17 (DOC-GAP, Info): rate limits absent from docs/02

- Once per 7 days: fast refine fee, refine delay, tank hours, oracle staleness
  (`MiningCore.sol:1017-1020`); docs/02 gives "-" or nothing (:174-175,289).
- Once per 30 days: router split (`RevenueRouter.sol:31,82`; docs/02:310-312 no rate), recipients
  (`MiningCore.sol:990`), sequencer feed (`:1000`). All are in docs/03; add them to docs/02 S12.

### SPEC-18 (DOC-GAP, Info): pause and sequencer constants

- `GUARDIAN_PAUSE` 72 h, `GUARDIAN_COOLDOWN` 7 d, `MAX_TIMELOCK_PAUSE` 30 d
  (`MiningCore.sol:111-113`), `SEQUENCER_GRACE` 1 h (`:68,461`) are economy-relevant (tanks drain
  during a pause, SCOPE known issue 3) but appear only in docs/03/docs/04, not docs/02.

### SPEC-19 (DOC-GAP, Info): generation guards and Pilot Rig scrap

- `addMachineGeneration` also requires 1-8 types, premium <= 10,000 bps, 0 < DP <= 10,000,
  minLevel 1-30, burn > 0 (`MiningCore.sol:87-90,606-639`); generations after VII reuse the
  85,000 m threshold (`:718-721`) while docs/02:122-135 names strata only up to Gen-7. Scrapping the
  Pilot Rig gives no credit (`:576`); docs/02:251 does not say so. Documented in docs/03 only.

### SPEC-20 (DOC-GAP, Info): k re-anchoring

- The code re-anchors on r and on k changes using an ln-anchor (`MiningCore.sol:944,1043-1046,
  1070-1082`), which keeps the price continuous for both. docs/02:393 gives the r-only formula
  `p0 (1-k)^(s_a + ...)`, which would jump on a k change; `governance.py` and `vrgda_reanchor.json`
  cover r only. Add the general form (and a k vector).

### SPEC-21 (DOC-GAP, Info): stale oracle and Market Open

- docs/02:179 "Oracle bayat → yalnızca yakıt satın alma durur". `openMarket` also reads
  `_ethUsdWad` (`MiningCore.sol:899`), so a stale feed or a down sequencer delays Market Open until
  the feed updates. Harmless, but undocumented.

### SPEC-22 (ROUNDING, Info): VRGDA price path rounds slightly against the protocol

- `lnAnchor = lnWad(P0)` and `unitPrice = expWad(lnAnchor + ...)` round-trip to
  `10e18 - 11` at t = 0, n = 0 (`MiningCore.sol:322`; `test_diff_genesisPriceAndIdxRoundBelowSpec`).
  `lnPrice` floors `sold / r` and `sMulWad` truncates toward zero when ahead of schedule
  (`lib/VrgdaMath.sol:31-32`); `lnAq` is floored (`:57`). Each lowers a price by <= ~1e-17
  relative. The site `idx` is floored (`MiningCore.sol:711`): at genesis idx = 1 - 2e-18 and the
  L1 upgrade costs 150 MOHN - 300 wei. (Measured T5 batch cost is 6.8e8 wei above the vector, so
  the net is mixed.) Dust; to be strictly protocol-favourable, compute idx with `mulDivUp` and
  bias `lnPrice` upward.

### SPEC-23 (ROUNDING, Info): P0 floor mints dust more LP

- `genesisFuelUsd` (`MiningCore.sol:381`) and `P0` (`lib/MarketOpenMath.sol:25`) are floored, so
  `LP = polEth x ethUsd / P0` (`:32`) is slightly above the exact value: 9,000 wei on 9,000 MOHN in
  `test_diff_openingPriceFloorMintsDustMoreLp` (1e-18 relative). Matches the vector algorithm
  (`market_open.json`), so it is a spec-level choice; rounding P0 up would favour the reserve.

### SPEC-24 (ROUNDING, Info): step lower bound

- `lo = floor(old x (10000 - stepBps) / 10000)` (`MiningCore.sol:940`) admits a value up to one unit
  below exactly -25 %. One wei for WAD parameters, one bp for `SiteCostScale` only when the old
  value is not a multiple of 4. Negligible; `mulDivUp` would make it exact.

### SPEC-25 (STALE-DOC, Info): competitor name in docs/02

- docs/02:15 and :209 name a competitor project. CLAUDE.md limits competitor comparisons to internal
  documents (`reports/`, `research_notes/`, `docs/05 §9`); docs/02 is the public economy spec
  (SCOPE.md points auditors to it). Rephrase without the name before the repository is public.

## 4. Items confirmed equal (summary)

CAP; 500K/day; 150K window and 100K request cap; delta_h to the wei (80-digit); 90/5/5 with
treasury remainder; hourly emission algorithm (existing 2,000-hour exact vector test); 168-hour poke;
strata thresholds and day estimates; World Depth; fuel price, bounds and step; litres per ETH and
units; tank cap 720 h and bounds; 26 h staleness and bounds; genesis 24 h/72 h and the
Market Open + 24 h tank grace; genesis fuel USD on purchase basis; the whole Gen-1 catalog (DP, L/h,
premium, unlock level, efficiency 40-90); p0, k, r with bounds/steps/periods; 10,000 units per tx;
VRGDA formula, unit convention and closed-form batch cost (existing 61-row vector test); re-anchoring
for r (existing vector test); generation rule (+15 %, 45 d, stratum); 80/20 spend; scrap 20 %;
fast refine 8 % = 4 + 4 with 0-12 % bounds; 72 h queue with 24-168 h bounds; dev/treasury 100K;
referral 3 % from the treasury earmark and 0.003 ETH; slots 3 + L; capacity and upgrade-cost tables
to the wei; idx clamp 0.25-4; max level 30; revenue 55/30/15 with bounds; 100 % buyback burn; buyback
2 % equal to the simulator; P0, LP and sqrt-price formulas (existing 9-row vector test); 96 h and
7-day timelocks; the S12 intervention thresholds.
