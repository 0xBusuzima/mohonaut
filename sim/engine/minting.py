"""Token-level mint accounting (spec v0.2 §2 T3; 03 §3.2; 04 §5.2).

Only four things mint MOHO/DIG: standard-queue finalisation, fast refine (net of the fee),
dev/treasury finalisation and the market-open LP. In-game spending from unrefined balances
never mints.

The daily model has no hours, so each mint is spread over the UTC day with a request
profile (an assumption, documented in PARAMS.md):
  * normal day: diurnal, share_h ∝ 1 + a·cos(2π(h − peak)/24);
  * market-open day: ``open_share`` of the day's refine requests in the first hour after
    the open (hour 0 of day 3), the rest diurnal;
  * a standard-queue finalisation lands 72 h after its request, i.e. in the same hour
    three days later (so the open-hour rush repeats on day 6);
  * dev withdrawals and the LP mint happen in a single hour (hour 0).
"""
from __future__ import annotations

import math

import numpy as np

HOURS = 24
HOUR0 = np.eye(HOURS)[0]


def diurnal_profile(amplitude: float, peak_hour: int) -> np.ndarray:
    h = np.arange(HOURS)
    w = 1.0 + amplitude * np.cos(2.0 * math.pi * (h - peak_hour) / HOURS)
    return w / w.sum()


def open_day_profile(open_share: float, diurnal: np.ndarray) -> np.ndarray:
    rest = diurnal.copy()
    rest[0] = 0.0
    return open_share * HOUR0 + (1.0 - open_share) * rest / rest.sum()


class MintMeter:
    """Enforces the daily mint cap like the token would: what does not fit is deferred.

    ``allow`` returns the amount that may be minted now; the caller keeps the remainder
    unminted (still pending / still queued) and asks again the next day.
    """

    def __init__(self, days: int, daily_cap: float) -> None:
        self.cap = daily_cap
        self.hourly = np.zeros((days + 1, HOURS))  # one spare day for the LP mint at the open
        self.deferred = np.zeros(days + 1)

    def allow(self, day: int, amount: float, profile: np.ndarray) -> float:
        if amount <= 0.0:
            return 0.0
        room = max(self.cap - float(self.hourly[day].sum()), 0.0)
        granted = min(amount, room)
        self.deferred[day] += amount - granted
        self.hourly[day] += granted * profile
        return granted

    def daily(self) -> np.ndarray:
        return self.hourly.sum(1)
