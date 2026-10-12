"""SPEC audit experiment: the simulator adds the whole POL bucket to the pool every day
(sim/engine/model.py:440-442), while LiquidityManager.addLiquidity may add at most
ADD_DAILY_BPS = 4 % of the pool's ETH per UTC day (contracts/src/LiquidityManager.sol:36).

This script runs the unchanged simulator (base scenario, v1.0-aligned: daily mint cap 500K,
96 h governance delay) twice per seed: as is, and with Pool.zap_eth monkeypatched in memory so
that at most 4 % of the pool's ETH is added per day and the rest waits as a backlog (as it would
in the RevenueRouter POL bucket). No repository file is modified.

Run from the repository root:
    sim/.venv/Scripts/python.exe -I contracts/audit-tests/spec/pol_cap_experiment.py [seeds]
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "sim"))

import numpy as np  # noqa: E402

from engine import amm  # noqa: E402
from engine.config import load_params  # noqa: E402
from engine.model import Simulation  # noqa: E402
from engine.scenarios import SCENARIOS  # noqa: E402

CAP_FRAC = 0.04
_orig_zap = amm.Pool.zap_eth
STATE = {"backlog": 0.0, "capped": False, "max_backlog": 0.0}


def capped_zap(self, eth_in: float) -> float:
    if not STATE["capped"]:
        return _orig_zap(self, eth_in)
    STATE["backlog"] += eth_in
    add = min(STATE["backlog"], CAP_FRAC * self.eth)
    STATE["backlog"] -= add
    STATE["max_backlog"] = max(STATE["max_backlog"], STATE["backlog"])
    return _orig_zap(self, add)


amm.Pool.zap_eth = capped_zap
OVERRIDES = {"spec.token.daily_mint_cap": 500_000, "spec.governance.delay_days": 4}


def run(seed: int, capped: bool, scenario: str) -> dict[str, float]:
    STATE.update(backlog=0.0, capped=capped, max_backlog=0.0)
    res = Simulation(load_params(OVERRIDES), SCENARIOS[scenario], seed).run()
    s = res.series
    out = {}
    for d in (30, 90, 180, 365, 730):
        out[f"pool_eth_d{d}"] = float(s["pool_eth"][d])
        out[f"price_usd_d{d}"] = float(s["price_usd"][d])
    out["price_m24_over_m2"] = float(np.mean(s["price_usd"][690:720]) / np.mean(s["price_usd"][30:60]))
    out["max_pol_backlog_eth"] = STATE["max_backlog"]
    out["final_pol_backlog_eth"] = STATE["backlog"]
    # daily close-to-close absolute log return, first 90 days after the open (volatility proxy)
    p = s["price_usd"][3:93]
    out["mean_abs_logret_d3_93"] = float(np.mean(np.abs(np.diff(np.log(p)))))
    return out


def main() -> None:
    seeds = int(sys.argv[1]) if len(sys.argv) > 1 else 5
    scenarios = sys.argv[2].split(",") if len(sys.argv) > 2 else ["base", "bear"]
    for scenario in scenarios:
        base = [run(sd, False, scenario) for sd in range(seeds)]
        cap = [run(sd, True, scenario) for sd in range(seeds)]
        print(f"scenario={scenario} seeds={seeds} (median over seeds; uncapped -> capped 4 %/day)")
        for key in base[0]:
            a = float(np.median([b[key] for b in base]))
            c = float(np.median([x[key] for x in cap]))
            rel = (c / a - 1.0) * 100.0 if a else float("nan")
            print(f"  {key:26s} {a:14.4f} -> {c:14.4f}  ({rel:+.1f} %)")


if __name__ == "__main__":
    main()
