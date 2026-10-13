"""SPEC audit: share of the simulator's sinks that come from cosmetic MOHN burns, a sink with no
on-chain counterpart in the v1 contracts (docs/02 S6.3 'Kozmetik MOHN harcamalari %100 yakim').

Run from the repository root:
    sim/.venv/Scripts/python.exe -I contracts/audit-tests/spec/cosmetic_sink_share.py [seeds]
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "sim"))

import numpy as np  # noqa: E402

from engine.config import load_params  # noqa: E402
from engine.model import Simulation  # noqa: E402
from engine.scenarios import SCENARIOS  # noqa: E402

OVERRIDES = {"spec.token.daily_mint_cap": 500_000, "spec.governance.delay_days": 4}


def main() -> None:
    seeds = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    for scenario in ("base", "bear"):
        shares, sr_all, sr_wo = [], [], []
        for seed in range(seeds):
            s = Simulation(load_params(OVERRIDES), SCENARIOS[scenario], seed).run().series
            w = slice(337, 365)  # month 12, 28-day window (docs/02 S13 SR definition)
            sinks = s["burn_spend"] + s["burn_cosmetic"] + s["burn_fee"] + s["burn_buyback"] + s["recycled"]
            em = float(s["emission"][w].sum())
            shares.append(float(s["burn_cosmetic"][w].sum()) / float(sinks[w].sum()))
            sr_all.append(float(sinks[w].sum()) / em)
            sr_wo.append(float((sinks - s["burn_cosmetic"])[w].sum()) / em)
        print(f"{scenario}: cosmetic share of month-12 sinks {np.median(shares):.3f}; "
              f"SR28(m12) {np.median(sr_all):.3f} -> without cosmetic burns {np.median(sr_wo):.3f}")


if __name__ == "__main__":
    main()
