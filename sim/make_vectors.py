"""Golden test vectors for the Solidity differential tests (written to vectors/*.json).

Every number is an 18-decimal fixed-point integer (WAD) serialised as a decimal string and
rounded DOWN, except where a field says otherwise. Reference values are computed with
60-significant-digit Decimal arithmetic, so they are the mathematically exact result
floored once. A Solidity implementation that approximates exp/ln (e.g. solmate's
wadExp/wadLn) should match these within a stated relative tolerance (we suggest 1e-12 for
VRGDA prices, exact equality for emission, outpost table look-ups and market open).

Usage:  .venv\\Scripts\\python.exe make_vectors.py
"""
from __future__ import annotations

import json
from decimal import ROUND_FLOOR, Decimal, localcontext
from pathlib import Path
from typing import Any

from engine.config import load_params
from engine.emission import WAD, delta_h_wad, hourly_schedule_int, split_int
from engine.model import Simulation
from engine.scenarios import SCENARIOS

OUT = Path(__file__).resolve().parent / "vectors"
PREC = 60


def _floor_wad(x: Decimal) -> int:
    return int((x * WAD).to_integral_value(rounding=ROUND_FLOOR))


def emission_vectors(hours: int = 2000) -> dict[str, Any]:
    delta_d = "0.0005"
    dh = delta_h_wad(delta_d)
    r0 = 100_000_000 * WAD
    rows = []
    for h, (reserve, e) in enumerate(hourly_schedule_int(r0, dh, hours)):
        miners, dev, treasury = split_int(e)
        rows.append([h, str(reserve), str(e), str(miners), str(dev), str(treasury)])
    return {
        "description": "Hourly emission from R0 = CAP with no recycling and H > 0 in every hour (spec §3.1, §3.3).",
        "algorithm": [
            "DELTA_H_WAD = floor(1e18 * (1 - (1 - 0.0005)^(1/24)))  (constant, computed with 60-digit Decimal)",
            "E_h = floor(R_h * DELTA_H_WAD / 1e18)",
            "miners = floor(E_h * 9000 / 10000); dev = floor(E_h * 500 / 10000); treasury = E_h - miners - dev",
            "R_{h+1} = R_h - E_h   (the whole E_h is distributed because H > 0 for the full hour)",
        ],
        "delta_d": delta_d,
        "DELTA_H_WAD": str(dh),
        "R0_wei": str(r0),
        "columns": ["hour", "R_h_wei", "E_h_wei", "miners_wei", "dev_wei", "treasury_wei"],
        "rows": rows,
    }


def _vrgda_exact(t: Decimal, n: Decimal, q: Decimal, p0: Decimal, k: Decimal, r: Decimal) -> tuple[Decimal, Decimal]:
    ln_keep = (1 - k).ln()
    unit = p0 * ((t - n / r) * ln_keep).exp()
    ln_a = -ln_keep / r
    cost = unit * ((q * ln_a).exp() - 1) / (ln_a.exp() - 1)
    return unit, cost


def vrgda_vectors() -> dict[str, Any]:
    spec = load_params().spec
    mc = spec.machines
    points: list[tuple[str, str, str]] = []
    for t in ("0", "0.5", "1", "3", "7.25", "30", "100", "365"):
        on_schedule = Decimal(t) * Decimal(str(spec.r))
        for n in sorted({Decimal(0), on_schedule, on_schedule + 8000, max(on_schedule - 4000, Decimal(0))}):
            for q in ("1", "2700"):
                points.append((t, format(n.normalize(), "f"), q))
    points += [("0", "0", "50"), ("0", "0", "10000"), ("12.5", "200000", "1000"), ("730", "4000000", "420"),
               ("2", "48000", "150")]
    rows = []
    with localcontext() as ctx:
        ctx.prec = PREC
        p0, k, r = Decimal(str(spec.p0)), Decimal(str(spec.k)), Decimal(str(spec.r))
        for t, n, q in points:
            unit, cost = _vrgda_exact(Decimal(t), Decimal(n), Decimal(q), p0, k, r)
            row = {"t_days": t, "t_seconds": str((Decimal(t) * 86400).to_integral_value()), "n_units": n, "q_units": q,
                   "unit_price_wad": str(_floor_wad(unit)), "batch_cost_wad": str(_floor_wad(cost))}
            tier = [i for i in range(1, mc.n_tiers) if Decimal(str(mc.dp[i])) == Decimal(q)]
            if tier:
                prem = Decimal(str(mc.premium[tier[0]]))
                row["tier"] = tier[0]
                row["tier_cost_wad"] = str(_floor_wad(cost * (1 + prem)))
            rows.append(row)
    return {
        "description": "LinearVRGDA prices in DIG per DP unit (spec §6.2).",
        "algorithm": [
            "p(t, n) = p0 * (1 - k)^(t - n/r)            (t in days = seconds / 86400, n = DP units sold so far)",
            "unit j of a purchase costs p(t, n + j), j = 0..q-1 (spec convention; Art Gobblers uses sold + 1)",
            "batch_cost(q) = p(t, n) * (a^q - 1) / (a - 1),  a = (1 - k)^(-1/r)",
            "tier_cost = batch_cost(DP_tier) * (1 + premium_tier)",
            "reference: 60-digit Decimal, floored once to 1e-18",
        ],
        "params": {"p0_wad": str(_floor_wad(Decimal(str(spec.p0)))), "k": str(spec.k), "r_units_per_day": str(spec.r)},
        "rows": rows,
    }


def outpost_vectors() -> dict[str, Any]:
    o = load_params().spec.outpost
    rows = []
    with localcontext() as ctx:
        ctx.prec = PREC
        cumulative = Decimal(0)
        for level in range(1, o.max_level + 1):
            cap = Decimal(str(o.cap_base_kw)) * Decimal(str(o.cap_growth)) ** (level - 1)
            row = {"level": level, "slots": o.slot_base + level, "capacity_kw_wad": str(_floor_wad(cap)),
                   "cumulative_cost_from_L1_wad": str(_floor_wad(cumulative))}
            if level < o.max_level:
                cost = Decimal(str(o.cost_base)) * (Decimal(str(o.cost_exp)) * Decimal(level).ln()).exp()
                row["next_level_cost_wad"] = str(_floor_wad(cost))
                cumulative += cost
            rows.append(row)
    idx_rows = []
    for idx in ("0.25", "0.5", "1", "2", "4"):
        for row in rows[:-1:7]:
            idx_rows.append({"level": row["level"], "idx_wad": str(_floor_wad(Decimal(idx))),
                             "cost_wad": str(int(row["next_level_cost_wad"]) * _floor_wad(Decimal(idx)) // WAD)})
    return {
        "description": "Outpost table (spec §7) at idx = 1, plus idx-scaled examples.",
        "algorithm": [
            "slots(L) = 3 + L; capacity(L) = 6 * 1.22^(L-1) kW",
            "next_level_cost(L) = 150 * L^2.2 (idx = 1); L^2.2 is irrational, so contracts should store this table",
            "cost(L, idx) = floor(next_level_cost_wad(L) * idx_wad / 1e18), idx = clamp(p(t,n)/p0, 0.25, 4)",
        ],
        "rows": rows,
        "idx_examples": idx_rows,
    }


def _tank_capped_genesis(seed: int) -> tuple[str, str, str, str, str]:
    """Genesis inputs from a simulated v0.2 genesis (tank cap: Market Open + 24 h), base scenario."""
    params = load_params()
    sim = Simulation(params, SCENARIOS["base"], seed)
    for d in range(params.spec.genesis_days):
        sim.step(d)
    kwh = sim.genesis_purchased_usd / params.spec.energy_usd_per_kwh
    return (f"{kwh:.6f}", repr(params.spec.energy_usd_per_kwh), f"{sim.eth_usd:.8f}", f"{sim.pol_eth_open:.18f}",
            f"{sim.genesis_accrual:.18f}")


def market_open_vectors() -> dict[str, Any]:
    cap = 1_000_000 * WAD
    cases = [_tank_capped_genesis(seed) for seed in (0, 1, 2)] + [
        # (genesis kWh purchased, USD per kWh, ETH/USD, POL ETH, genesis miner accrual DIG)
        ("170000", "0.10", "3000", "1.7", "135000"),
        ("43771", "0.10", "3000", "0.4377", "134940.5"),
        ("2500000", "0.10", "2500", "30", "120000"),
        ("170000", "0.10", "3000", "1000", "135000"),        # DIG_LP hits the 1M cap
        ("1", "0.03", "1500", "0.000006", "1000"),
        ("98765.4321", "0.5", "4321.09", "3.4567", "149999.99"),
    ]
    rows = []
    for kwh, price, eth_usd, pol_eth, accrual in cases:
        kwh_w, price_w = _floor_wad(Decimal(kwh)), _floor_wad(Decimal(price))
        eth_usd_w, pol_w, acc_w = _floor_wad(Decimal(eth_usd)), _floor_wad(Decimal(pol_eth)), _floor_wad(Decimal(accrual))
        energy_usd = kwh_w * price_w // WAD
        p0 = energy_usd * WAD // acc_w
        lp_uncapped = pol_w * eth_usd_w // p0
        rows.append({
            "genesis_kwh_wad": str(kwh_w), "usd_per_kwh_wad": str(price_w), "eth_usd_wad": str(eth_usd_w),
            "pol_eth_wad": str(pol_w), "genesis_miner_accrual_wad": str(acc_w),
            "genesis_energy_usd_wad": str(energy_usd), "p0_usd_wad": str(p0),
            "dig_lp_uncapped_wad": str(lp_uncapped), "dig_lp_wad": str(min(lp_uncapped, cap)),
        })
    return {
        "description": ("Market open (spec §11): P0_USD and DIG_LP from genesis inputs. Rows 0–2 come from simulated "
                        "v0.2 genesis runs (base scenario, seeds 0–2) with the genesis tank cap (Market Open + 24 h); "
                        "the other rows are edge cases."),
        "algorithm": [
            "energy_usd = floor(kWh_wad * usd_per_kwh_wad / 1e18)   (energy is priced in USD, so its USD value is exact)",
            "P0 = floor(energy_usd * 1e18 / miner_accrual_wad)",
            "DIG_LP = min(floor(pol_eth_wad * eth_usd_wad / P0), 1_000_000e18)   (minted from the reserve)",
            "Chainlink ETH/USD has 8 decimals: scale it to 18 before use (x * 1e10).",
            ("Genesis energy spend = kWh PURCHASED during pre-fill and genesis; with the v0.2 tank cap a purchase may"
            " only last until Market Open + 24 h, so purchased ≈ consumed + one day."),
        ],
        "rows": rows,
    }


def _floor_signed_wad(x: Decimal) -> int:
    """Floor toward −∞ (the schedule offset can be negative)."""
    return int((x * WAD).to_integral_value(rounding=ROUND_FLOOR))


def vrgda_reanchor_vectors() -> dict[str, Any]:
    """Price-continuous r change (spec v0.2 §12; engine/governance.py)."""
    spec = load_params().spec
    cases = [  # (t_days, n_units, r_old, r_new) applied in sequence
        ("120", "150000", "2000", "1500"),
        ("180", "230000", "1500", "1125"),
        ("400", "600000", "1125", "1406.25"),
        ("401.5", "602500", "1406.25", "1757.8125"),
    ]
    rows = []
    with localcontext() as ctx:
        ctx.prec = PREC
        p0, k = Decimal(str(spec.p0)), Decimal(str(spec.k))
        ln_keep = (1 - k).ln()
        s_a = t_a = n_a = Decimal(0)
        for t, n, r_old, r_new in cases:
            t, n, r_old, r_new = Decimal(t), Decimal(n), Decimal(r_old), Decimal(r_new)
            s_now = s_a + (t - t_a) - (n - n_a) / r_old
            price_before = p0 * (s_now * ln_keep).exp()
            s_a, t_a, n_a = s_now, t, n
            price_after = p0 * ((s_a + (t - t_a) - (n - n_a) / r_new) * ln_keep).exp()
            later = p0 * ((s_a + 1 - 1000 / r_new) * ln_keep).exp()  # one day later, 1,000 units sold since
            rows.append({"t_days": str(t), "n_units": str(n), "r_old": str(r_old), "r_new": str(r_new),
                         "s_anchor_wad": str(_floor_signed_wad(s_a)), "t_anchor_days": str(t_a), "n_anchor": str(n_a),
                         "price_before_wad": str(_floor_wad(price_before)), "price_after_wad": str(_floor_wad(price_after)),
                         "price_t_plus_1d_n_plus_1000_wad": str(_floor_wad(later))})
    return {
        "description": "VRGDA re-anchoring when governance changes r (spec v0.2 §12): the price must not jump.",
        "algorithm": [
            "p(t, n) = p0 * (1 - k)^(s_a + (t - t_a) - (n - n_a)/r)   (s_a = t_a = n_a = 0 before any change)",
            "on a change to r_new at (t, n): s_a := s_a + (t - t_a) - (n - n_a)/r_old; t_a := t; n_a := n; r := r_new",
            "rows are applied in sequence; s_anchor_wad is floored toward -infinity",
            ("without re-anchoring, cutting r by 25 % with n = 1M sold moves the schedule ~167 days and the price "
            "by a factor of ~0.85^-167"),
        ],
        "params": {"p0": str(spec.p0), "k": str(spec.k)},
        "rows": rows,
    }


VECTORS = {
    "emission_hourly.json": emission_vectors,
    "vrgda_costs.json": vrgda_vectors,
    "outpost_costs.json": outpost_vectors,
    "market_open.json": market_open_vectors,
    "vrgda_reanchor.json": vrgda_reanchor_vectors,
}


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for name, build in VECTORS.items():
        (OUT / name).write_text(json.dumps(build(), indent=1), encoding="utf-8")
        print("wrote", OUT / name)


if __name__ == "__main__":
    main()
