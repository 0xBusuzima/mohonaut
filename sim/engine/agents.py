"""Cohort-based agents (spec §13) and their decision rules.

A cohort is a group of identical wallets of one agent type that joined on the same
day (whales, bot farms and the sybil operator are single cohorts of several wallets).
Machine counts and the outpost level are stored *per wallet*; balances (DIG, ETH,
energy tank) are cohort totals. Machine counts are continuous: 0.3 machines per
wallet means 30 % of the cohort's wallets bought one.

Every rule below uses only state a player can observe on-chain or in the UI:
emission E, active hashpower H and its recent growth, the VRGDA price, the AMM spot
price, the energy price and ETH/USD.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .config import AgentType, Spec
from .vrgda import outpost_capacity_kw, outpost_cumulative_cost, outpost_upgrade_cost

MIN_WALLETS = 1e-6   # cohorts below this many wallets are treated as gone
RETIRE_WALLETS = 0.5  # a cohort with less than half a wallet left exits completely
MIN_FILL = 0.05      # smallest per-wallet machine purchase considered (5 % of the cohort buys one)


class Cohorts:
    """Struct-of-arrays store. Active cohorts are the prefix ``[:k]`` (creation order)."""

    SCALARS = (
        "typ", "join", "N", "N0", "entity_wallets",
        "capex_left", "capex_daily", "opex_left", "eth", "tank", "pend", "wal", "credit", "lvl",
        "energy_eth_pp", "ref_share", "self_ref",
        "mined_pp", "capex_pp", "energy_dig_pp", "payback_cash_day",
        "entry_capex_pp", "entry_dp_pp", "entry_net_pp", "payback_entry_day",
        "peak_price", "exit_day", "target_dp_pp",
        # behaviour copied from the agent type (scenario agents may override)
        "tau_max", "growth_aw", "reinvest", "refine_frac", "sell_frac", "impatience",
        "churn_base", "exit_dump", "drawdown_exit", "cosmetic_usd",
    )

    # final per-cohort values kept for the results when a cohort is retired
    ARCHIVED = ("join", "typ", "N0", "N", "capex_pp", "payback_cash_day", "payback_entry_day",
                "entry_capex_pp", "mined_pp", "energy_dig_pp", "lvl")

    def __init__(self, n_tiers: int, queue_days: int, capacity: int = 1024) -> None:
        self.k = 0
        self.n_tiers = n_tiers
        self.queue_days = queue_days
        self._capacity = 0
        self._grow(capacity)
        self.archive: dict[str, list[np.ndarray]] = {name: [] for name in self.ARCHIVED}

    def compact(self) -> None:
        """Drop cohorts whose wallets have all left (N == 0); their final records are archived."""
        k = self.k
        dead = self.N[:k] <= 0.0
        if not dead.any():
            return
        for name in self.ARCHIVED:
            self.archive[name].append(getattr(self, name)[:k][dead].copy())
        keep = ~dead
        k2 = int(keep.sum())
        for name in (*self.SCALARS, "mach", "queue"):
            arr = getattr(self, name)
            arr[:k2] = arr[:k][keep]
        self.k = k2

    def records(self) -> dict[str, np.ndarray]:
        """Final values of every cohort ever created (retired and active)."""
        return {name: np.concatenate([*self.archive[name], getattr(self, name)[: self.k]]) for name in self.ARCHIVED}

    def _grow(self, capacity: int) -> None:
        def resized(old: np.ndarray | None, shape: tuple[int, ...]) -> np.ndarray:
            new = np.zeros(shape)
            if old is not None:
                new[: self._capacity] = old[: self._capacity]
            return new

        for name in self.SCALARS:
            setattr(self, name, resized(getattr(self, name, None), (capacity,)))
        self.mach = resized(getattr(self, "mach", None), (capacity, self.n_tiers))
        self.queue = resized(getattr(self, "queue", None), (capacity, self.queue_days))
        self._capacity = capacity

    def add(self, typ: int, day: int, wallets: float, entity_wallets: float, budget_eth: float,
            agent: AgentType, ref_share: float, self_ref: bool = False,
            tau_max: float | None = None, target_dp_pp: float = np.inf, exit_day: float = np.inf) -> int:
        """Create a cohort of ``wallets`` fresh accounts: outpost L1 + one free Hand Auger each."""
        if self.k == self._capacity:
            self._grow(2 * self._capacity)
        i = self.k
        self.k += 1
        capex = agent.capex_share * budget_eth
        values = {
            "typ": typ, "join": day, "N": wallets, "N0": wallets, "entity_wallets": entity_wallets,
            "capex_left": capex, "capex_daily": capex / max(agent.capex_days, 1e-9),
            "opex_left": budget_eth - capex, "eth": 0.0, "tank": 0.0, "pend": 0.0, "wal": 0.0, "credit": 0.0, "lvl": 1.0,
            "energy_eth_pp": 0.0, "ref_share": ref_share, "self_ref": float(self_ref),
            "mined_pp": 0.0, "capex_pp": 0.0, "energy_dig_pp": 0.0, "payback_cash_day": np.nan,
            "entry_capex_pp": 0.0, "entry_dp_pp": 0.0, "entry_net_pp": 0.0, "payback_entry_day": np.nan,
            "peak_price": 0.0, "exit_day": exit_day, "target_dp_pp": target_dp_pp,
            "tau_max": agent.tau_max if tau_max is None else tau_max,
            "growth_aw": agent.growth_awareness, "reinvest": float(agent.reinvest_mined),
            "refine_frac": agent.refine_frac, "sell_frac": agent.sell_frac, "impatience": agent.impatience,
            "churn_base": agent.churn_base, "exit_dump": agent.exit_dump, "drawdown_exit": agent.drawdown_exit,
            "cosmetic_usd": agent.cosmetic_usd_day,
        }
        for name, value in values.items():
            getattr(self, name)[i] = value
        self.mach[i] = 0.0
        self.mach[i, 0] = 1.0  # the free starter machine (spec §6.1, one per account)
        self.queue[i] = 0.0
        return i


# --- Decision rules ---------------------------------------------------------------------

def static_payback(cost: np.ndarray, net: np.ndarray) -> np.ndarray:
    """τ_static = C / (r − m); ∞ when the net DIG income is not positive."""
    with np.errstate(divide="ignore", invalid="ignore"):
        return np.where(net > 0.0, cost / np.where(net > 0.0, net, 1.0), np.inf)


def growth_payback(tau_static: np.ndarray, g: np.ndarray) -> np.ndarray:
    """Growth-adjusted payback (research basis): τ = −ln(1 − g·τ_s)/g; never if g·τ_s ≥ 1.

    With H(t) = H0·e^{gt} the machine's income decays like e^{−gt}, so its lifetime
    income is capped at r0/g. ``g`` already includes the emission decay λ (g → g + λ).
    """
    x = g * tau_static
    with np.errstate(divide="ignore", invalid="ignore"):
        tau = -np.log1p(-np.minimum(x, 1.0 - 1e-15)) / g
    return np.where(x < 1.0, tau, np.inf)


def fast_refine_share(fee: float, impatience: np.ndarray, queue_days: int, width: float) -> np.ndarray:
    """Share of refined DIG that takes the fast path.

    A wallet with daily time preference ρ values the 72 h wait at ≈ ρ·queue_days of the
    amount; it prefers paying the fee when that exceeds the fee. A logistic of width
    ``width`` smooths the choice across wallets.
    """
    return 1.0 / (1.0 + np.exp((fee - impatience * queue_days) / width))


def merit_order(dp: np.ndarray, threshold: np.ndarray, revenue: float) -> np.ndarray:
    """Share of each class that runs, given installed DP and break-even costs (spec §5.2).

    All running DP earns y = revenue / H (USD per DP-day). Classes switch on in order of
    increasing break-even cost while y ≥ cost; the marginal class runs partially so that
    y equals its cost (free-entry equilibrium H*). Returns values in [0, 1] shaped like ``dp``.
    """
    flat_dp, flat_th = dp.ravel(), threshold.ravel()
    order = np.argsort(flat_th, kind="stable")
    d, th = flat_dp[order], flat_th[order]
    cum = np.cumsum(d)
    with np.errstate(divide="ignore"):
        y_full = np.where(cum > 0.0, revenue / np.where(cum > 0.0, cum, 1.0), np.inf)
    full = y_full >= th  # True-prefix: y_full is non-increasing, th non-decreasing
    on = np.zeros_like(d)
    n_full = len(full) if full.all() else int(np.argmin(full))
    on[:n_full] = 1.0
    if n_full < len(d) and d[n_full] > 0.0:
        prev = cum[n_full - 1] if n_full > 0 else 0.0
        on[n_full] = np.clip((revenue / th[n_full] - prev) / d[n_full], 0.0, 1.0)
    out = np.empty_like(on)
    out[order] = on
    return out.reshape(dp.shape)


@dataclass(frozen=True)
class PlanContext:
    p_unit: float            # VRGDA unit price p(t, n) at the start of the day (DIG/DP)
    idx: float               # outpost price index
    y_dig: float             # DIG per active DP per day paid to miners (0.9·E/H)
    energy_dig: np.ndarray   # (tiers,) energy cost per DP-day in DIG at the current price
    g_obs: float             # observed growth rate of H (per day)
    lam: float               # emission decay rate λ (per day)
    dig_per_eth: float       # AMM spot (0 before the market opens)
    haircut: float           # expected slippage when converting ETH to DIG
    iterations: int


@dataclass
class Plan:
    """Purchases a cohort intends to make today (settled after the market step)."""
    mach_q: np.ndarray      # (k, T) machines per wallet
    mach_dig: np.ndarray    # (k, T) cohort DIG budget at the start-of-day price
    scrap: np.ndarray       # (k, T) machines per wallet scrapped (replacements)
    credit_gen: np.ndarray  # (k,) scrap credit generated (cohort total)
    levels: np.ndarray      # (k,) outpost levels per wallet
    up_dig: np.ndarray      # (k,) cohort DIG for outpost upgrades
    eth_swap: np.ndarray    # (k,) ETH to swap into DIG today
    reserve_pend: np.ndarray = field(default_factory=lambda: np.zeros(0))  # DIG kept unrefined for it
    reserve_wal: np.ndarray = field(default_factory=lambda: np.zeros(0))   # wallet DIG kept unsold for it


def plan_purchases(co: Cohorts, ctx: PlanContext, spec: Spec) -> Plan:
    """Each cohort repeatedly picks the capex action with the shortest payback.

    Candidate actions per wallet:
      fill    — buy machines of one unlocked tier into free slots/kW;
      upgrade — climb toward the level that unlocks a tier and fill the room it creates
                (payback of the whole path; one level is bought per action);
      replace — scrap the worst machine (20 % scrap credit) for a better tier when slots are full.
    Actions are ranked by static payback (the growth-adjusted τ is monotone in it) and
    executed while the growth-adjusted payback is ≤ the type's ``tau_max`` and the wallet
    can afford it from reinvestable DIG, scrap credit and today's capex ETH.
    """
    k, mc, op = co.k, spec.machines, spec.outpost
    T = mc.n_tiers
    tiers = np.arange(T)
    N = co.N[:k]
    alive = N > MIN_WALLETS
    Ns = np.where(alive, N, 1.0)
    m = co.mach[:k].copy()
    L = co.lvl[:k].copy()
    reinvest = co.reinvest[:k]

    pend = np.maximum(co.pend[:k], 0.0)  # balances can carry −1e-12 float dust
    own_dig = reinvest * (pend + np.maximum(co.wal[:k], 0.0))
    eth_cap = np.minimum(co.capex_left[:k], co.capex_daily[:k]) if ctx.dig_per_eth > 0.0 else np.zeros(k)
    avail = (own_dig + co.credit[:k] + eth_cap * ctx.dig_per_eth * ctx.haircut) / Ns

    cost_m = ctx.p_unit * mc.dp * (1.0 + mc.premium)
    net_m = mc.dp * (ctx.y_dig - ctx.energy_dig)
    ts_m = static_payback(cost_m, net_m)
    purchasable = tiers >= 1  # tier 0 (Hand Auger) is free, one per account
    g = co.growth_aw[:k] * max(ctx.g_obs, 0.0) + ctx.lam
    tau_max = co.tau_max[:k]
    target = co.target_dp_pp[:k]

    plan = Plan(
        mach_q=np.zeros((k, T)), mach_dig=np.zeros((k, T)), scrap=np.zeros((k, T)),
        credit_gen=np.zeros(k), levels=np.zeros(k), up_dig=np.zeros(k), eth_swap=np.zeros(k),
    )
    # Only cohorts that can act are evaluated; after a round only those that just acted can act again.
    rows = np.flatnonzero(alive & (avail > 0.0) & (tau_max >= 0.0) & (m @ mc.dp < target))
    for _ in range(ctx.iterations):
        if rows.size == 0:
            break
        r = np.arange(rows.size)
        ms, Ls, av = m[rows], L[rows], avail[rows]
        dp_now = ms @ mc.dp
        slots_free = op.slot_base + Ls - ms.sum(1)
        kw_cap = outpost_capacity_kw(Ls, op)
        kw_free = kw_cap - ms @ mc.kw
        unlocked = Ls[:, None] >= mc.unlock_level[None, :]

        # (1) fill free room
        q_fit = np.minimum(slots_free[:, None], kw_free[:, None] / mc.kw[None, :])
        ok_fill = unlocked & purchasable & (q_fit >= MIN_FILL)
        s_fill_all = np.where(ok_fill, ts_m[None, :], np.inf)
        j_fill = s_fill_all.argmin(1)
        s_fill = s_fill_all[r, j_fill]

        # (2) upgrade path: climb to the level that unlocks tier j (≥ 1 level), then fill the new room.
        #     The whole path is costed; executing the action buys the next level only.
        L_t = np.minimum(np.maximum(Ls[:, None] + 1.0, mc.unlock_level[None, :]), op.max_level)
        path_cost = (outpost_cumulative_cost(L_t, op) - outpost_cumulative_cost(Ls, op)[:, None]) * ctx.idx
        q_up = np.minimum(slots_free[:, None] + (L_t - Ls[:, None]),
                          (kw_free[:, None] + outpost_capacity_kw(L_t, op) - kw_cap[:, None]) / mc.kw[None, :])
        ok_up = purchasable & (L_t > Ls[:, None]) & (L_t >= mc.unlock_level[None, :]) & (q_up >= 1.0)
        cost_up = path_cost + q_up * cost_m[None, :]
        s_up_all = np.where(ok_up, static_payback(cost_up, q_up * net_m[None, :]), np.inf)
        j_up = s_up_all.argmin(1)
        s_up = s_up_all[r, j_up]
        up_cost = outpost_upgrade_cost(Ls, ctx.idx, op)

        # (3) replace the worst machine when slots are full
        has = ms >= 1.0
        worst = has.argmax(1)
        credit_r = spec.scrap_credit_rate * mc.dp[worst] * ctx.p_unit
        ok_rep = (unlocked & purchasable & (tiers[None, :] > worst[:, None])
                  & ((kw_free + mc.kw[worst])[:, None] >= mc.kw[None, :])
                  & (has.any(1) & (slots_free < MIN_FILL))[:, None])
        cost_rep = cost_m[None, :] - credit_r[:, None]
        net_rep = net_m[None, :] - np.maximum(net_m[worst], 0.0)[:, None]
        s_rep_all = np.where(ok_rep, static_payback(cost_rep, net_rep), np.inf)
        j_rep = s_rep_all.argmin(1)
        s_rep = s_rep_all[r, j_rep]

        scores = np.stack([s_fill, s_up, s_rep], axis=1)
        action = scores.argmin(1)
        s_best = scores[r, action]
        tau = growth_payback(s_best, g[rows])
        want = np.isfinite(s_best) & (tau <= tau_max[rows]) & (dp_now < target[rows])

        q = np.minimum(q_fit[r, j_fill], av / cost_m[j_fill])
        q = np.minimum(q, (target[rows] - dp_now) / mc.dp[j_fill])
        go_fill = want & (action == 0) & (q >= MIN_FILL)
        go_up = want & (action == 1) & (av >= up_cost)
        go_rep = want & (action == 2) & (av >= cost_rep[r, j_rep])

        i, j, qi = rows[go_fill], j_fill[go_fill], q[go_fill]
        m[i, j] += qi
        avail[i] -= qi * cost_m[j]
        plan.mach_q[i, j] += qi
        plan.mach_dig[i, j] += qi * cost_m[j] * Ns[i]

        i, ci = rows[go_up], up_cost[go_up]
        avail[i] -= ci
        plan.up_dig[i] += ci * Ns[i]
        plan.levels[i] += 1.0
        L[i] += 1.0

        i, j, w, cr = rows[go_rep], j_rep[go_rep], worst[go_rep], credit_r[go_rep]
        m[i, w] -= 1.0
        m[i, j] += 1.0
        avail[i] -= cost_rep[r[go_rep], j]
        plan.scrap[i, w] += 1.0
        plan.mach_q[i, j] += 1.0
        plan.mach_dig[i, j] += cost_m[j] * Ns[i]
        plan.credit_gen[i] += cr * Ns[i]

        rows = rows[go_fill | go_up | go_rep]

    # Funding: scrap credit first, then reinvestable DIG (unrefined before wallet), then swap ETH.
    need = np.maximum(plan.mach_dig.sum(1) + plan.up_dig - plan.credit_gen - co.credit[:k], 0.0)
    from_own = np.minimum(need, own_dig)
    plan.reserve_pend = np.minimum(from_own, reinvest * pend)
    plan.reserve_wal = from_own - plan.reserve_pend
    if ctx.dig_per_eth > 0.0:
        plan.eth_swap = np.minimum((need - from_own) / (ctx.dig_per_eth * ctx.haircut), eth_cap)
    return plan
