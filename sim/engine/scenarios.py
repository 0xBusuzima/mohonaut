"""Stress scenarios (spec §13).

Timing convention: "month m" means day 30·m after T0 (e.g. the bear shock "at month 4"
hits on day 120). Genesis occupies days 0–2; the market opens at the start of day 3.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Scenario:
    name: str
    title: str                          # Turkish label used in the report
    demand_shock_day: int = -1          # from this day on, arrivals and speculator demand × demand_shock_mult
    demand_shock_mult: float = 1.0
    arrival_cut_day: int = -1           # from this day on, new arrivals × arrival_cut_mult
    arrival_cut_mult: float = 1.0
    hype_day: int = -1                  # arrivals × hype_mult for hype_days
    hype_days: int = 0
    hype_mult: float = 1.0
    whale_day: int = -1                 # one forced whale entity enters on this day ...
    whale_h_share: float = 0.0          # ... and buys until it holds this share of active H
    whale_hold_days: int = 0            # ... then exits completely
    whale_budget_usd: float = 0.0
    whale_accounts: int = 0
    sybil_day: int = -1                 # one operator creates sybil_wallets minimum-size wallets
    sybil_wallets: int = 0

    def arrival_mult(self, day: int) -> float:
        mult = 1.0
        if 0 <= self.demand_shock_day <= day:
            mult *= self.demand_shock_mult
        if 0 <= self.arrival_cut_day <= day:
            mult *= self.arrival_cut_mult
        if 0 <= self.hype_day <= day < self.hype_day + self.hype_days:
            mult *= self.hype_mult
        return mult

    def speculator_mult(self, day: int) -> float:
        return self.demand_shock_mult if 0 <= self.demand_shock_day <= day else 1.0


SCENARIOS: dict[str, Scenario] = {
    s.name: s
    for s in (
        Scenario("base", "Baz"),
        Scenario("bear", "Ayı (talep −%70, 4. ay)", demand_shock_day=120, demand_shock_mult=0.3),
        Scenario("deep_bear", "Derin ayı (talep −%90, 4. ay)", demand_shock_day=120, demand_shock_mult=0.1),
        Scenario(
            "whale", "Balina (H'nin %20'si, 2. ay, 30 gün sonra çıkış)",
            whale_day=60, whale_h_share=0.20, whale_hold_days=30, whale_budget_usd=3_000_000, whale_accounts=20,
        ),
        Scenario("churn", "Churn (3. aydan sonra yeni giriş −%80)", arrival_cut_day=90, arrival_cut_mult=0.2),
        Scenario("sybil", "Sybil (1.000 minimum cüzdan, genesis)", sybil_day=0, sybil_wallets=1000),
        Scenario("hype", "Hype (1. ayda 2 hafta 10x giriş)", hype_day=30, hype_days=14, hype_mult=10.0),
    )
}
