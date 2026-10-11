"""Capex pricing in DIG: LinearVRGDA for machines (spec §6.2) and outposts (spec §7).

Convention (spec): the j-th DP unit of a purchase starting at (t, n) costs
p(t, n + j) = p0·(1 − k)^(t − (n + j)/r), j = 0..q−1. (Art Gobblers prices the next
token at ``sold + 1``; the spec uses ``n`` — the contracts must pick one and the
vectors follow the spec.)

The daily simulation does not know the intra-day order of purchases. It assumes the
day's Q units are bought uniformly over [t, t+1): n(s) = n + Q·s, t(s) = t + s. The
cost of that path has the closed form implemented in :func:`day_cost`; a unit test
checks it against fine-grained sequential :func:`batch_cost` calls.
"""
from __future__ import annotations

import math

import numpy as np

from .config import Outpost


def unit_price(t: float, n: float, p0: float, k: float, r: float) -> float:
    """p(t, n) = p0·(1 − k)^(t − n/r) in DIG per DP unit; t in days, n in DP units sold."""
    return p0 * math.exp(math.log1p(-k) * (t - n / r))


def batch_cost(t: float, n: float, q: float, p0: float, k: float, r: float) -> float:
    """Closed-form cost of q units bought at once: p(t,n)·(a^q − 1)/(a − 1), a = (1−k)^(−1/r)."""
    ln_a = -math.log1p(-k) / r
    return unit_price(t, n, p0, k, r) * math.expm1(q * ln_a) / math.expm1(ln_a)


def tier_cost(t: float, n: float, dp: float, premium: float, p0: float, k: float, r: float) -> float:
    """Cost of one machine: Cost(DP_tier)·(1 + premium)."""
    return batch_cost(t, n, dp, p0, k, r) * (1.0 + premium)


def _exp_integral(p: float, x: float, a: float, b: float) -> float:
    """∫ₐᵇ p·e^{x·s} ds."""
    if abs(x) < 1e-12:
        return p * (b - a)
    return p * (math.exp(x * b) - math.exp(x * a)) / x


def day_cost(t: float, n: float, q: float, p0: float, k: float, r: float, floor: float = 0.0) -> float:
    """Cost of q units bought uniformly over the day [t, t+1).

    Along the path the unit price is p(t,n)·e^{x·s}, x = (1 − q/r)·ln(1 − k), so
    ∫₀¹ q·p ds = q·p(t,n)·(eˣ − 1)/x. With an optional price floor (not in spec v0.1) the
    integrand is max(p, floor); the path crosses the floor at most once.
    """
    p = unit_price(t, n, p0, k, r)
    x = (1.0 - q / r) * math.log1p(-k)
    if floor <= 0.0:
        return q * _exp_integral(p, x, 0.0, 1.0)
    if abs(x) < 1e-12:
        return q * max(p, floor)
    s_cross = min(max(math.log(floor / p) / x, 0.0), 1.0)
    if x < 0.0:  # price falls during the day: market price first, then the floor
        if p <= floor:
            return q * floor
        return q * (_exp_integral(p, x, 0.0, s_cross) + floor * (1.0 - s_cross))
    if p >= floor:  # price rises during the day and starts above the floor
        return q * _exp_integral(p, x, 0.0, 1.0)
    return q * (floor * s_cross + _exp_integral(p, x, s_cross, 1.0))


def units_for_budget(t: float, n: float, budget: float, p0: float, k: float, r: float, floor: float = 0.0) -> float:
    """Inverse of :func:`day_cost`: the q ≥ 0 whose daily cost equals ``budget`` (bisection).

    day_cost is strictly increasing in q, and day_cost(q) ≥ q·max(p(t,n)·(1 − k), floor).
    """
    if budget <= 0.0:
        return 0.0
    hi = budget / max(unit_price(t, n, p0, k, r) * (1.0 - k), floor) + 1.0
    lo = 0.0
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if day_cost(t, n, mid, p0, k, r, floor) < budget:
            lo = mid
        else:
            hi = mid
        if hi - lo <= 1e-12 * hi:
            break
    return 0.5 * (lo + hi)


# --- Outposts (spec §7) --------------------------------------------------------------

def price_index(p: float, p0: float, lo: float, hi: float) -> float:
    """idx = clamp(p(t,n)/p0, lo, hi): ties outpost costs to the machine price level."""
    return min(max(p / p0, lo), hi)


def outpost_slots(level: np.ndarray | float, o: Outpost) -> np.ndarray | float:
    return o.slot_base + level


def outpost_capacity_kw(level: np.ndarray | float, o: Outpost) -> np.ndarray | float:
    return o.cap_base_kw * np.power(o.cap_growth, np.asarray(level, dtype=float) - 1.0)


def outpost_upgrade_cost(level: np.ndarray | float, idx: float, o: Outpost) -> np.ndarray | float:
    """DIG cost of L → L+1: cost_base·L^exp·idx."""
    return o.cost_base * np.power(np.asarray(level, dtype=float), o.cost_exp) * idx


def outpost_cumulative_cost(level: np.ndarray, o: Outpost) -> np.ndarray:
    """DIG cost of climbing from L1 to ``level`` at idx = 1 (``level`` holds integer values)."""
    table = np.concatenate([[0.0, 0.0], np.cumsum(o.cost_base * np.arange(1, o.max_level) ** o.cost_exp)])
    return table[np.asarray(level).astype(int)]
