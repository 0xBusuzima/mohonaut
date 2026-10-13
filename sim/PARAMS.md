# params.json — what every parameter means

`spec.*` mirrors `docs/02_TOKENOMI_VE_OYUN_MATEMATIGI.md` **v1.1** (token MOHN; `DIG` is the simulator's
code name). The table gives the spec section for each value. `model.*` are **simulation assumptions** that the spec does not fix.

Change a spec value only after the spec changes. Model values are the calibration levers; `RAPOR.md`
states their effect.

Parameter sets in `param_sets/` override values by dotted path (e.g. `"spec.vrgda.r": 8000`):

| File | Meaning |
|---|---|
| `v01.json` | spec v0.1: r = 8,000; ETH split 40/30/30; no genesis tank cap; no §12 rule. Reproduces the v0.1 study to ~1e-15 |
| `v01_recommended.json` | the v0.1 report's recommended set: r = 2,000 and 55/30/15, without the v0.2 genesis/governance changes |
| `v02_nogov.json` | v0.2 with the §12 r rule switched off |
| `v02_notankcap.json` | v0.2 without the genesis tank cap |
| `v02_delay96.json` | §12 rule delay 96 h. docs/02 now specifies a 96 h timelock; the main v0.2 study ran with 72 h (`governance.delay_days` = 3). The 96 h check (`results/v02_delay96`, 7 × 50 seeds) gave the same r paths and metric differences ≤ 0.03 |

## spec (canonical)

| Key | Value | Spec | Meaning |
|---|---|---|---|
| `cap` | 100,000,000 | §2 | Max supply (DIG); R0 = CAP, no premine |
| `emission.delta_d` | 0.0005 | §3.1 | Daily emission rate of the reserve; δ_h = 1 − (1 − δ_d)^(1/24) |
| `emission.split_*` | 0.90 / 0.05 / 0.05 | §3.3 | Miners pro-rata to active DP / dev / treasury |
| `referral.rate` | 0.03 | §9 | Referrer credit = 3 % of the invitee's miner accrual, paid from the treasury share |
| `referral.min_invitee_energy_eth` | 0.003 | §9 | Invitee must have spent ≥ 0.003 ETH on energy |
| `fuel.price_usd_per_litre` | 0.10 | §5.1 | π_ℓ; paid in ETH at ETH/USD |
| `fuel.tank_cap_hours` | 720 | §5.1 | Tank upper bound = site fuel-line capacity × 720 h |
| `machines.*` | catalog | §6.1 | DP, litres per hour, premium, unlock level for tiers 0–5 (tier 0 = free Pilot Rig, 1 per account) |
| `vrgda.p0`, `k`, `r` | 10, 0.15, **2000** (v0.1: 8000) | §6.2 | p(t,n) = p0·(1−k)^(t − n/r) DIG per DP unit; r changes are re-anchored (see `governance`) |
| `vrgda.max_units_per_tx` | 10,000 | §6.2 | Not binding in the daily model (purchases are aggregated) |
| `vrgda.price_floor` | 0 | — | **Not in spec v0.1.** 0 = off. Optional floor on p(t,n), used only to test a recommendation |
| `spend.burn_share` | 0.80 | §6.3 | Share of in-game DIG spending burned; 1 − burn_share returns to the reserve |
| `spend.cosmetic_burn_share` | 1.0 | §6.3 | Cosmetic spending is burned in full |
| `spend.scrap_credit_rate` | 0.20 | §6.4 | Scrap credit = DP × p(t,n) × 20 %, non-transferable, usable for new machines/outposts |
| `outpost.*` | 3, 6, 1.22, 150, 2.2, 0.25, 4, 30 | §7 | slots = 3 + L, capacity = 6·1.22^(L−1) kW, cost(L→L+1) = 150·L^2.2·idx, idx = clamp(p/p0, 0.25, 4), max L30 |
| `refinery.fast_fee` | 0.08 | §8 | Fast refine fee; `fast_fee_burn_share` 0.5 → 4 % burn + 4 % reserve |
| `refinery.queue_days` | 3 | §8 | Standard refine = 72 h queue |
| `revenue.buyback/pol/ops` | **0.55 / 0.30 / 0.15** (v0.1: 0.40/0.30/0.30) | §10 | ETH energy revenue routing |
| `genesis.days` | 3 | §11 | Genesis lasts 72 h; refine closed; market opens at the start of day 3 |
| `genesis.dig_lp_cap` | 1,000,000 | §11 | DIG_LP = min(POL_ETH·ETHUSD/P0, 1M) |
| `genesis.revenue_*` | 0.55 / 0.30 / 0.15 | §11 | Genesis revenue uses the §10 split. The buyback bucket accrues and is spent after Market Open, under the daily cap |
| `genesis.tank_until_hours_after_open` | 24 | §11 (v0.2) | A tank bought during pre-fill or genesis may last only until Market Open + 24 h; 0 = off |
| `token.daily_mint_cap` | 2,000,000 | §2 (v0.2, T3) | Immutable mint cap per UTC day. A mint that does not fit is deferred to the next day: queue entries stay queued, fast refines stay pending. The market-open LP must fit, or the run stops |
| `governance.*` | on; 72 h; 4 weeks; SR 0.5; p/p0 0.25 / 4; ±25 %; 30 days; r 1,000–100,000 | §12 (v0.2), §6.2 | Weekly check. After 4 consecutive weeks of SR < 0.5 or mean p/p0 < 0.25, r ×0.75; after 4 weeks of p/p0 > 4, r ×1.25. Takes effect 72 h later; at most one change per 30 days. Modelled as if the Safe always follows the rule. The schedule is re-anchored so the price does not jump (`engine/governance.py`) |

Spec rules implemented without a parameter:
- **§3.3:** dev and treasury shares can be withdrawn only through the 72 h standard queue. The model withdraws the dev share daily through that queue; the treasury is not withdrawn.
- **§3.4:** World Depth = cumulative accrued emission / 1,000 m (series `depth_m`).
- **§2 T3:** every mint passes the daily cap.

## model (assumptions)

| Key | Value | Meaning / why |
|---|---|---|
| `days` | 1095 | 3-year horizon, daily steps |
| `eth_usd.initial`, `daily_vol` | 3000, 0.02 | ETH/USD is a median-preserving random walk with 2 %/day volatility (≈38 %/yr; milder than ETH's history) |
| `amm.fee` | 0.003 | Pool fee; fees stay in the reserves (v2-style auto-compounding of the never-withdrawn POL) |
| `amm.rounds_per_day` | 8 | The day's buys and sells are executed in 8 alternating tranches (≈ random order) |
| `amm.swap_haircut` | 0.85 | Players assume 15 % slippage when planning ETH → DIG purchases |
| `amm.max_daily_buy_frac_of_pool_eth` | 0.10 | Slippage-aware buyers: discretionary buys (capex, cosmetics, speculators) ≤ 10 % of pool ETH per day (≈ +21 % price impact) |
| `keeper.buyback_daily_frac_of_bucket` | 1/20 | v1.1 (docs/02 §10.1): share of the buyback bucket the keeper may spend per day (`BuybackBurner.INITIAL_DAILY_BPS` 500); unspent ETH stays in the bucket. 1/7 spent the genesis bucket too fast and failed the deep-bear Gini criterion (0.82) |
| `keeper.pol_daily_frac_of_bucket` | 1/7 | v1.1: share of the POL bucket added per day (was: the whole bucket every day) |
| `keeper.chunks_per_day`, `keeper.max_chunk_price_move` | 8, 0.02 | v1.1: one chunk every 3 hours, each moving the price at most 2 % (the on-chain anchor allows 3 %) |
| `ops_monthly_cost_usd` | 15,000 | Assumed operations cost, only used for the runway metric (scale results yourself) |
| `dev_sell_frac` | 0.5 | Share of each matured dev withdrawal sold (the spec says the founder publishes a sale policy) |
| `tank_days` | 7 | Wallets keep 7 days of energy prepaid; refills are ETH revenue when bought |
| `genesis_p0_basis` | purchased | "Genesis energy spend" for P0 = kWh purchased (incl. pre-fill). `consumed` is the alternative |
| `adoption.genesis_players` | 2,000 | Wallets at pre-fill (day 0) |
| `adoption.wave_players`, `mid_day`, `width_days` | 20,000, 150, 45 | Logistic adoption wave of new players |
| `adoption.tail_per_day` | 25 | Steady discovery of new players × awareness F(d) after the wave |
| `adoption.noise_sigma`, `noise_ar` | 0.25, 0.9 | AR(1) log-normal noise on daily arrivals |
| `price_response.*` | 30, 4, 0.1, 0.5 | Wallets compare the price with its 30-day EMA: above it they refine and sell more (fully at 4× the EMA) and pay the fast fee more often; below it they hold back up to 50 % of planned sales |
| `type_mix` | 0.60 / 0.25 / 0.15 | Casual / optimizer / cosmetic share of regular arrivals |
| `whales.rate_per_day`, `accounts` | 0.03, 5 | Poisson whale entities (≈ 1 per month), each using 5 accounts (convex outpost costs make splitting rational) |
| `bots.rate_per_day`, `wallets` | 0.02, 50 | Poisson bot farms of 50 wallets |
| `referred_share` | 0.4 | Share of regular players who joined through a referral |
| `speculators.*` | 25, 0.1, 0.08, 0.97, 0.5, 0.5, 0.1, 10 | Non-mining traders hold a USD position of 25 × active players × sentiment × momentum × value and close 10 % of the gap per day. Sentiment is exp(AR(1)); momentum = clip(1 + 0.5·(14-day return), 0.5, 1.5); value = clip(production cost / price, 0.1, 10)^0.5 |
| `churn_loss_mult` | 4 | Daily churn hazard × (1 + 4) while less than half of a cohort's DP runs |
| `fast_refine_width` | 0.03 | Width of the logistic fast-vs-standard refine choice |
| `purchase_iterations` | 3 | Capex actions a cohort may take per day |
| `payback_entry_days` | 14 | Window defining a cohort's entry investment (§13 payback metric) |
| `mint_profile.*` | 0.8, 15, 0.5 | Hourly spread of mints, used only for hourly statistics (`engine/minting.py`). Normal days follow a diurnal profile ∝ 1 + 0.8·cos(2π(h − 15)/24), peaking at 1.8× the mean at 15:00 UTC. On market-open day, 50 % of refine requests fall in the first hour. Queue finalisations land 72 h after the request, in the same hour. Dev withdrawals and the LP mint use one hour each |

### Agent types (`model.types.*`, spec §13)

| Field | Meaning |
|---|---|
| `budget_usd` | Mean external budget per entity (whale entity / bot farm totals; per wallet otherwise) |
| `capex_share` / `capex_days` | Share of the budget earmarked for buying DIG for capex; deployed over ≥ capex_days |
| `tau_max` | Max acceptable growth-adjusted DIG payback (days); < 0 never buys |
| `growth_awareness` | Weight on observed H growth g in τ = −ln(1 − g·τ_s)/g |
| `reinvest_mined` | May spend mined DIG in-game |
| `refine_frac` / `sell_frac` | Share of free unrefined DIG refined per day / share of newly refined DIG sold |
| `impatience` | Daily time preference ρ; fast refine if fee < ρ·3 days (smoothed) |
| `op_tolerance` | Keeps machines on down to (1 − tol) × break-even |
| `churn_base`, `exit_dump`, `drawdown_exit` | Daily exit hazard; share of wallet DIG sold on exit; exit after this drawdown from the peak (1 = never) |
| `cosmetic_usd_day` | Cosmetic DIG purchases per wallet per day (USD), 100 % burned |

Types: casual ($150, payback ≤ 180 d, sells 70 %), optimizer ($800, ≤ 270 d, sells 30 %, re-invests),
whale ($60k over 5 accounts, ≤ 150 d, exits after a 50 % drawdown), bot farm ($4k over 50 wallets, sells 100 %,
never re-invests mined DIG), cosmetic spender ($150 + $0.30/day cosmetics), sybil (scenario only:
minimum-size wallets, never buys, self-refers). Speculators are not cohorts (see above).
