"""Reserve-based emission (spec §3).

Two implementations:

* float helpers used by the daily simulation and the schedule table, and
* an exact integer reference (18-decimal WAD fixed point, always rounded down) used
  to generate golden vectors for the Solidity differential tests.

Integer algorithm (documented in vectors/README.md as well)::

    DELTA_H_WAD = floor(1e18 · (1 − (1 − δ_d)^(1/24)))     # computed once, 60-digit Decimal
    for every hour h with H > 0 for the whole hour:
        E_h     = floor(R_h · DELTA_H_WAD / 1e18)
        miners  = floor(E_h · 9000 / 10000)
        dev     = floor(E_h ·  500 / 10000)
        treasury= E_h − miners − dev                       # remainder, so the split is exact
        R_{h+1} = R_h − E_h                                # no recycling in the vectors
"""
from __future__ import annotations

import math
from decimal import ROUND_FLOOR, Decimal, localcontext

import numpy as np

WAD = 10**18
BPS = 10_000


def hourly_rate(delta_d: float) -> float:
    """δ_h = 1 − (1 − δ_d)^(1/24), computed without cancellation."""
    return -math.expm1(math.log1p(-delta_d) / 24.0)


def decay_lambda(delta_d: float) -> float:
    """Continuous decay rate λ = −ln(1 − δ_d) per day."""
    return -math.log1p(-delta_d)


def daily_emission(reserve: float, delta_d: float) -> float:
    """Emission of one day of 24 hourly epochs with H > 0 throughout.

    Each epoch emits R_h·δ_h; without recycling inside the day this compounds to
    R·(1 − (1 − δ_h)^24) = R·δ_d exactly. Recycled DIG is credited at day end.
    """
    return reserve * delta_d


def distribute(emission: float, active_dp: np.ndarray, referral_rate: float, referred: np.ndarray,
               self_ref: np.ndarray, referrer_weight: np.ndarray, split_miners: float, split_dev: float,
               split_treasury: float) -> tuple[np.ndarray, np.ndarray, float, float]:
    """Split one day's emission (spec §3.3, §9).

    90 % goes to miners pro-rata to active DP; 5 % to dev; 5 % to the treasury, which pays
    referrers 3 % of their invitees' accrual. ``referred`` is the share of each holder's accrual
    that earns a referral credit (eligible invitees only); a self-referring holder (sybil) gets
    its own credits, the others' credits go to active referrers in proportion to
    ``referrer_weight``. Unpaid credit stays in the treasury.
    Returns (miner accrual per holder, referral credit per holder, dev share, treasury share).
    """
    total_dp = float(active_dp.sum())
    accrual = split_miners * emission * active_dp / total_dp if total_dp > 0.0 else np.zeros_like(active_dp)
    credit = referral_rate * accrual * referred
    ref_in = np.where(self_ref, credit, 0.0)
    weight = float(referrer_weight.sum())
    if weight > 0.0:
        ref_in = ref_in + float(credit[~self_ref].sum()) * referrer_weight / weight
    return accrual, ref_in, split_dev * emission, split_treasury * emission - float(ref_in.sum())


def year_emission(cap: float, delta_d: float, year: int) -> float:
    """Emission of year n (1-based) with continuous mining and no recycling (spec §3.2)."""
    keep = (1.0 - delta_d) ** 365
    return cap * keep ** (year - 1) * (1.0 - keep)


def cumulative_emission(cap: float, delta_d: float, years: int) -> float:
    keep = (1.0 - delta_d) ** 365
    return cap * (1.0 - keep**years)


def half_life_days(delta_d: float) -> float:
    return math.log(2.0) / decay_lambda(delta_d)


def delta_h_wad(delta_d: str) -> int:
    """floor(1e18 · (1 − (1 − δ_d)^(1/24))) with 60 significant digits.

    ``delta_d`` is a decimal string so that the constant does not depend on binary floats.
    """
    with localcontext() as ctx:
        ctx.prec = 60
        one = Decimal(1)
        root = ((one - Decimal(delta_d)).ln() / 24).exp()
        return int(((one - root) * WAD).to_integral_value(rounding=ROUND_FLOOR))


def split_int(emission: int, miners_bps: int = 9000, dev_bps: int = 500) -> tuple[int, int, int]:
    """Integer 90/5/5 split; the rounding remainder goes to the treasury so nothing is lost."""
    miners = emission * miners_bps // BPS
    dev = emission * dev_bps // BPS
    return miners, dev, emission - miners - dev


def hourly_schedule_int(r0: int, dh_wad: int, hours: int) -> list[tuple[int, int]]:
    """[(R_h, E_h)] for h = 0..hours−1, exact integer math, rounding down."""
    out: list[tuple[int, int]] = []
    reserve = r0
    for _ in range(hours):
        e = reserve * dh_wad // WAD
        out.append((reserve, e))
        reserve -= e
    return out
