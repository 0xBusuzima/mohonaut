"""VRGDA schedule with price-continuous r changes and the §12 intervention rule (spec v0.2).

Changing r in p(t,n) = p0·(1 − k)^(t − n/r) directly would make the price jump: with
n = 1M DP sold, cutting r by 25 % moves the schedule ~167 "days ahead". A contract that lets
governance change r must therefore re-anchor the schedule so that the price is continuous:

    p(t, n) = p0·(1 − k)^(s_a + (t − t_a) − (n − n_a)/r)

where at each change (t_a, n_a) are the current time and units sold and s_a is the current
schedule offset t − n/r under the old parameters. Before any change s_a = t_a = n_a = 0,
which is exactly the spec formula.
"""
from __future__ import annotations

from dataclasses import dataclass

from .config import Governance


@dataclass
class VrgdaSchedule:
    r: float
    t_anchor: float = 0.0
    n_anchor: float = 0.0
    s_anchor: float = 0.0

    def effective(self, t: float, n: float) -> tuple[float, float]:
        """(t', n') such that the spec formula p(t', n') with the current r gives the price."""
        return self.s_anchor + (t - self.t_anchor), n - self.n_anchor

    def set_r(self, t: float, n: float, r_new: float) -> None:
        t_eff, n_eff = self.effective(t, n)
        self.s_anchor = t_eff - n_eff / self.r
        self.t_anchor, self.n_anchor, self.r = t, n, r_new


class GovernanceRule:
    """Weekly check; a change is decided after ``weeks`` consecutive qualifying weeks and
    takes effect ``delay_days`` later (timelock). At most one change per ``cooldown_days``."""

    def __init__(self, g: Governance) -> None:
        self.g = g
        self.down_weeks = 0
        self.up_weeks = 0
        self.blocked_until = -1
        self.pending: tuple[int, float] | None = None  # (effective day, new r)

    def weekly(self, day: int, r: float, sr_week: float, price_ratio_week: float) -> None:
        g = self.g
        if not g.enabled or self.pending is not None or day < self.blocked_until:
            return
        self.down_weeks = self.down_weeks + 1 if (sr_week < g.sr_low or price_ratio_week < g.price_ratio_low) else 0
        self.up_weeks = self.up_weeks + 1 if price_ratio_week > g.price_ratio_high else 0
        new_r = None
        if self.down_weeks >= g.weeks:
            new_r = max(r * (1.0 - g.step), g.r_min)
        elif self.up_weeks >= g.weeks:
            new_r = min(r * (1.0 + g.step), g.r_max)
        if new_r is not None and new_r != r:
            self.pending = (day + g.delay_days, new_r)
            self.blocked_until = day + g.delay_days + g.cooldown_days
            self.down_weeks = self.up_weeks = 0

    def due(self, day: int) -> float | None:
        """New r that takes effect today, if any."""
        if self.pending is not None and day >= self.pending[0]:
            r = self.pending[1]
            self.pending = None
            return r
        return None
