"""Daily agent-based model of the DIG (= MOHO) economy (spec v0.2; v0.1 via param_sets/v01.json).

One call to :meth:`Simulation.step` advances one day:

 0. governance: a VRGDA r change decided ≥ 72 h ago takes effect (price-continuous re-anchor)
 1. exogenous: ETH/USD random walk, new cohorts (each fills an energy tank on arrival: 7 days,
    during genesis only until Market Open + 24 h, spec v0.2 §11)
 2. operations: merit-order on/off per (agent type, tier) at the start-of-day price,
    limited by each cohort's prepaid tank → active hashpower H
 3. emission: E = R·δ_d (24 hourly epochs, H > 0), 90 % pro-rata to active DP, 5 % dev,
    5 % treasury minus referral credits (spec §3, §9)
 4. capex planning: machines / outpost levels / replacements by growth-adjusted payback
 5. cosmetics paid from unrefined DIG first (100 % burn)
 6. refinery (closed during genesis): fast (fee 8 %: ½ burn, ½ reserve) or 72 h queue
 7. market (from day 3): cohort sales (type share of refined DIG + DIG needed for energy),
    leavers' dumps, dev sales, speculators, capex/cosmetic DIG buys, buyback of yesterday's
    backlog (capped), then the POL zap of yesterday's POL share
 8. energy tank refills paid in ETH → revenue split buyback/POL/ops (spec §10)
 9. capex settlement: outposts, then machines through the day's VRGDA batch; 80 % of DIG
    spent is burned, 20 % returns to the reserve (spec §6.3)
10. ops cost, churn/exits, market open at the end of day 2 (spec §11), metrics, invariant check,
    weekly governance check (spec §12)

Every token mint (queue finalisation, fast refine, dev withdrawal, market-open LP) passes the
daily mint cap (spec v0.2 §2, T3); what does not fit is deferred to the next day.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from .agents import (
    MIN_WALLETS,
    RETIRE_WALLETS,
    Cohorts,
    PlanContext,
    fast_refine_share,
    merit_order,
    plan_purchases,
)
from .amm import Pool, execute_flows
from .config import (
    T_BOT,
    T_CASUAL,
    T_COSMETIC,
    T_OPTIMIZER,
    T_SYBIL,
    T_WHALE,
    TYPE_NAMES,
    Params,
)
from .emission import daily_emission, decay_lambda, distribute
from .governance import GovernanceRule, VrgdaSchedule
from .metrics import gini_weighted, nakamoto_weighted
from .minting import HOUR0, MintMeter, diurnal_profile, open_day_profile
from .scenarios import Scenario
from .vrgda import (
    day_cost,
    outpost_capacity_kw,
    outpost_slots,
    price_index,
    unit_price,
    units_for_budget,
)

SERIES: tuple[str, ...] = (
    "price_usd", "price_eth", "eth_usd", "H", "dp_installed", "wallets", "players", "arrivals",
    "emission", "burn_spend", "burn_cosmetic", "burn_fee", "burn_buyback", "recycled",
    "reserve", "circulating", "pending", "queue", "burned_cum",
    "vrgda_price", "idx", "units_sold", "dig_machines", "dig_outposts",
    "revenue_eth", "revenue_usd", "buyback_eth", "bb_backlog_eth", "pol_eth_added", "lp_fee_eth", "ops_eth",
    "pool_eth", "pool_dig", "depth2_usd", "sold_emission", "refined",
    "sold_wallets", "sold_exits", "sold_dev", "spec_sold", "spec_bought_usd", "player_buy_usd",
    "spec_dig", "treasury_pending", "dev_pending", "dev_dig", "energy_usd", "ops_income_usd", "depth_m",
    "vrgda_r", "mint_daily", "mint_hourly_max", "mint_deferred", "bankrun_mint", "invariant_err",
)


@dataclass
class RunResult:
    series: dict[str, np.ndarray]
    monthly: dict[str, np.ndarray]
    cohorts: dict[str, np.ndarray]
    scalars: dict[str, float]


def _logistic(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


class Simulation:
    def __init__(self, params: Params, scenario: Scenario, seed: int) -> None:
        self.p = params
        self.sc = scenario
        self.rng = np.random.default_rng(seed)
        sp, md = params.spec, params.model
        self.T = sp.machines.n_tiers
        self.days = md.days
        self.co = Cohorts(self.T, sp.queue_days)
        self.lam = decay_lambda(sp.delta_d)
        self.tol = np.array([t.op_tolerance for t in md.types])
        # protocol state
        self.reserve = sp.cap
        self.burned = 0.0
        self.n_sold = 0.0
        self.day = 0
        self.vrgda = VrgdaSchedule(r=sp.r)
        self.gov = GovernanceRule(sp.governance)
        self.mint = MintMeter(self.days, sp.daily_mint_cap)
        self.diurnal = diurnal_profile(md.mint_diurnal_amplitude, md.mint_peak_hour)
        self.open_profile = open_day_profile(md.mint_open_hour_share, self.diurnal)
        self.pool: Pool | None = None
        self.eth_usd = md.eth_usd0
        self.bb_backlog = 0.0
        self.pol_pending = 0.0
        self.ops_eth = 0.0
        # holders outside cohorts (all DIG they hold is circulating supply)
        self.dev_pending = 0.0                      # dev share accrued, not yet withdrawn
        self.dev_queue = np.zeros(sp.queue_days)    # dev withdrawals: standard 72 h queue only (spec §3.3)
        self.dev_dig = 0.0                          # dev wallet (circulating)
        self.treasury_pending = 0.0                 # treasury share minus referral credits; not withdrawn here
        self.accrued_total = 0.0                    # cumulative accrued emission → World Depth (spec §3.4)
        self.spec_dig = 0.0
        self.exited_dig = 0.0                       # kept by players who left
        self.exit_sell = 0.0                        # leavers' DIG to be sold the next day
        self.exit_queue_sell = np.zeros(sp.queue_days)
        self.exit_queue_hold = np.zeros(sp.queue_days)
        # genesis / market open
        self.genesis_purchased_usd = 0.0
        self.genesis_consumed_usd = 0.0
        self.genesis_accrual = 0.0
        self.p0_usd = math.nan
        self.dig_lp = 0.0
        self.pol_eth_open = 0.0
        self.price_ema = math.nan                   # take-profit reference, starts at P0
        # stochastic drivers
        self.arrival_z = 0.0
        self.sentiment_z = 0.0
        self.whale_target_set = False
        F = lambda d: _logistic((d - md.adoption_mid) / md.adoption_width)
        self._adoption_cdf = F
        self._adoption_norm = F(self.days) - F(0.0)
        # records
        self.rec = {name: np.zeros(self.days) for name in SERIES}
        self.rec["price_usd"][:] = np.nan
        self.rec["price_eth"][:] = np.nan
        n_months = self.days // 30
        self.monthly = {name: np.full(n_months, np.nan) for name in ("gini", "nakamoto", "active_wallets")}
        self.sybil = {"accrual": 0.0, "kwh": 0.0, "total_accrual": 0.0, "total_kwh": 0.0, "fair": 0.0,
                          "value_usd": 0.0, "total_value_usd": 0.0}

    # ------------------------------------------------------------------ helpers
    def _price_usd(self) -> float | None:
        """Observable DIG price: AMM spot, or during genesis the running P0 estimate."""
        if self.pool is not None:
            return self.pool.price() * self.eth_usd
        basis = self._genesis_basis_usd()
        return basis / self.genesis_accrual if self.genesis_accrual > 0.0 else None

    def _genesis_basis_usd(self) -> float:
        return self.genesis_purchased_usd if self.p.model.p0_basis == "purchased" else self.genesis_consumed_usd

    def _production_cost_usd(self, d: int) -> float:
        """Observable average cost of mining one DIG: 28-day energy USD / 28-day miner emission."""
        lo = max(d - 28, 0)
        energy = float(self.rec["energy_usd"][lo:d].sum())
        mined = self.p.spec.split_miners * float(self.rec["emission"][lo:d].sum())
        return energy / mined if mined > 0.0 else math.nan

    def _price_signal(self, price_usd: float | None) -> float:
        """−1 … 1: log distance of the price from its 30-day EMA, saturating at ``full_at_ratio``."""
        md = self.p.model
        if not (price_usd and self.price_ema > 0.0):
            return 0.0
        return min(max(math.log(price_usd / self.price_ema) / math.log(md.pr_full_ratio), -1.0), 1.0)

    def _budget_eth(self, usd: float) -> float:
        return usd / self.eth_usd

    def _request_profile(self, day: int) -> np.ndarray:
        """Hourly profile of the refine requests made on ``day`` (see engine/minting.py)."""
        return self.open_profile if day == self.p.spec.genesis_days else self.diurnal

    def _tank_days(self, purchase_day: int, horizon_from: float) -> float:
        """Days of consumption (counted from ``horizon_from``) a tank may hold after a purchase on ``purchase_day``.

        Spec v0.2 §11: a purchase during pre-fill or genesis may last only until Market Open + 24 h.
        """
        sp, md = self.p.spec, self.p.model
        if sp.genesis_tank_hours_after_open <= 0.0 or purchase_day >= sp.genesis_days:
            return md.tank_days
        return min(md.tank_days, sp.genesis_days + sp.genesis_tank_hours_after_open / 24.0 - horizon_from)

    def _vrgda_price(self, d: int) -> float:
        sp = self.p.spec
        t_eff, n_eff = self.vrgda.effective(d, self.n_sold)
        return max(unit_price(t_eff, n_eff, sp.p0, sp.k, self.vrgda.r), sp.price_floor)

    def _fill_tank_on_arrival(self, i: int, d: int) -> float:
        """New wallets prepay their starter machine's consumption (see ``_tank_days``). Returns ETH paid."""
        sp, co = self.p.spec, self.co
        kwh = self._tank_days(d, d) * 24.0 * float(co.mach[i] @ sp.machines.kw) * co.N[i]
        eth = min(kwh * sp.energy_usd_per_kwh / self.eth_usd, co.opex_left[i])
        co.opex_left[i] -= eth
        co.tank[i] += eth * self.eth_usd / sp.energy_usd_per_kwh
        co.energy_eth_pp[i] += eth / co.N[i]
        return eth

    # ------------------------------------------------------------------ arrivals
    def _arrivals(self, d: int) -> float:
        md, sc, co, rng = self.p.model, self.sc, self.co, self.rng
        mult = sc.arrival_mult(d)
        if d == 0:
            expected = md.genesis_players
        else:
            # logistic adoption wave + a steady discovery tail that grows with awareness F(d)
            F = self._adoption_cdf
            expected = md.wave_players * (F(d) - F(d - 1)) / self._adoption_norm + md.tail_per_day * F(d)
        a = md.arrival_noise_ar
        self.arrival_z = a * self.arrival_z + md.arrival_noise_sigma * math.sqrt(1 - a * a) * rng.standard_normal()
        lam = expected * math.exp(self.arrival_z - 0.5 * md.arrival_noise_sigma**2) * mult
        eth_paid = 0.0
        new_wallets = 0.0
        for name, typ in (("casual", T_CASUAL), ("optimizer", T_OPTIMIZER), ("cosmetic", T_COSMETIC)):
            n = float(rng.poisson(lam * md.type_mix[name]))
            if n > 0:
                agent = md.types[typ]
                i = co.add(typ, d, n, 1.0, n * self._budget_eth(agent.budget_usd), agent, md.referred_share)
                eth_paid += self._fill_tank_on_arrival(i, d)
                new_wallets += n
        for _ in range(rng.poisson(md.whale_rate * mult)):
            agent = md.types[T_WHALE]
            budget = agent.budget_usd * rng.lognormal(-0.125, 0.5)
            acc = float(md.whale_accounts)
            i = co.add(T_WHALE, d, acc, acc, self._budget_eth(budget), agent, md.referred_share)
            eth_paid += self._fill_tank_on_arrival(i, d)
            new_wallets += acc
        for _ in range(rng.poisson(md.bot_rate)):
            agent = md.types[T_BOT]
            w = float(md.bot_wallets)
            i = co.add(T_BOT, d, w, w, self._budget_eth(agent.budget_usd), agent, md.referred_share)
            eth_paid += self._fill_tank_on_arrival(i, d)
            new_wallets += w
        if d == sc.whale_day:
            agent = md.types[T_WHALE]
            acc = float(sc.whale_accounts)
            # target per account so that the whale ends with whale_h_share of (yesterday's H + its own DP)
            h_prev = self.rec["H"][d - 1] if d > 0 else 0.0
            target = sc.whale_h_share / (1.0 - sc.whale_h_share) * h_prev / acc
            i = co.add(T_WHALE, d, acc, acc, self._budget_eth(sc.whale_budget_usd), agent, 0.0,
                       tau_max=np.inf, target_dp_pp=target, exit_day=d + sc.whale_hold_days)
            co.drawdown_exit[i] = 1.0  # the scenario whale leaves on schedule only
            co.churn_base[i] = 0.0
            eth_paid += self._fill_tank_on_arrival(i, d)
            new_wallets += acc
        if d == sc.sybil_day:
            agent = md.types[T_SYBIL]
            w = float(sc.sybil_wallets)
            i = co.add(T_SYBIL, d, w, w, w * self._budget_eth(agent.budget_usd), agent, 1.0, self_ref=True)
            eth_paid += self._fill_tank_on_arrival(i, d)
            new_wallets += w
        self.rec["arrivals"][d] = new_wallets
        return eth_paid

    # ------------------------------------------------------------------ operations
    def _on_fractions(self, d: int, price_usd: float | None, emission: float) -> np.ndarray:
        """(k, T) share of each cohort's machines that should run today."""
        sp, co, k = self.p.spec, self.co, self.co.k
        if d < sp.genesis_days or price_usd is None:
            return np.ones((k, self.T))  # genesis: tanks are prefilled, everyone digs
        typ = co.typ[:k].astype(int)
        weights = co.N[:k, None] * co.mach[:k] * sp.machines.dp[None, :]
        dp_class = np.stack(
            [np.bincount(typ, weights=weights[:, j], minlength=len(TYPE_NAMES)) for j in range(self.T)], axis=1
        )
        cost_dp = sp.energy_usd_per_kwh * 24.0 / sp.machines.eta  # USD per DP-day (spec §5.2)
        threshold = cost_dp[None, :] * (1.0 - self.tol[:, None])
        on_class = merit_order(dp_class, threshold, sp.split_miners * emission * price_usd)
        return on_class[typ]

    # ------------------------------------------------------------------ main step
    def step(self, d: int) -> None:
        sp, md, co, rng, rec = self.p.spec, self.p.model, self.co, self.rng, self.rec
        mc = sp.machines
        self.day = d
        new_r = self.gov.due(d)
        if new_r is not None:
            self.vrgda.set_r(d, self.n_sold, new_r)
        if d > 0:
            self.eth_usd *= math.exp(md.eth_daily_vol * rng.standard_normal())
        revenue_eth = self._arrivals(d)
        if d < sp.genesis_days:
            self.genesis_purchased_usd += revenue_eth * self.eth_usd
        k = co.k
        N = co.N[:k]
        alive = N > MIN_WALLETS
        Ns = np.where(alive, N, 1.0)
        typ = co.typ[:k].astype(int)
        price_usd = self._price_usd()
        spot_eth = self.pool.price() if self.pool is not None else 0.0
        market_open = self.pool is not None

        # 2. operations -------------------------------------------------------------
        e_today = daily_emission(self.reserve, sp.delta_d)
        on = self._on_fractions(d, price_usd, e_today)
        desired_kwh = 24.0 * N * ((co.mach[:k] * on) @ mc.kw)
        run = np.where(desired_kwh > 0.0, np.minimum(1.0, co.tank[:k] / np.where(desired_kwh > 0, desired_kwh, 1.0)), 0.0)
        active_by_tier = N[:, None] * co.mach[:k] * on * run[:, None] * mc.dp[None, :]
        active_dp = active_by_tier.sum(1)
        H = float(active_dp.sum())
        kwh_used = desired_kwh * run
        co.tank[:k] -= kwh_used
        energy_usd = kwh_used * sp.energy_usd_per_kwh
        installed_dp = N * (co.mach[:k] @ mc.dp)

        # 3. emission ---------------------------------------------------------------
        emission = e_today if H > 0.0 else 0.0  # nobody digging → emission stays in the reserve
        miners_total = sp.split_miners * emission
        eligible = co.energy_eth_pp[:k] >= sp.referral_min_energy_eth  # spec §9: invitee spent ≥ 0.003 ETH
        accrual, ref_in, dev_share, treasury_share = distribute(
            emission, active_dp, sp.referral_rate, co.ref_share[:k] * eligible, co.self_ref[:k] > 0.0,
            active_dp * (typ != T_SYBIL), sp.split_miners, sp.split_dev, sp.split_treasury)
        co.pend[:k] += accrual + ref_in
        self.reserve -= emission
        self.dev_pending += dev_share
        self.treasury_pending += treasury_share
        self.accrued_total += emission
        co.mined_pp[:k] += (accrual + ref_in) / Ns
        net_pp = (accrual + ref_in) / Ns  # net DIG mined per wallet today (energy deducted below)
        if d < sp.genesis_days:
            self.genesis_accrual += float(accrual.sum())
            self.genesis_consumed_usd += float(energy_usd.sum())
            price_usd = self._price_usd()  # first accrual makes the genesis estimate observable
        if price_usd:
            co.energy_dig_pp[:k] += energy_usd / price_usd / Ns
            net_pp = net_pp - energy_usd / price_usd / Ns
        self._track_sybil(typ, accrual + ref_in, kwh_used, miners_total, H, price_usd)

        # 4. capex planning ---------------------------------------------------------
        p_unit = self._vrgda_price(d)
        idx = price_index(p_unit, sp.p0, sp.outpost.idx_min, sp.outpost.idx_max)
        energy_dig = (sp.energy_usd_per_kwh * 24.0 / mc.eta / price_usd) if price_usd else np.zeros(self.T)
        h_hist = rec["H"]
        lag = min(7, d)
        g_obs = math.log(H / h_hist[d - lag]) / lag if lag > 0 and H > 0 and h_hist[d - lag] > 0 else 0.0
        ctx = PlanContext(
            p_unit=p_unit, idx=idx, y_dig=miners_total / H if H > 0 else 0.0, energy_dig=energy_dig,
            g_obs=g_obs, lam=self.lam, dig_per_eth=1.0 / spot_eth if market_open else 0.0,
            haircut=md.swap_haircut, iterations=md.purchase_iterations,
        )
        plan = plan_purchases(co, ctx, sp)

        # 5. cosmetics from unrefined DIG first ------------------------------------------
        cosm_need = co.cosmetic_usd[:k] * N / price_usd if price_usd else np.zeros(k)
        cosm_from_pend = np.minimum(cosm_need, np.maximum(co.pend[:k] - plan.reserve_pend, 0.0))
        co.pend[:k] -= cosm_from_pend
        cosm_need -= cosm_from_pend
        burn_cosmetic = float(cosm_from_pend.sum())

        # 6. refinery. Price response: above its EMA wallets take profit (refine, rush and sell
        #    more); below it they hold back part of their sales.
        signal = self._price_signal(price_usd) if market_open else 0.0
        up, down = max(signal, 0.0), max(-signal, 0.0)
        refine_frac = co.refine_frac[:k] + (1.0 - co.refine_frac[:k]) * up
        sell_frac = (co.sell_frac[:k] + (1.0 - co.sell_frac[:k]) * up) * (1.0 - md.pr_hold_strength * down)
        fast_share = fast_refine_share(sp.fast_fee, co.impatience[:k] + up * md.pr_extra_impatience,
                                       sp.queue_days, md.fast_refine_width)
        amount = refine_frac * np.maximum(co.pend[:k] - plan.reserve_pend, 0.0) if market_open else np.zeros(k)
        fast = fast_share * amount
        std = amount - fast
        # mints: finalising matured queue entries, then fast refines; beyond the daily cap they wait
        matured = co.queue[:k, 0].copy()
        matured_ok = matured * self._mint_share(d, float(matured.sum()), self._request_profile(d - sp.queue_days))
        fast *= self._mint_share(d, float(fast.sum()) * (1.0 - sp.fast_fee), self._request_profile(d))
        fee = fast * sp.fast_fee
        amount = std + fast
        co.pend[:k] -= amount
        co.queue[:k, :-1] = co.queue[:k, 1:]
        co.queue[:k, -1] = std
        co.queue[:k, 0] += matured - matured_ok  # not finalised today: retried tomorrow
        wal_in = fast - fee + matured_ok
        co.wal[:k] += wal_in
        burn_fee = float(fee.sum()) * sp.fast_fee_burn_share
        recycled = float(fee.sum()) - burn_fee

        # 7. market -----------------------------------------------------------------------
        free_wal = np.maximum(co.wal[:k] - plan.reserve_wal, 0.0)
        cosm_from_wal = np.minimum(cosm_need, free_wal)
        co.wal[:k] -= cosm_from_wal
        free_wal -= cosm_from_wal
        cosm_need -= cosm_from_wal
        burn_cosmetic += float(cosm_from_wal.sum())

        level = co.lvl[:k]
        tank_cap = sp.tank_cap_hours * outpost_capacity_kw(level, sp.outpost) * N
        refill_kwh = np.clip(np.minimum(self._tank_days(d, d + 1) * desired_kwh, tank_cap) - co.tank[:k], 0.0, None)
        refill_eth = refill_kwh * sp.energy_usd_per_kwh / self.eth_usd

        sell = np.zeros(k)
        cosm_eth = np.zeros(k)
        dev_sell = spec_buy = spec_sell = bb_eth = exit_sell = 0.0
        bought = np.zeros(k)
        pol_added = 0.0
        sold_emission = 0.0
        if market_open:
            sell = np.clip(sell_frac * wal_in, 0.0, free_wal)
            # sell what is needed to keep the energy tank full, if ETH on hand does not cover it
            shortfall = refill_eth - co.eth[:k] - sell * spot_eth * (1.0 - md.amm_fee)
            sell += np.clip(shortfall / spot_eth, 0.0, free_wal - sell)
            cosm_eth = np.minimum(cosm_need * spot_eth / md.swap_haircut, co.opex_left[:k])
            dev_sell = md.dev_sell_frac * self._dev_withdraw()
            spec_buy, spec_sell = self._speculators(d, price_usd)
            # slippage-aware buyers: discretionary buys are capped at a share of the pool's ETH
            discretionary = float(plan.eth_swap.sum() + cosm_eth.sum()) + spec_buy
            cap = md.max_buy_pool_frac * self.pool.eth
            if discretionary > cap:
                scale = cap / discretionary
                plan.eth_swap *= scale
                cosm_eth *= scale
                spec_buy *= scale
            # v1.1: a share of the bucket, in hourly chunks that each move the price at most
            # max_chunk_move (ETH in for a price move m in a constant-product pool: e(sqrt(1+m)-1)).
            chunk_eth = self.pool.eth * (math.sqrt(1.0 + md.max_chunk_move) - 1.0)
            bb_eth = min(self.bb_backlog * md.buyback_bucket_frac, md.keeper_chunks * chunk_eth)
            exit_sell = self._release_exits()
            co.wal[:k] -= sell
            self.dev_dig -= dev_sell
            self.spec_dig -= spec_sell
            eth_in = np.concatenate([plan.eth_swap, cosm_eth, [spec_buy, bb_eth]])
            dig_in = np.concatenate([sell, [exit_sell, dev_sell, spec_sell]])
            dig_out, eth_out = execute_flows(self.pool, eth_in, dig_in, md.amm_rounds)
            bought = dig_out[:k]
            co.wal[:k] += bought
            burn_cosmetic += float(dig_out[k: 2 * k].sum())
            self.spec_dig += float(dig_out[2 * k])
            burn_buyback = float(dig_out[2 * k + 1])
            co.eth[:k] += eth_out[:k]
            co.capex_left[:k] -= plan.eth_swap
            co.opex_left[:k] -= cosm_eth
            self.bb_backlog -= bb_eth
            # v1.1: a share of the POL bucket per day; a zap swaps half, so twice the chunk.
            pol_added = min(self.pol_pending * md.pol_bucket_frac, 2 * md.keeper_chunks * chunk_eth)
            self.pool.zap_eth(pol_added)
            self.pol_pending -= pol_added
            # The day's swap fees leave the position (AI-8): DIG fees burned, ETH fees to buyback.
            fee_eth, fee_dig = self.pool.collect_fees()
            self.bb_backlog += fee_eth
            burn_fee += fee_dig
            rec["lp_fee_eth"][d] = fee_eth
            sold_emission = float(sell.sum()) + exit_sell + dev_sell
            rec["sold_wallets"][d] = float(sell.sum())
            rec["sold_exits"][d] = exit_sell
            rec["sold_dev"][d] = dev_sell
            rec["spec_sold"][d] = spec_sell
            rec["spec_bought_usd"][d] = spec_buy * self.eth_usd
            rec["player_buy_usd"][d] = float(plan.eth_swap.sum() + cosm_eth.sum()) * self.eth_usd
        else:
            burn_buyback = 0.0
        self.burned += burn_cosmetic * sp.cosmetic_burn_share + burn_fee + burn_buyback
        recycled += burn_cosmetic * (1.0 - sp.cosmetic_burn_share)

        # 8. energy refills (ETH revenue) -------------------------------------------------------
        from_eth = np.minimum(refill_eth, co.eth[:k])
        co.eth[:k] -= from_eth
        rest = refill_eth - from_eth
        from_opex = np.minimum(rest, co.opex_left[:k])
        co.opex_left[:k] -= from_opex
        from_capex = np.minimum(rest - from_opex, co.capex_left[:k])
        co.capex_left[:k] -= from_capex
        paid = from_eth + from_opex + from_capex
        co.tank[:k] += paid * self.eth_usd / sp.energy_usd_per_kwh
        co.energy_eth_pp[:k] += paid / Ns
        revenue_eth += float(paid.sum())
        if d < sp.genesis_days:
            self.genesis_purchased_usd += float(paid.sum()) * self.eth_usd

        # 9. capex settlement ------------------------------------------------------------------
        dig_machines, dig_outposts, units, spent_c = self._settle(d, plan, bought, p_unit)
        spent = dig_machines + dig_outposts
        self.burned += spent * sp.burn_share
        recycled += spent * (1.0 - sp.burn_share)
        self.reserve += recycled

        # 10. revenue routing, ops, churn, market open ---------------------------------------
        genesis = d < sp.genesis_days
        self.bb_backlog += (sp.genesis_rev_buyback if genesis else sp.rev_buyback) * revenue_eth
        self.pol_pending += (sp.genesis_rev_pol if genesis else sp.rev_pol) * revenue_eth
        ops_share = sp.genesis_rev_ops if genesis else sp.rev_ops
        self.ops_eth += ops_share * revenue_eth - md.ops_monthly_usd / 30.0 / self.eth_usd
        close_usd = price_usd
        if market_open:
            close_usd = self.pool.price() * self.eth_usd
            self.price_ema += (close_usd - self.price_ema) * 2.0 / (md.pr_ema_days + 1.0)
            exit_burn, exit_recycled = self._churn(d, close_usd, active_dp, installed_dp)
            burn_fee += exit_burn
            recycled += exit_recycled
        if d == sp.genesis_days - 1:
            self._open_market()

        self._payback(d, spent_c / Ns, net_pp)

        self._record(d, H, installed_dp, emission, burn_cosmetic, burn_fee, burn_buyback, recycled,
                     p_unit, idx, units, dig_machines, dig_outposts, revenue_eth, bb_eth, pol_added,
                     sold_emission, float(amount.sum()), float(energy_usd.sum()), close_usd, active_dp)
        if market_open and (d - sp.genesis_days) % 7 == 6:
            self._governance_week(d)
        if d % 30 == 29:
            co.compact()

    # ------------------------------------------------------------------ sub-steps
    def _speculators(self, d: int, price_usd: float) -> tuple[float, float]:
        """Aggregate non-mining traders: move ``speed`` per day toward a target position.

        target (USD) = usd_per_player × active players × sentiment × momentum × value × scenario shock,
        sentiment = exp(AR(1) noise), momentum = clip(1 + m·(14-day return), 0.5, 1.5),
        value = clip(production cost / price, lo, hi)^ε (cheap vs. mining cost → hold more).
        Returns (ETH spent buying, DIG sold).
        """
        md, rng = self.p.model, self.rng
        self.sentiment_z = md.spec_ar * self.sentiment_z + md.spec_sigma * rng.standard_normal()
        past = self.rec["price_usd"][d - 14] if d >= 14 else math.nan
        ret = price_usd / past - 1.0 if past > 0 else 0.0
        momentum = min(max(1.0 + md.spec_momentum * ret, 0.5), 1.5)
        cost = self._production_cost_usd(d)
        lo, hi = md.spec_value_clip
        value = min(max(cost / price_usd, lo), hi) ** md.spec_value_elasticity if cost > 0 else 1.0
        target = (md.spec_usd_per_player * self._players() * math.exp(self.sentiment_z) * momentum * value
                  * self.sc.speculator_mult(d))
        trade = md.spec_speed * (target - self.spec_dig * price_usd)
        if trade >= 0.0:
            return trade / self.eth_usd, 0.0
        return 0.0, min(-trade / price_usd, self.spec_dig)

    def _players(self) -> float:
        co, k = self.co, self.co.k
        human = co.typ[:k] != T_SYBIL
        return float((co.N[:k][human] / co.entity_wallets[:k][human]).sum())

    def _dev_withdraw(self) -> float:
        """Dev share: everything accrued enters the 72 h standard queue (no fast path, spec §3.3).

        Returns the DIG that matured into the dev wallet today.
        """
        matured = self.dev_queue[0]
        granted = self.mint.allow(self.day, matured, HOUR0)
        self.dev_queue = np.append(self.dev_queue[1:], self.dev_pending)
        self.dev_queue[0] += matured - granted  # beyond the daily mint cap: finalised tomorrow
        self.dev_pending = 0.0
        self.dev_dig += granted
        return granted

    def _release_exits(self) -> float:
        """Leavers' DIG reaching the market today: yesterday's exits plus matured exit-queue entries."""
        sell0, hold0 = self.exit_queue_sell[0], self.exit_queue_hold[0]
        share = self._mint_share(self.day, sell0 + hold0, self._request_profile(self.day - self.p.spec.queue_days))
        out = self.exit_sell + sell0 * share
        self.exited_dig += hold0 * share
        self.exit_queue_sell = np.append(self.exit_queue_sell[1:], 0.0)
        self.exit_queue_hold = np.append(self.exit_queue_hold[1:], 0.0)
        self.exit_queue_sell[0] += sell0 * (1.0 - share)  # beyond the daily mint cap: finalised tomorrow
        self.exit_queue_hold[0] += hold0 * (1.0 - share)
        self.exit_sell = 0.0
        return out

    def _settle(self, d: int, plan, bought: np.ndarray, p_unit: float) -> tuple[float, float, float, np.ndarray]:
        """Pay for today's outposts and machines.

        Returns (DIG on machines, DIG on outposts, DP units, DIG spent per cohort).
        """
        sp, co, k = self.p.spec, self.co, self.co.k
        mc, op = sp.machines, sp.outpost
        N = co.N[:k]
        Ns = np.where(N > MIN_WALLETS, N, 1.0)
        credit = co.credit[:k] + plan.credit_gen
        funds = credit + plan.reserve_pend + plan.reserve_wal + bought

        # outposts first, all-or-nothing per cohort
        up_ok = funds >= plan.up_dig * (1.0 - 1e-12)
        up_paid = np.where(up_ok, plan.up_dig, 0.0)
        co.lvl[:k] += np.where(up_ok, plan.levels, 0.0)
        funds -= up_paid

        # machines: scale by funds, then by remaining slots / kW after scrapping
        co.mach[:k] -= plan.scrap
        cost_m = p_unit * mc.dp * (1.0 + mc.premium)
        mach_need = plan.mach_dig.sum(1)
        scale = np.where(mach_need > 0.0, np.minimum(1.0, funds / np.where(mach_need > 0, mach_need, 1.0)), 0.0)
        q = plan.mach_q * scale[:, None]
        slots_room = outpost_slots(co.lvl[:k], op) - co.mach[:k].sum(1)
        kw_room = outpost_capacity_kw(co.lvl[:k], op) - co.mach[:k] @ mc.kw
        q_slots, q_kw = q.sum(1), q @ mc.kw
        fit = np.minimum(1.0, np.minimum(
            np.where(q_slots > 0, np.maximum(slots_room, 0.0) / np.where(q_slots > 0, q_slots, 1.0), 1.0),
            np.where(q_kw > 0, np.maximum(kw_room, 0.0) / np.where(q_kw > 0, q_kw, 1.0), 1.0)))
        q *= fit[:, None]
        units_planned = float((q * N[:, None] * mc.dp[None, :]).sum())
        mach_paid = np.zeros(k)
        units = 0.0
        if units_planned > 0.0:
            budget = (q * N[:, None] * cost_m[None, :]).sum(1)  # at the start-of-day price
            t_eff, n_eff = self.vrgda.effective(d, self.n_sold)
            units = units_for_budget(t_eff, n_eff, p_unit * units_planned, sp.p0, sp.k, self.vrgda.r, sp.price_floor)
            if units >= units_planned:  # intra-day decay made it cheaper: buy the plan, pay less
                units = units_planned
                cost = day_cost(t_eff, n_eff, units, sp.p0, sp.k, self.vrgda.r, sp.price_floor)
                mach_paid = budget * cost / (p_unit * units_planned)
            else:  # the batch pushed the price up: same DIG, fewer machines
                q *= units / units_planned
                mach_paid = budget
            co.mach[:k] += q
            self.n_sold += units

        # pay: scrap credit, then unrefined DIG, then wallet
        total = up_paid + mach_paid
        from_credit = np.minimum(total, credit)
        co.credit[:k] = credit - from_credit
        dig = total - from_credit
        from_pend = np.minimum(dig, plan.reserve_pend)
        co.pend[:k] -= from_pend
        co.wal[:k] -= dig - from_pend
        co.capex_pp[:k] += dig / Ns
        dig_total = float(dig.sum())
        dig_out = float(np.minimum(up_paid, dig).sum())  # outposts are paid first from the DIG part
        return dig_total - dig_out, dig_out, units, dig

    def _payback(self, d: int, spent_pp: np.ndarray, net_pp: np.ndarray) -> None:
        """DIG-terms payback per wallet, two definitions (see metrics.py).

        cash  — first day cumulative net mining ≥ cumulative DIG capex (reinvestment counts as capex);
        entry — the DIG spent in the first ``payback_entry_days`` is recovered by the share of net
                mining attributable to the DP owned at the end of that window (DP-proportional).
        """
        co, k, mc = self.co, self.co.k, self.p.spec.machines
        age = d - co.join[:k]
        cash_net = co.mined_pp[:k] - co.energy_dig_pp[:k]
        newly = np.isnan(co.payback_cash_day[:k]) & (co.capex_pp[:k] > 0.0) & (cash_net >= co.capex_pp[:k])
        co.payback_cash_day[:k][newly] = age[newly]
        in_window = age < self.p.model.payback_entry_days
        dp_pp = co.mach[:k] @ mc.dp
        co.entry_capex_pp[:k] += np.where(in_window, spent_pp, 0.0)
        co.entry_dp_pp[:k] = np.where(in_window, dp_pp, co.entry_dp_pp[:k])
        share = np.where(dp_pp > 0.0, np.minimum(1.0, co.entry_dp_pp[:k] / np.where(dp_pp > 0, dp_pp, 1.0)), 0.0)
        co.entry_net_pp[:k] += net_pp * share
        newly = (np.isnan(co.payback_entry_day[:k]) & ~in_window & (co.entry_capex_pp[:k] > 0.0)
                 & (co.entry_net_pp[:k] >= co.entry_capex_pp[:k]))
        co.payback_entry_day[:k][newly] = age[newly]

    def _churn(self, d: int, price_usd: float, active_dp: np.ndarray, installed_dp: np.ndarray) -> tuple[float, float]:
        """Remove leaving wallets; their DIG goes to the exit pipeline. Returns (fee burned, fee recycled)."""
        sp, md, co, k = self.p.spec, self.p.model, self.co, self.co.k
        N = co.N[:k]
        co.peak_price[:k] = np.maximum(co.peak_price[:k], price_usd)
        with np.errstate(divide="ignore", invalid="ignore"):
            active_share = np.where(installed_dp > 0, active_dp / np.where(installed_dp > 0, installed_dp, 1.0), 1.0)
        hazard = co.churn_base[:k] * (1.0 + md.churn_loss_mult * (active_share < 0.5))
        drawdown = price_usd < (1.0 - co.drawdown_exit[:k]) * co.peak_price[:k]
        forced = d >= co.exit_day[:k]
        f = np.where(drawdown | forced, 1.0, np.minimum(hazard, 1.0)) * (N > MIN_WALLETS)
        f = np.where((N > MIN_WALLETS) & (N * (1.0 - f) < RETIRE_WALLETS), 1.0, f)  # < ½ wallet left → gone
        if not f.any():
            return 0.0, 0.0
        fast_share = fast_refine_share(sp.fast_fee, co.impatience[:k], sp.queue_days, md.fast_refine_width)
        pend_x = f * co.pend[:k]
        co.pend[:k] -= pend_x
        fast = fast_share * pend_x
        fast *= self._mint_share(d, float(fast.sum()) * (1.0 - sp.fast_fee), self._request_profile(d))
        fee = fast * sp.fast_fee
        fee_burn = float(fee.sum()) * sp.fast_fee_burn_share
        fee_recycled = float(fee.sum()) - fee_burn
        self.burned += fee_burn
        self.reserve += fee_recycled
        queue_x = f[:, None] * co.queue[:k]
        co.queue[:k] -= queue_x
        queue_x[:, -1] += pend_x - fast  # standard-refined part joins the leavers' queue
        wal_x = f * co.wal[:k]
        co.wal[:k] -= wal_x
        wal_x += fast - fee
        dump = co.exit_dump[:k]
        self.exit_sell += float((dump * wal_x).sum())
        self.exited_dig += float(((1.0 - dump) * wal_x).sum())
        self.exit_queue_sell += (dump[:, None] * queue_x).sum(0)
        self.exit_queue_hold += ((1.0 - dump)[:, None] * queue_x).sum(0)
        keep = 1.0 - f
        for name in ("eth", "capex_left", "opex_left", "tank", "credit"):
            getattr(co, name)[:k] *= keep  # leavers take their ETH; tanks and credits are forfeited
        co.N[:k] = np.where(f >= 1.0, 0.0, co.N[:k] * keep)
        return fee_burn, fee_recycled

    def _mint_share(self, day: int, amount: float, profile: np.ndarray) -> float:
        """Share of a requested mint that fits under today's cap (the rest is deferred)."""
        if amount <= 0.0:
            return 1.0
        return self.mint.allow(day, amount, profile) / amount

    def _governance_week(self, d: int) -> None:
        """Spec v0.2 §12: weekly SR and mean p(t,n)/p0 feed the r-adjustment rule."""
        r, w = self.rec, slice(d - 6, d + 1)
        emitted = float(r["emission"][w].sum())
        sinks = float((r["burn_spend"] + r["burn_cosmetic"] + r["burn_fee"] + r["burn_buyback"] + r["recycled"])[w].sum())
        sr = sinks / emitted if emitted > 0 else math.inf
        self.gov.weekly(d, self.vrgda.r, sr, float(r["vrgda_price"][w].mean()) / self.p.spec.p0)

    def _open_market(self) -> None:
        """Spec §11: P0 = genesis energy USD / genesis miner accrual; DIG_LP minted from the reserve."""
        sp, md = self.p.spec, self.p.model
        self.p0_usd = self._genesis_basis_usd() / self.genesis_accrual
        self.pol_eth_open = self.pol_pending
        self.dig_lp = min(self.pol_eth_open * self.eth_usd / self.p0_usd, sp.dig_lp_cap)
        # the LP is minted in the first hour of the market (hour 0 of day ``genesis_days``)
        if self.mint.allow(sp.genesis_days, self.dig_lp, HOUR0) < self.dig_lp:
            raise ValueError("daily_mint_cap is below the market-open LP mint")
        self.reserve -= self.dig_lp
        self.pool = Pool.create(self.pol_eth_open, self.dig_lp, md.amm_fee)
        self.pol_pending = 0.0
        self.price_ema = self.pool.price() * self.eth_usd

    def _track_sybil(self, typ: np.ndarray, accrual: np.ndarray, kwh: np.ndarray, miners_total: float,
                     H: float, price_usd: float | None) -> None:
        """Sybil-neutrality bookkeeping (spec §5.2, §13).

        ``fair`` is what the sybil's kWh would have earned as ordinary augers on the same day
        (y·η_auger/24 DIG per kWh, no referral), so accrual/fair isolates what splitting adds.
        """
        s, sp = self.sybil, self.p.spec
        is_sybil = typ == T_SYBIL
        syb_acc, syb_kwh = float(accrual[is_sybil].sum()), float(kwh[is_sybil].sum())
        s["accrual"] += syb_acc
        s["kwh"] += syb_kwh
        s["total_accrual"] += float(accrual.sum())
        s["total_kwh"] += float(kwh.sum())
        if H > 0.0:
            s["fair"] += syb_kwh * miners_total * sp.machines.eta[0] / (24.0 * H)
        if price_usd:
            s["value_usd"] += syb_acc * price_usd
            s["total_value_usd"] += float(accrual.sum()) * price_usd

    def _record(self, d, H, installed_dp, emission, burn_cosmetic, burn_fee, burn_buyback, recycled,
                p_unit, idx, units, dig_machines, dig_outposts, revenue_eth, bb_eth, pol_added,
                sold_emission, refined, energy_usd, close_usd, active_dp) -> None:
        sp, co, k, r = self.p.spec, self.co, self.co.k, self.rec
        N = co.N[:k]
        if self.pool is not None:
            r["price_eth"][d] = self.pool.price()
            r["price_usd"][d] = r["price_eth"][d] * self.eth_usd
            r["pool_eth"][d] = self.pool.eth
            r["pool_dig"][d] = self.pool.dig
            r["depth2_usd"][d] = self.pool.eth_to_move_price(0.02) * self.eth_usd
        r["eth_usd"][d] = self.eth_usd
        r["H"][d] = H
        r["dp_installed"][d] = float(installed_dp.sum())
        r["wallets"][d] = float(N.sum())
        r["players"][d] = self._players()
        r["emission"][d] = emission
        r["burn_spend"][d] = (dig_machines + dig_outposts) * sp.burn_share
        r["burn_cosmetic"][d] = burn_cosmetic * sp.cosmetic_burn_share
        r["burn_fee"][d] = burn_fee
        r["burn_buyback"][d] = burn_buyback
        r["recycled"][d] = recycled
        r["reserve"][d] = self.reserve
        pending_players = float(co.pend[:k].sum())
        pending = pending_players
        queue = float(co.queue[:k].sum()) + float(self.exit_queue_sell.sum() + self.exit_queue_hold.sum())
        pending += self.dev_pending + self.treasury_pending
        queue += float(self.dev_queue.sum())
        circulating = (float(co.wal[:k].sum()) + (self.pool.dig if self.pool else 0.0) + self.dev_dig
                       + self.spec_dig + self.exited_dig + self.exit_sell)
        r["circulating"][d] = circulating
        r["pending"][d] = pending
        r["queue"][d] = queue
        r["burned_cum"][d] = self.burned
        r["vrgda_price"][d] = p_unit
        r["idx"][d] = idx
        r["units_sold"][d] = units
        r["dig_machines"][d] = dig_machines
        r["dig_outposts"][d] = dig_outposts
        r["revenue_eth"][d] = revenue_eth
        r["revenue_usd"][d] = revenue_eth * self.eth_usd
        r["buyback_eth"][d] = bb_eth
        r["bb_backlog_eth"][d] = self.bb_backlog
        r["pol_eth_added"][d] = pol_added
        r["ops_eth"][d] = self.ops_eth
        ops_share = sp.genesis_rev_ops if d < sp.genesis_days else sp.rev_ops
        r["ops_income_usd"][d] = ops_share * revenue_eth * self.eth_usd
        r["sold_emission"][d] = sold_emission
        r["refined"][d] = refined
        r["spec_dig"][d] = self.spec_dig
        r["treasury_pending"][d] = self.treasury_pending
        r["dev_pending"][d] = self.dev_pending
        r["dev_dig"][d] = self.dev_dig
        r["depth_m"][d] = self.accrued_total / 1000.0
        r["vrgda_r"][d] = self.vrgda.r
        r["mint_deferred"][d] = self.mint.deferred[d]
        r["bankrun_mint"][d] = pending_players * (1.0 - sp.fast_fee)  # everyone fast-refines at once
        r["energy_usd"][d] = energy_usd
        r["invariant_err"][d] = circulating + pending + queue + self.reserve + self.burned - sp.cap
        if d % 30 == 29 and d // 30 < len(self.monthly["gini"]):
            per_wallet = np.where(N > MIN_WALLETS, active_dp / np.where(N > MIN_WALLETS, N, 1.0), 0.0)
            mask = (N > MIN_WALLETS) & (per_wallet > 0)
            m = d // 30
            self.monthly["gini"][m] = gini_weighted(per_wallet[mask], N[mask])
            self.monthly["nakamoto"][m] = nakamoto_weighted(per_wallet[mask], N[mask])
            self.monthly["active_wallets"][m] = float(N[mask].sum())

    # ------------------------------------------------------------------ run
    def run(self) -> RunResult:
        for d in range(self.days):
            self.step(d)
        hourly = self.mint.hourly[: self.days]
        self.rec["mint_daily"][:] = hourly.sum(1)
        self.rec["mint_hourly_max"][:] = hourly.max(1)
        cohorts = self.co.records()
        scalars = {
            "p0_usd": self.p0_usd, "dig_lp": self.dig_lp, "pol_eth_open": self.pol_eth_open,
            "genesis_accrual": self.genesis_accrual, "genesis_purchased_usd": self.genesis_purchased_usd,
            "genesis_consumed_usd": self.genesis_consumed_usd,
            **{f"sybil_{key}": value for key, value in self.sybil.items()},
        }
        return RunResult(series=self.rec, monthly=self.monthly, cohorts=cohorts, scalars=scalars)
