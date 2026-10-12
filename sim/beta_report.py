"""Daily beta report (docs/06 7.2): live economy from the indexer API against the simulator.

Usage (from the sim folder):
    .venv\\Scripts\\python.exe beta_report.py --api https://api.mohonaut.com --genesis 1791756000
    .venv\\Scripts\\python.exe beta_report.py --days days.json --genesis 1791756000   # offline

Compares, day by day since genesis, the 28-day flows of /economy/daily with the simulator's fan
(results/fans.npz, scenario `spec__base` unless --scenario): emission must follow the schedule
(it is deterministic), burns and the 28-day sink ratio should sit inside the 5-95 % band.
USD figures are left out: testnet prices are fake. Output: a Markdown report on stdout.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from engine.metrics import rolling

ROOT = Path(__file__).resolve().parent
WAD = 10**18
DAY = 86_400
EMISSION_TOLERANCE = 0.01  # the schedule is exact; 1 % allows for an hour closed late


@dataclass(frozen=True)
class Check:
    day: int
    metric: str
    live: float
    p5: float
    p50: float
    p95: float
    verdict: str


def load_fans(path: Path, scenario: str) -> dict[str, np.ndarray]:
    fans = np.load(path)
    prefix = f"{scenario}__"
    out = {k[len(prefix) :]: fans[k] for k in fans.files if k.startswith(prefix)}
    if not out:
        raise SystemExit(f"no scenario {scenario!r} in {path}")
    return out


def daily_series(days: list[dict], genesis_day: int) -> dict[str, np.ndarray]:
    """Live daily flows in MOHN, indexed by days since genesis (missing days are zero)."""
    rows = [d for d in days if d["day"] >= genesis_day]
    if not rows:
        return {"emission": np.zeros(0), "burned": np.zeros(0), "recycled": np.zeros(0)}
    n = max(d["day"] for d in rows) - genesis_day + 1
    series = {k: np.zeros(n) for k in ("emission", "burned", "recycled")}
    for d in rows:
        i = d["day"] - genesis_day
        series["emission"][i] = int(d["emitted"]) / WAD
        series["burned"][i] = int(d["burned"]) / WAD
        series["recycled"][i] = int(d["recycled"]) / WAD
    return series


def compare(days: list[dict], genesis_day: int, fans: dict[str, np.ndarray]) -> list[Check]:
    live = daily_series(days, genesis_day)
    checks: list[Check] = []
    # The simulator's flow fans are trailing 28-day sums / 28 (run_scenarios.py); same here.
    emission = rolling(live["emission"]) / 28.0
    burned = rolling(live["burned"]) / 28.0
    sim_burn = sum(fans[k] for k in ("burn_spend", "burn_cosmetic", "burn_fee", "burn_buyback") if k in fans)
    for i in range(len(emission)):
        if i >= fans["emission"].shape[1]:
            break
        p5, _, p50, _, p95 = fans["emission"][:, i]
        off = abs(emission[i] - p50) / p50 if p50 > 0 else 0.0
        checks.append(Check(i, "emission", emission[i], p5, p50, p95, "ok" if off <= EMISSION_TOLERANCE else f"off schedule by {off:.1%}"))
        b5, _, b50, _, b95 = sim_burn[:, i]
        checks.append(Check(i, "burned", burned[i], b5, b50, b95, _band(burned[i], b5, b95)))
        s5, _, s50, _, s95 = fans["sr28"][:, i]
        sr = burned[i] / emission[i] if emission[i] > 0 else float("nan")
        checks.append(Check(i, "sr28", sr, s5, s50, s95, _band(sr, s5, s95)))
    return checks


def _band(x: float, lo: float, hi: float) -> str:
    if np.isnan(x):
        return "no data"
    if x < lo:
        return "below the 5 % band"
    if x > hi:
        return "above the 95 % band"
    return "ok"


def report(checks: list[Check], scenario: str) -> str:
    lines = [
        f"# Beta economy report against `{scenario}`",
        "",
        "28-day flows per day (MOHN/day; SR = burned / emitted). Testnet prices are fake, so USD figures are not compared.",
        "",
        "| Day | Metric | Live | Sim 5 % | Sim 50 % | Sim 95 % | Verdict |",
        "|---:|---|---:|---:|---:|---:|---|",
    ]
    for c in checks:
        lines.append(f"| {c.day} | {c.metric} | {c.live:,.2f} | {c.p5:,.2f} | {c.p50:,.2f} | {c.p95:,.2f} | {c.verdict} |")
    off = [c for c in checks if c.verdict != "ok"]
    lines += ["", f"**{len(off)} of {len(checks)} checks outside expectations.**"]
    for c in off:
        lines.append(f"- day {c.day}, {c.metric}: {c.verdict}")
    return "\n".join(lines) + "\n"


def fetch_days(api: str) -> list[dict]:
    with urllib.request.urlopen(f"{api.rstrip('/')}/economy/daily?days=365", timeout=30) as res:
        return json.load(res)["days"]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--api", help="API base URL, e.g. https://api.mohonaut.com")
    src.add_argument("--days", type=Path, help="a saved /economy/daily response")
    ap.add_argument("--genesis", type=int, required=True, help="genesis time (Unix seconds, deployments/*.json)")
    ap.add_argument("--fans", type=Path, default=ROOT / "results" / "fans.npz")
    ap.add_argument("--scenario", default="spec__base")
    args = ap.parse_args(argv)
    days = fetch_days(args.api) if args.api else json.loads(args.days.read_text(encoding="utf-8"))["days"]
    checks = compare(days, args.genesis // DAY, load_fans(args.fans, args.scenario))
    sys.stdout.write(report(checks, args.scenario))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
