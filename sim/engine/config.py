"""Load ``params.json`` into typed, read-only dataclasses.

``spec`` values mirror docs/02_TOKENOMI_VE_OYUN_MATEMATIGI.md; ``model`` values are
simulation assumptions (documented in PARAMS.md). Sweeps pass dotted-path overrides,
e.g. ``{"spec.vrgda.r": 4000}``.
"""
from __future__ import annotations

import copy
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

PARAMS_PATH = Path(__file__).resolve().parent.parent / "params.json"

# Order matters: it is the integer type code stored in every cohort.
TYPE_NAMES: tuple[str, ...] = ("casual", "optimizer", "whale", "bot", "cosmetic", "sybil")
T_CASUAL, T_OPTIMIZER, T_WHALE, T_BOT, T_COSMETIC, T_SYBIL = range(len(TYPE_NAMES))


@dataclass(frozen=True, eq=False)
class Machines:
    names: tuple[str, ...]
    dp: np.ndarray            # DP per machine
    kw: np.ndarray            # kW per machine
    premium: np.ndarray       # tier premium on the VRGDA cost
    unlock_level: np.ndarray  # minimum outpost level

    @property
    def eta(self) -> np.ndarray:
        """Efficiency η in DP/kW."""
        return self.dp / self.kw

    @property
    def n_tiers(self) -> int:
        return len(self.dp)


@dataclass(frozen=True)
class Outpost:
    slot_base: int
    cap_base_kw: float
    cap_growth: float
    cost_base: float
    cost_exp: float
    idx_min: float
    idx_max: float
    max_level: int


@dataclass(frozen=True)
class Governance:
    """Spec §12 intervention rule for VRGDA r, modelled as if the Safe always follows it."""
    enabled: bool
    delay_days: int          # 96 h timelock between decision and effect (4 days)
    weeks: int               # consecutive weeks a condition must hold
    sr_low: float            # weekly SR below this ...
    price_ratio_low: float   # ... or weekly mean p(t,n)/p0 below this → r × (1 − step)
    price_ratio_high: float  # weekly mean p(t,n)/p0 above this → r × (1 + step)
    step: float
    cooldown_days: int       # spec §6.2 rate limit: ±25 % per 30 days
    r_min: float
    r_max: float


@dataclass(frozen=True)
class Spec:
    cap: float
    delta_d: float
    split_miners: float
    split_dev: float
    split_treasury: float
    referral_rate: float
    referral_min_energy_eth: float
    energy_usd_per_kwh: float
    tank_cap_hours: float
    machines: Machines
    p0: float
    k: float
    r: float
    max_units_per_tx: float
    price_floor: float           # NOT in spec v0.1 (0 = off); used to test a recommendation
    burn_share: float            # share of in-game DIG spending burned; the rest returns to the reserve
    cosmetic_burn_share: float
    scrap_credit_rate: float
    outpost: Outpost
    fast_fee: float
    fast_fee_burn_share: float
    queue_days: int
    rev_buyback: float
    rev_pol: float
    rev_ops: float
    genesis_days: int
    dig_lp_cap: float
    genesis_rev_buyback: float   # spec v0.1 defines no separate genesis split: defaults mirror §10
    genesis_rev_pol: float
    genesis_rev_ops: float
    genesis_tank_hours_after_open: float  # v0.2 §11: genesis tanks may last only until Market Open + this (0 = off)
    daily_mint_cap: float                 # v0.2 §2: immutable token-level cap per UTC day
    governance: Governance


@dataclass(frozen=True)
class AgentType:
    budget_usd: float        # mean external ETH budget per entity (USD at entry)
    capex_share: float       # share of the budget earmarked for buying DIG for machines/outposts
    capex_days: float        # capex ETH is deployed over at least this many days
    tau_max: float           # max acceptable growth-adjusted DIG payback (days); < 0 = never buys
    growth_awareness: float  # weight on observed network growth g in the payback formula
    reinvest_mined: bool     # may spend mined DIG in-game
    refine_frac: float       # share of free unrefined DIG refined each day
    sell_frac: float         # share of newly refined DIG sold on the AMM
    impatience: float        # daily time preference ρ, drives fast-vs-standard refine
    op_tolerance: float      # keeps machines on down to (1 − tol) × break-even
    churn_base: float        # daily exit hazard
    exit_dump: float         # share of wallet DIG sold when leaving
    drawdown_exit: float     # leave when price falls this much from the peak since entry (1 = never)
    cosmetic_usd_day: float  # cosmetic spending per wallet per day (USD)


@dataclass(frozen=True)
class Model:
    days: int
    eth_usd0: float
    eth_daily_vol: float
    amm_fee: float
    amm_rounds: int
    swap_haircut: float
    max_buy_pool_frac: float
    # v1.1 (docs/02 §10.1): keeper spends at most a share of each bucket per day, in chunks
    # that each move the price at most max_chunk_move (the on-chain price anchor allows 3 %).
    buyback_bucket_frac: float
    pol_bucket_frac: float
    keeper_chunks: int
    max_chunk_move: float
    ops_monthly_usd: float
    dev_sell_frac: float
    tank_days: float
    p0_basis: str
    genesis_players: float
    wave_players: float
    adoption_mid: float
    adoption_width: float
    tail_per_day: float
    arrival_noise_sigma: float
    arrival_noise_ar: float
    pr_ema_days: float
    pr_full_ratio: float
    pr_extra_impatience: float
    pr_hold_strength: float
    type_mix: dict[str, float]
    whale_rate: float
    whale_accounts: int
    bot_rate: float
    bot_wallets: int
    referred_share: float
    spec_usd_per_player: float
    spec_speed: float
    spec_sigma: float
    spec_ar: float
    spec_momentum: float
    spec_value_elasticity: float
    spec_value_clip: tuple[float, float]
    churn_loss_mult: float
    fast_refine_width: float
    purchase_iterations: int
    payback_entry_days: int
    mint_diurnal_amplitude: float  # hourly mint profile: 1 + a·cos(2π(h − peak)/24)
    mint_peak_hour: int
    mint_open_hour_share: float    # share of market-open-day refine requests in the first hour
    types: tuple[AgentType, ...]  # indexed by TYPE_NAMES order


@dataclass(frozen=True)
class Params:
    spec: Spec
    model: Model
    raw: dict[str, Any]


def _set_dotted(tree: dict[str, Any], key: str, value: Any) -> None:
    node = tree
    parts = key.split(".")
    for part in parts[:-1]:
        node = node[part]
    if parts[-1] not in node:
        raise KeyError(f"unknown parameter: {key}")
    node[parts[-1]] = value


def load_params(overrides: dict[str, Any] | None = None, path: Path = PARAMS_PATH) -> Params:
    raw = json.loads(path.read_text(encoding="utf-8"))
    raw = copy.deepcopy(raw)
    for key, value in (overrides or {}).items():
        _set_dotted(raw, key, value)
    return build_params(raw)


def build_params(raw: dict[str, Any]) -> Params:
    s, m = raw["spec"], raw["model"]
    mach = s["machines"]
    machines = Machines(
        names=tuple(mach["names"]),
        dp=np.asarray(mach["dp"], dtype=float),
        kw=np.asarray(mach["litres_per_hour"], dtype=float),
        premium=np.asarray(mach["premium"], dtype=float),
        unlock_level=np.asarray(mach["unlock_level"], dtype=float),
    )
    spec = Spec(
        cap=float(s["cap"]),
        delta_d=float(s["emission"]["delta_d"]),
        split_miners=float(s["emission"]["split_miners"]),
        split_dev=float(s["emission"]["split_dev"]),
        split_treasury=float(s["emission"]["split_treasury"]),
        referral_rate=float(s["referral"]["rate"]),
        referral_min_energy_eth=float(s["referral"]["min_invitee_energy_eth"]),
        energy_usd_per_kwh=float(s["fuel"]["price_usd_per_litre"]),
        tank_cap_hours=float(s["fuel"]["tank_cap_hours"]),
        machines=machines,
        p0=float(s["vrgda"]["p0"]),
        k=float(s["vrgda"]["k"]),
        r=float(s["vrgda"]["r"]),
        max_units_per_tx=float(s["vrgda"]["max_units_per_tx"]),
        price_floor=float(s["vrgda"]["price_floor"]),
        burn_share=float(s["spend"]["burn_share"]),
        cosmetic_burn_share=float(s["spend"]["cosmetic_burn_share"]),
        scrap_credit_rate=float(s["spend"]["scrap_credit_rate"]),
        outpost=Outpost(**s["outpost"]),
        fast_fee=float(s["refinery"]["fast_fee"]),
        fast_fee_burn_share=float(s["refinery"]["fast_fee_burn_share"]),
        queue_days=int(s["refinery"]["queue_days"]),
        rev_buyback=float(s["revenue"]["buyback"]),
        rev_pol=float(s["revenue"]["pol"]),
        rev_ops=float(s["revenue"]["ops"]),
        genesis_days=int(s["genesis"]["days"]),
        dig_lp_cap=float(s["genesis"]["dig_lp_cap"]),
        genesis_rev_buyback=float(s["genesis"]["revenue_buyback"]),
        genesis_rev_pol=float(s["genesis"]["revenue_pol"]),
        genesis_rev_ops=float(s["genesis"]["revenue_ops"]),
        genesis_tank_hours_after_open=float(s["genesis"]["tank_until_hours_after_open"]),
        daily_mint_cap=float(s["token"]["daily_mint_cap"]),
        governance=Governance(**s["governance"]),
    )
    model = Model(
        days=int(m["days"]),
        eth_usd0=float(m["eth_usd"]["initial"]),
        eth_daily_vol=float(m["eth_usd"]["daily_vol"]),
        amm_fee=float(m["amm"]["fee"]),
        amm_rounds=int(m["amm"]["rounds_per_day"]),
        swap_haircut=float(m["amm"]["swap_haircut"]),
        max_buy_pool_frac=float(m["amm"]["max_daily_buy_frac_of_pool_eth"]),
        buyback_bucket_frac=float(m["keeper"]["buyback_daily_frac_of_bucket"]),
        pol_bucket_frac=float(m["keeper"]["pol_daily_frac_of_bucket"]),
        keeper_chunks=int(m["keeper"]["chunks_per_day"]),
        max_chunk_move=float(m["keeper"]["max_chunk_price_move"]),
        ops_monthly_usd=float(m["ops_monthly_cost_usd"]),
        dev_sell_frac=float(m["dev_sell_frac"]),
        tank_days=float(m["tank_days"]),
        p0_basis=str(m["genesis_p0_basis"]),
        genesis_players=float(m["adoption"]["genesis_players"]),
        wave_players=float(m["adoption"]["wave_players"]),
        adoption_mid=float(m["adoption"]["mid_day"]),
        adoption_width=float(m["adoption"]["width_days"]),
        tail_per_day=float(m["adoption"]["tail_per_day"]),
        arrival_noise_sigma=float(m["adoption"]["noise_sigma"]),
        arrival_noise_ar=float(m["adoption"]["noise_ar"]),
        pr_ema_days=float(m["price_response"]["ema_days"]),
        pr_full_ratio=float(m["price_response"]["full_at_ratio"]),
        pr_extra_impatience=float(m["price_response"]["extra_impatience"]),
        pr_hold_strength=float(m["price_response"]["hold_strength"]),
        type_mix={k: float(v) for k, v in m["type_mix"].items()},
        whale_rate=float(m["whales"]["rate_per_day"]),
        whale_accounts=int(m["whales"]["accounts"]),
        bot_rate=float(m["bots"]["rate_per_day"]),
        bot_wallets=int(m["bots"]["wallets"]),
        referred_share=float(m["referred_share"]),
        spec_usd_per_player=float(m["speculators"]["usd_per_active_player"]),
        spec_speed=float(m["speculators"]["speed"]),
        spec_sigma=float(m["speculators"]["sentiment_sigma"]),
        spec_ar=float(m["speculators"]["sentiment_ar"]),
        spec_momentum=float(m["speculators"]["momentum"]),
        spec_value_elasticity=float(m["speculators"]["value_elasticity"]),
        spec_value_clip=(float(m["speculators"]["value_clip_low"]), float(m["speculators"]["value_clip_high"])),
        churn_loss_mult=float(m["churn_loss_mult"]),
        fast_refine_width=float(m["fast_refine_width"]),
        purchase_iterations=int(m["purchase_iterations"]),
        payback_entry_days=int(m["payback_entry_days"]),
        mint_diurnal_amplitude=float(m["mint_profile"]["diurnal_amplitude"]),
        mint_peak_hour=int(m["mint_profile"]["peak_hour_utc"]),
        mint_open_hour_share=float(m["mint_profile"]["open_hour_share"]),
        types=tuple(AgentType(**m["types"][name]) for name in TYPE_NAMES),
    )
    if abs(spec.split_miners + spec.split_dev + spec.split_treasury - 1.0) > 1e-12:
        raise ValueError("emission split must sum to 1")
    if abs(spec.rev_buyback + spec.rev_pol + spec.rev_ops - 1.0) > 1e-12:
        raise ValueError("ETH revenue split must sum to 1")
    if abs(spec.genesis_rev_buyback + spec.genesis_rev_pol + spec.genesis_rev_ops - 1.0) > 1e-12:
        raise ValueError("genesis ETH revenue split must sum to 1")
    if spec.referral_rate * spec.split_miners > spec.split_treasury:
        raise ValueError("referral could exceed the treasury share (spec §9)")
    if model.p0_basis not in ("purchased", "consumed"):
        raise ValueError("genesis_p0_basis must be 'purchased' or 'consumed'")
    return Params(spec=spec, model=model, raw=raw)
