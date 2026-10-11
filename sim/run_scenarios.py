"""Monte Carlo study of the current spec (v0.2): scenarios, variants, sweeps, calibration, report.

Usage (from the sim folder, Windows PowerShell):
    .venv\\Scripts\\python.exe run_scenarios.py                      # everything (≈ 25 min, 14-core laptop)
    .venv\\Scripts\\python.exe run_scenarios.py --parts spec,nogov    # some parts; then --parts report
    .venv\\Scripts\\python.exe run_scenarios.py --quick              # 4 seeds everywhere (smoke test)

Each part caches its aggregated output in <out>/raw/<part>.pkl; ``report`` merges whatever is
cached into <out>/*.json, <out>/tables.md and charts/<out name>/*.png. ``--param-set FILE``
applies dotted overrides to every run (e.g. param_sets/v01.json reproduces spec v0.1).
Seed i is the same random stream in every configuration (common random numbers).
"""
from __future__ import annotations

import os

# One BLAS thread per worker process: the model's small matrix products gain nothing from
# threading, and N processes × M BLAS threads oversubscribe the CPU. Must precede numpy import.
for _var in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_var, "1")

import argparse
import json
import math
import pickle
import time
import warnings
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from typing import Any

import numpy as np

from engine import charts
from engine.config import T_SYBIL, load_params
from engine.metrics import evaluate_criteria, rolling, sr_series, summarize_run
from engine.model import Simulation
from engine.scenarios import SCENARIOS

ROOT = Path(__file__).resolve().parent
PARAM_SETS = ROOT / "param_sets"
V01_CACHE = ROOT / "results" / "raw" / "spec.pkl"  # the v0.1 study (200 seeds), see RAPOR.md §1–10
ALL = tuple(SCENARIOS)

# part → (overrides file or None, scenarios, seeds argument, what to keep per run)
VARIANT_PARTS: dict[str, tuple[str | None, tuple[str, ...], str, str]] = {
    "spec": (None, ALL, "seeds", "full"),
    "nogov": ("v02_nogov.json", ALL, "variant_seeds", "full"),
    "notank": ("v02_notankcap.json", ("base",), "seeds", "full"),
}
# sweep knob → (label, dotted keys, values); the spec value is taken from the "spec" part
SWEEPS: dict[str, tuple[str, tuple[str, ...], list[Any]]] = {
    "vrgda_r": ("VRGDA r (DP/gün)", ("spec.vrgda.r",), [1000.0, 1500.0, 2000.0, 3000.0]),
    "vrgda_k": ("VRGDA k", ("spec.vrgda.k",), [0.10, 0.15, 0.25]),
    "revenue": ("ETH dağılımı BB/POL/Ops", ("spec.revenue.buyback", "spec.revenue.ops"), [(0.55, 0.15), (0.60, 0.10)]),
    "tank": ("Genesis tank sınırı (saat, açılış sonrası)", ("spec.genesis.tank_until_hours_after_open",),
             [24.0, 72.0]),
}
SWEEP_METRICS = (
    ("price_m24_gt_30pct_m2", "P(24.ay > %30 × 2.ay)"), ("sr_m12", "SR 12. ay"),
    ("payback_entry_share_weeks_below", "Geri dönüş <365g kohort payı"), ("ratio_m24_m2", "Fiyat 24.ay / 2.ay"),
    ("players_m12", "Aktif oyuncu 12. ay"), ("gini_max", "Gini (maks.)"),
)
DEMAND_KEYS = ("model.adoption.genesis_players", "model.adoption.wave_players", "model.adoption.tail_per_day",
               "model.speculators.usd_per_active_player", "model.whales.rate_per_day")
FAN_KEYS = ("price_usd", "H", "players", "vrgda_price", "vrgda_r", "pool_eth_usd", "sr28", "mint_daily",
            "emission", "burn_spend", "burn_cosmetic", "burn_fee", "burn_buyback", "recycled")
FLOW_KEYS = ("emission", "burn_spend", "burn_cosmetic", "burn_fee", "burn_buyback", "recycled")


# --------------------------------------------------------------------------------- jobs
def _job(args: tuple[str, str, int, dict[str, Any], str]) -> tuple[str, str, int, dict[str, float], dict | None]:
    tag, scenario, seed, overrides, keep = args
    params = load_params(overrides)
    res = Simulation(params, SCENARIOS[scenario], seed).run()
    summary = summarize_run(res.series, res.monthly, res.cohorts, res.scalars, params)
    s = res.series
    extra: dict[str, Any] = {"mint_daily": s["mint_daily"].astype(np.float32),
                             "mint_hourly_max": s["mint_hourly_max"].astype(np.float32)}
    if keep == "full":
        fans = {"price_usd": s["price_usd"], "H": s["H"], "players": s["players"], "vrgda_price": s["vrgda_price"],
                "vrgda_r": s["vrgda_r"], "pool_eth_usd": s["pool_eth"] * s["eth_usd"], "sr28": sr_series(s),
                "mint_daily": s["mint_daily"]}
        fans.update({key: rolling(s[key]) / 28.0 for key in FLOW_KEYS})
        co = res.cohorts
        keep_c = (co["entry_capex_pp"] > 0) & (co["join"] <= len(s["H"]) - 366) & (co["typ"] != T_SYBIL)
        payback = np.where(np.isnan(co["payback_entry_day"]), np.inf, co["payback_entry_day"])[keep_c]
        extra.update({"fans": {k: v.astype(np.float32) for k, v in fans.items()}, "gini": res.monthly["gini"],
                      "payback": (payback, co["N0"][keep_c])})
    return tag, scenario, seed, summary, extra


def run_batch(jobs: list[tuple], workers: int) -> list[tuple]:
    with ProcessPoolExecutor(max_workers=workers) as ex:
        return list(ex.map(_job, jobs, chunksize=1))


# ---------------------------------------------------------------------------- aggregation
def _with_flags(summary: dict[str, float]) -> dict[str, float]:
    summary["price_m24_gt_30pct_m2"] = float(summary.get("ratio_m24_m2", math.nan) > 0.3)
    summary["price_m24_gt_30pct"] = float(summary.get("ratio_m24_m1", math.nan) > 0.3)
    return summary


def stats(runs: list[dict[str, float]]) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    for key in runs[0]:
        arr = np.array([r.get(key, math.nan) for r in runs], dtype=float)
        finite = arr[~np.isnan(arr)]
        if len(finite) == 0:
            continue
        q = np.quantile(finite, [0.05, 0.25, 0.5, 0.75, 0.95], method="inverted_cdf")
        out[key] = {"p5": q[0], "p25": q[1], "p50": q[2], "p75": q[3], "p95": q[4],
                    "mean": float(np.mean(finite)) if np.all(np.isfinite(finite)) else math.inf}
    return out


def fan_stats(extras: list[dict]) -> dict[str, np.ndarray]:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        return {key: np.nanpercentile(np.stack([e["fans"][key] for e in extras]), [5, 25, 50, 75, 95], axis=0)
                for key in FAN_KEYS}


def _clean(obj: Any) -> Any:
    """JSON-safe: inf/nan → strings."""
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_clean(v) for v in obj]
    if isinstance(obj, (float, np.floating)):
        return float(obj) if math.isfinite(obj) else str(float(obj))
    if isinstance(obj, np.integer):
        return int(obj)
    return obj


def _get(tree: dict[str, Any], dotted: str) -> Any:
    node = tree
    for part in dotted.split("."):
        node = node[part]
    return node


def _overrides(file: str | None) -> dict[str, Any]:
    return json.loads((PARAM_SETS / file).read_text(encoding="utf-8")) if file else {}


class Study:
    def __init__(self, out: Path, base: dict[str, Any], workers: int) -> None:
        self.out, self.raw = out, out / "raw"
        self.charts = ROOT / "charts" / out.name
        self.base = base
        self.workers = workers

    def save(self, part: str, obj: Any) -> None:
        self.raw.mkdir(parents=True, exist_ok=True)
        with open(self.raw / f"{part}.pkl", "wb") as fh:
            pickle.dump(obj, fh)

    def load(self, part: str) -> Any:
        path = self.raw / f"{part}.pkl"
        if not path.exists():
            return None
        with open(path, "rb") as fh:
            return pickle.load(fh)

    def dump(self, name: str, obj: Any) -> None:
        (self.out / name).write_text(json.dumps(_clean(obj), indent=1, ensure_ascii=False), encoding="utf-8")

    # ------------------------------------------------------------------------- parts
    def variant(self, part: str, seeds: int) -> None:
        file, scenarios, _, keep = VARIANT_PARTS[part]
        overrides = {**self.base, **_overrides(file)}
        jobs = [(part, name, seed, overrides, keep) for name in scenarios for seed in range(seeds)]
        print(f"[{part}] {len(jobs)} runs on {self.workers} workers ...", flush=True)
        t = time.time()
        runs: dict[str, list] = {}
        extras: dict[str, list] = {}
        for _, name, _, summary, extra in run_batch(jobs, self.workers):
            runs.setdefault(name, []).append(_with_flags(summary))
            extras.setdefault(name, []).append(extra)
        self.save(part, {
            "seeds": seeds, "seconds": time.time() - t, "runs": runs,
            "fans": {n: fan_stats(e) for n, e in extras.items()},
            "gini": {n: np.nanmedian(np.stack([x["gini"] for x in e]), axis=0) for n, e in extras.items()},
            "payback": {n: (np.concatenate([x["payback"][0] for x in e]), np.concatenate([x["payback"][1] for x in e]))
                        for n, e in extras.items()},
            "mint": {n: (np.stack([x["mint_daily"] for x in e]), np.stack([x["mint_hourly_max"] for x in e]))
                     for n, e in extras.items()},
        })

    def sweep_index(self) -> list[tuple[str, str, Any, dict[str, Any], bool]]:
        spec_raw = load_params(self.base).raw
        index = []
        for knob, (label, keys, values) in SWEEPS.items():
            for value in values:
                vals = value if isinstance(value, tuple) else (value,)
                overrides = dict(zip(keys, vals))
                if knob == "revenue":
                    overrides["spec.revenue.pol"] = 1.0 - vals[0] - vals[1]
                is_spec = all(math.isclose(_get(spec_raw, k), v, rel_tol=1e-9, abs_tol=1e-12)
                              for k, v in overrides.items())
                index.append((knob, label, value, overrides, is_spec))
        return index

    def sweeps(self, seeds: int) -> None:
        jobs = [(f"{knob}:{value}", "base", s, {**self.base, **ov}, "mint")
                for knob, _, value, ov, is_spec in self.sweep_index() if not is_spec for s in range(seeds)]
        self._summaries_only("sweeps", jobs, seeds)

    def calib(self, seeds: int) -> None:
        base_raw = load_params(self.base).raw
        jobs = []
        for mult in (0.5, 2.0):
            demand = {key: _get(base_raw, key) * mult for key in DEMAND_KEYS}
            for tag, file in (("spec", None), ("nogov", "v02_nogov.json")):
                ov = {**self.base, **_overrides(file), **demand}
                jobs += [(f"{tag}:x{mult:g}", "base", s, ov, "mint") for s in range(seeds)]
        self._summaries_only("calib", jobs, seeds)

    def _summaries_only(self, part: str, jobs: list[tuple], seeds: int) -> None:
        print(f"[{part}] {len(jobs)} runs ...", flush=True)
        t = time.time()
        runs: dict[str, list] = {}
        mint: dict[str, list] = {}
        for tag, _, _, summary, extra in run_batch(jobs, self.workers):
            runs.setdefault(tag, []).append(_with_flags(summary))
            mint.setdefault(tag, []).append((extra["mint_daily"], extra["mint_hourly_max"]))
        self.save(part, {"seeds": seeds, "seconds": time.time() - t, "runs": runs,
                         "mint": {tag: (np.stack([a for a, _ in v]), np.stack([b for _, b in v])) for tag, v in mint.items()}})

    def details(self, seeds: int) -> None:
        jobs = [(name, seed, self.base) for name in ("base", "whale") for seed in range(seeds)]
        print(f"[details] {len(jobs)} runs ...", flush=True)
        with ProcessPoolExecutor(max_workers=self.workers) as ex:
            results = list(ex.map(_detail_job, jobs, chunksize=1))
        out: dict[str, list] = {}
        for (name, _, _), res in zip(jobs, results):
            out.setdefault(name, []).append(res)
        self.out.mkdir(parents=True, exist_ok=True)
        self.dump("details.json", {tag: stats(rs) for tag, rs in out.items()})

    # ------------------------------------------------------------------------- report
    def report(self) -> None:
        self.out.mkdir(parents=True, exist_ok=True)
        self.charts.mkdir(parents=True, exist_ok=True)
        parts = {name: self.load(name) for name in (*VARIANT_PARTS, "sweeps", "calib")}
        spec, _nogov, _notank, sweeps, calib = (parts[n] for n in ("spec", "nogov", "notank", "sweeps", "calib"))
        referral = load_params(self.base).spec.referral_rate
        agg = {name: {n: stats(r) for n, r in part["runs"].items()} for name, part in parts.items()
               if part is not None and name in VARIANT_PARTS}
        criteria = {name: evaluate_criteria(part["runs"], referral) for name, part in parts.items()
                    if part is not None and name in ("spec", "nogov")}
        if V01_CACHE.exists():
            with open(V01_CACHE, "rb") as fh:
                v01 = pickle.load(fh)
            for runs in v01["runs"].values():
                for r in runs:
                    _with_flags(r)
            criteria["v01"] = evaluate_criteria(v01["runs"], referral)
            agg["v01"] = {n: stats(r) for n, r in v01["runs"].items()}
        sweep_rows = self._sweep_rows(spec, sweeps) if spec and sweeps else []
        calib_agg = {tag: stats(r) for tag, r in calib["runs"].items()} if calib else {}
        mint_table = mint_distribution({name: part for name, part in parts.items() if part is not None})
        all_runs = [r for part in parts.values() if part is not None for rs in part["runs"].values() for r in rs]
        max_err = max(r["max_invariant_err"] for r in all_runs)

        self.dump("scenarios.json", agg)
        self.dump("criteria.json", criteria)
        self.dump("sweeps.json", sweep_rows)
        self.dump("calibration.json", calib_agg)
        self.dump("mint.json", mint_table)
        self.dump("run_info.json", {
            "parts": {name: {"seeds": part["seeds"], "seconds": part["seconds"],
                             "runs": sum(len(r) for r in part["runs"].values())}
                      for name, part in parts.items() if part is not None},
            "total_runs": len(all_runs), "base_overrides": self.base, "max_supply_invariant_error_dig": max_err,
        })
        write_tables(self.out, agg, criteria, sweep_rows, calib_agg, mint_table, parts)
        if spec:
            make_charts(self.charts, parts)
        print(f"report written to {self.out}; {len(all_runs)} runs, max supply-invariant error {max_err:.3g} DIG",
              flush=True)

    def _sweep_rows(self, spec: dict, sweeps: dict) -> list[dict[str, Any]]:
        rows = []
        for knob, label, value, overrides, is_spec in self.sweep_index():
            rs = spec["runs"]["base"][: sweeps["seeds"]] if is_spec else sweeps["runs"][f"{knob}:{value}"]
            st = stats(rs)
            values = value if isinstance(value, tuple) else (value,)
            row: dict[str, Any] = {"knob": knob, "label": label, "overrides": overrides, "is_spec": is_spec,
                                   "value_label": "/".join(f"{v:g}" for v in values), "n_runs": len(rs)}
            if knob == "revenue":
                row["value_label"] = f"{value[0] * 100:.0f}/{(1 - value[0] - value[1]) * 100:.0f}/{value[1] * 100:.0f}"
            for key, _ in SWEEP_METRICS:
                row[key] = ((st[key]["mean"],) * 3 if key == "price_m24_gt_30pct_m2"
                            else (st[key]["p25"], st[key]["p50"], st[key]["p75"]))
            row["all"] = st
            rows.append(row)
        return rows


def _detail_job(args: tuple[str, int, dict[str, Any]]) -> dict[str, float]:
    """Diagnostics the summaries do not hold: whale share of H, who sells, World Depth milestones."""
    scenario, seed, overrides = args
    params = load_params(overrides)
    sim = Simulation(params, SCENARIOS[scenario], seed)
    sc = SCENARIOS[scenario]
    whale_share = 0.0
    for d in range(params.model.days):
        sim.step(d)
        if sc.whale_day <= d < sc.whale_day + sc.whale_hold_days:
            co, k = sim.co, sim.co.k
            forced = np.isfinite(co.target_dp_pp[:k])
            whale_dp = float((co.N[:k][forced] * (co.mach[:k][forced] @ params.spec.machines.dp)).sum())
            whale_share = max(whale_share, whale_dp / max(sim.rec["H"][d], 1.0))
    s = sim.rec
    out = {"whale_max_share_of_H": whale_share}
    for label, depth in (("kola", 12_262.0), ("moho", 35_000.0)):
        hit = np.flatnonzero(s["depth_m"] >= depth)
        out[f"day_{label}"] = float(hit[0]) if len(hit) else math.inf
    for m in (12, 24, 36):
        out[f"treasury_pending_m{m}"] = float(s["treasury_pending"][30 * m - 1])
    year1 = slice(3, 365)
    emitted = float(s["emission"][year1].sum())
    for key in ("sold_wallets", "sold_exits", "sold_dev", "burn_buyback", "spec_sold"):
        out[f"y1_{key}_per_E"] = float(s[key][year1].sum()) / emitted
    return out


def mint_distribution(parts: dict[str, dict]) -> dict[str, dict[str, float]]:
    """Pooled daily and hourly mint statistics (all run-days of every part), spec v0.2 §2."""
    out: dict[str, dict[str, float]] = {}
    pooled_d, pooled_h, open_d, open_h = [], [], [], []
    for name, part in parts.items():
        for tag, (daily, hourly) in part.get("mint", {}).items():
            pooled_d.append(daily.ravel())
            pooled_h.append(hourly.ravel())
            open_d.append(daily[:, 3])
            open_h.append(hourly[:, 3])
            out[f"{name}:{tag}"] = {"runs": float(len(daily)), "max_daily": float(daily.max()),
                                    "max_hourly": float(hourly.max())}
    d, h = np.concatenate(pooled_d), np.concatenate(pooled_h)
    od, oh = np.concatenate(open_d), np.concatenate(open_h)
    out["pooled"] = {
        "run_days": float(len(d)),
        "daily_p50": float(np.quantile(d, 0.5)), "daily_p99": float(np.quantile(d, 0.99)),
        "daily_p999": float(np.quantile(d, 0.999)), "daily_max": float(d.max()),
        "hourly_p50": float(np.quantile(h, 0.5)), "hourly_p99": float(np.quantile(h, 0.99)),
        "hourly_p999": float(np.quantile(h, 0.999)), "hourly_max": float(h.max()),
        "open_day_p50": float(np.quantile(od, 0.5)), "open_day_max": float(od.max()),
        "open_hour_p50": float(np.quantile(oh, 0.5)), "open_hour_max": float(oh.max()),
        "after_open_daily_max": float(max(part["mint"][tag][0][:, 4:].max() for part in parts.values()
                                          for tag in part.get("mint", {}))),
        "after_open_hourly_max": float(max(part["mint"][tag][1][:, 4:].max() for part in parts.values()
                                           for tag in part.get("mint", {}))),
    }
    return out


# ------------------------------------------------------------------------------- tables
def _fmt(v: float, digits: int = 3) -> str:
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return "–"
    if math.isinf(v):
        return "∞"
    if abs(v) >= 1e6:
        return f"{v / 1e6:.2f}M"
    if abs(v) >= 1e4:
        return f"{v / 1e3:.0f}K"
    if abs(v) >= 100:
        return f"{v:.0f}"
    return f"{v:.{digits}g}"


TITLES = {n: sc.title for n, sc in SCENARIOS.items()}
SHORT_TITLES = {"base": "Baz", "bear": "Ayı (−%70)", "deep_bear": "Derin ayı (−%90)", "whale": "Balina (%20 H)",
                "churn": "Churn (−%80 giriş)", "sybil": "Sybil (1.000 cüzdan)", "hype": "Hype (10x giriş)"}
TABLE_ROWS = (
    ("p0_usd", "P0 (USD)"), ("genesis_purchased_usd", "Genesis enerji alımı (USD)"),
    ("pol_eth_open", "Açılış POL (ETH)"), ("dig_lp", "Açılış DIG_LP"),
    ("price_m1", "Fiyat 1. ay ort."), ("price_peak_m1", "Fiyat 1. ay tepe"), ("price_m2", "Fiyat 2. ay ort."),
    ("price_m12", "Fiyat 12. ay"), ("price_m24", "Fiyat 24. ay"), ("price_m36", "Fiyat 36. ay"),
    ("ratio_m24_m2", "Fiyat 24.ay / 2.ay"), ("players_m12", "Aktif oyuncu 12. ay"), ("players_m36", "Aktif oyuncu 36. ay"),
    ("H_m12", "Aktif H 12. ay (DP)"), ("vrgda_m12", "VRGDA p 12. ay"), ("vrgda_m24", "VRGDA p 24. ay"),
    ("r_final", "r (36. ay sonu)"), ("r_changes", "r değişikliği sayısı"),
    ("sr_m12", "SR 12. ay"), ("sr_m36", "SR 36. ay"), ("ne_cum", "NE 3 yıl (DIG)"),
    ("rcr_m12", "RCR 12. ay"), ("s_m12", "s 12. ay"),
    ("payback_entry_share_weeks_below", "Geri dönüş <365g kohort payı"),
    ("payback_entry_median_days", "Geri dönüş medyan (gün)"),
    ("gini_m12", "Gini 12. ay"), ("gini_max", "Gini maks."), ("nakamoto_m36", "Nakamoto 36. ay"),
    ("pol_usd_m12", "POL ETH tarafı 12. ay (USD)"), ("ops_income_m12", "Ops geliri 12. ay (USD/ay)"),
    ("ops_income_m36", "Ops geliri 36. ay (USD/ay)"), ("burned_m36", "Kalıcı yakılan 36. ay"),
    ("mint_max_daily", "En yüksek günlük mint"), ("mint_open_day", "Açılış günü mint"),
    ("mint_max_hourly", "En yüksek saatlik mint"), ("bankrun_max", "Anlık hızlı-rafine potansiyeli (maks.)"),
)


def scenario_table(agg: dict[str, dict[str, dict[str, float]]]) -> str:
    names = list(agg)
    lines = ["| Metrik | " + " | ".join(SHORT_TITLES[n] for n in names) + " |", "|---|" + "---|" * len(names)]
    for key, label in TABLE_ROWS:
        cells = []
        for n in names:
            st = agg[n].get(key)
            cells.append("–" if st is None else f"{_fmt(st['p50'])} [{_fmt(st['p5'])}–{_fmt(st['p95'])}]")
        lines.append(f"| {label} | " + " | ".join(cells) + " |")
    lines.append("| P(24.ay > %30 × 2.ay) | " + " | ".join(_fmt(agg[n]["price_m24_gt_30pct_m2"]["mean"]) for n in names)
                 + " |")
    return "\n".join(lines)


def criteria_compare(criteria: dict[str, list[dict[str, Any]]]) -> str:
    cols = [c for c in ("v01", "spec", "nogov") if c in criteria]
    head = {"v01": "v0.1 parametreleri (200 tohum)", "spec": "v0.2 (200 tohum)", "nogov": "v0.2, kural kapalı (100 tohum)"}
    keys = list(dict.fromkeys((r["criterion"], r["scenario"]) for c in cols for r in criteria[c]))
    lines = ["| Kriter (v0.2 tanımı) | Senaryo | Hedef | " + " | ".join(head[c] for c in cols) + " |",
             "|---|---|---|" + "---|" * len(cols)]
    for crit, scen in keys:
        target, cells = "", []
        for c in cols:
            row = next((r for r in criteria[c] if (r["criterion"], r["scenario"]) == (crit, scen)), None)
            if row is None:
                cells.append("–")
                continue
            target = row["target"]
            verdict = "izlenir" if row["passed"] is None else ("GEÇTİ" if row["passed"] else "**KALDI**")
            cells.append(f"{verdict} ({_fmt(row['value'])})")
        lines.append(f"| {crit} | {SHORT_TITLES.get(scen, scen)} | {target} | " + " | ".join(cells) + " |")
    return "\n".join(lines)


def sweep_table(rows: list[dict[str, Any]]) -> str:
    head = "| Ayar | Değer | " + " | ".join(lab for _, lab in SWEEP_METRICS) + " |"
    lines = [head, "|---|---|" + "---|" * len(SWEEP_METRICS)]
    for r in rows:
        mark = " (v0.2)" if r["is_spec"] else ""
        cells = [_fmt(r[k][1]) if k == "price_m24_gt_30pct_m2" else f"{_fmt(r[k][1])} [{_fmt(r[k][0])}–{_fmt(r[k][2])}]"
                 for k, _ in SWEEP_METRICS]
        lines.append(f"| {r['label']} | {r['value_label']}{mark} | " + " | ".join(cells) + " |")
    return "\n".join(lines)


PAIRED_ROWS = (
    ("p0_usd", "P0 (USD)"), ("genesis_purchased_usd", "Genesis enerji alımı (USD)"), ("pol_eth_open", "Açılış POL (ETH)"),
    ("dig_lp", "Açılış DIG_LP"), ("price_m1", "Fiyat 1. ay ort."), ("price_peak_m1", "Fiyat 1. ay tepe"),
    ("price_m2", "Fiyat 2. ay ort."), ("price_m12", "Fiyat 12. ay"), ("price_m24", "Fiyat 24. ay"),
    ("vrgda_m12", "VRGDA p 12. ay"), ("vrgda_m24", "VRGDA p 24. ay"), ("r_final", "r (son)"),
    ("sr_m12", "SR 12. ay"), ("sr_m36", "SR 36. ay"), ("payback_entry_share_weeks_below", "Geri dönüş <365g payı"),
    ("players_m36", "Aktif oyuncu 36. ay"), ("gini_max", "Gini maks."), ("nakamoto_m36", "Nakamoto 36. ay"),
    ("burned_m36", "Kalıcı yakılan 36. ay"),
)


def paired_table(a: dict[str, list], b: dict[str, list], names: tuple[str, ...], labels: tuple[str, str],
                 rows: tuple[tuple[str, str], ...]) -> str:
    """Medians of two configurations on the same seeds (seed i = run i in both lists)."""
    lines = ["| Metrik | " + " | ".join(f"{SHORT_TITLES[n]}: {labels[0]} / {labels[1]}" for n in names) + " |",
             "|---|" + "---|" * len(names)]
    for key, label in rows:
        cells = []
        for n in names:
            m = min(len(a[n]), len(b[n]))
            va = np.nanmedian([r.get(key, math.nan) for r in a[n][:m]])
            vb = np.nanmedian([r.get(key, math.nan) for r in b[n][:m]])
            cells.append(f"{_fmt(va)} / {_fmt(vb)}")
        lines.append(f"| {label} | " + " | ".join(cells) + " |")
    return "\n".join(lines)


def write_tables(out: Path, agg, criteria, sweep_rows, calib_agg, mint_table, raw: dict[str, dict | None]) -> None:
    sections = []
    if criteria:
        sections += ["## Kabul kriterleri (v0.2 tanımları)", criteria_compare(criteria)]
    for name, title in (("spec", "v0.2 (200 tohum)"), ("nogov", "v0.2, §12 kuralı kapalı (100 tohum)"),
                        ("notank", "v0.2, genesis tank sınırı kapalı (baz, 200 tohum)")):
        if name in agg:
            sections += [f"## Senaryo sonuçları — {title} (medyan [P5–P95])", scenario_table(agg[name])]
    if raw.get("spec") and raw.get("nogov"):
        sections += ["## §12 r kuralının etkisi (aynı tohumlar; açık / kapalı)",
                     paired_table(raw["spec"]["runs"], raw["nogov"]["runs"], ("bear", "deep_bear", "churn", "hype"),
                                  ("açık", "kapalı"), PAIRED_ROWS[4:])]
    if raw.get("spec") and raw.get("notank"):
        sections += ["## Genesis tank sınırının etkisi (baz, aynı tohumlar; sınır var / yok)",
                     paired_table(raw["spec"]["runs"], raw["notank"]["runs"], ("base",), ("var", "yok"), PAIRED_ROWS)]
    if mint_table:
        pooled = mint_table["pooled"]
        sections += ["## Mint dağılımı (tüm koşu-günleri)", "\n".join([
            "| İstatistik | Günlük mint (DIG) | Saatlik mint (o günün en yüksek saati) |", "|---|---|---|",
            f"| Medyan | {_fmt(pooled['daily_p50'])} | {_fmt(pooled['hourly_p50'])} |",
            f"| P99 | {_fmt(pooled['daily_p99'])} | {_fmt(pooled['hourly_p99'])} |",
            f"| P99.9 | {_fmt(pooled['daily_p999'])} | {_fmt(pooled['hourly_p999'])} |",
            f"| En yüksek (açılış günü dahil) | {_fmt(pooled['daily_max'])} | {_fmt(pooled['hourly_max'])} |",
            (f"| Açılış günü: medyan / en yüksek | {_fmt(pooled['open_day_p50'])} / {_fmt(pooled['open_day_max'])} | "
            f"{_fmt(pooled['open_hour_p50'])} / {_fmt(pooled['open_hour_max'])} |"),
            f"| Açılış sonrası en yüksek | {_fmt(pooled['after_open_daily_max'])} | {_fmt(pooled['after_open_hourly_max'])} |",
            f"| Koşu-günü sayısı | {_fmt(pooled['run_days'])} | |",
        ])]
    if sweep_rows:
        sections += ["## Duyarlılık (baz, medyan [P25–P75])", sweep_table(sweep_rows)]
    if calib_agg:
        lines = [("| Talep çarpanı | Parametreler | P(24.ay > %30 × 2.ay) | SR 12. ay | Geri dönüş <365g | "
                 "Fiyat 24.ay / 2.ay | Aktif oyuncu 12. ay | r sonu | En yüksek günlük mint |"),
                 "|---|---|---|---|---|---|---|---|---|"]
        for tag, st in sorted(calib_agg.items()):
            which, mult = tag.split(":")
            lines.append(f"| {mult} | {'v0.2' if which == 'spec' else 'v0.2, kural kapalı'} | "
                         f"{_fmt(st['price_m24_gt_30pct_m2']['mean'])} | {_fmt(st['sr_m12']['p50'])} | "
                         f"{_fmt(st['payback_entry_share_weeks_below']['p50'])} | {_fmt(st['ratio_m24_m2']['p50'])} | "
                         f"{_fmt(st['players_m12']['p50'])} | {_fmt(st['r_final']['p50'])} | "
                         f"{_fmt(st['mint_max_daily']['p95'])} (P95) |")
        sections += ["## Talep kalibrasyonu (baz, medyan)", "\n".join(lines)]
    (out / "tables.md").write_text("\n\n".join(sections) + "\n", encoding="utf-8")


def make_charts(folder: Path, parts: dict[str, dict]) -> None:
    spec, nogov, notank = parts["spec"], parts.get("nogov"), parts.get("notank")
    fans = spec["fans"]
    charts.fan_grid(fans, SHORT_TITLES, "price_usd", folder / "fiyat.png", "DIG fiyatı (USD, log) — v0.2", "USD", log=True)
    charts.fan_grid(fans, SHORT_TITLES, "sr28", folder / "sr.png", "SR (28 gün) — v0.2", "SR", ref=0.6, ref_label="0.6")
    charts.fan_grid(fans, SHORT_TITLES, "vrgda_r", folder / "r.png", "VRGDA r (DP/gün) — v0.2, §12 kuralıyla", "r")
    charts.fan_grid(fans, SHORT_TITLES, "vrgda_price", folder / "vrgda.png", "VRGDA p(t,n) (DIG/DP, log) — v0.2",
                    "DIG/DP", log=True)
    charts.fan_grid(fans, SHORT_TITLES, "players", folder / "oyuncu.png", "Aktif oyuncu — v0.2", "oyuncu")
    charts.sinks_vs_emission({n: {k: fans[n][k][2] for k in FLOW_KEYS} for n in ("base", "bear", "deep_bear")},
                             SHORT_TITLES, folder / "emisyon_vs_yakim.png")
    if nogov:
        for n, label in (("deep_bear", "Derin ayı"), ("churn", "Churn")):
            charts.overlay({"§12 kuralı açık": fans[n]["price_usd"], "kural kapalı": nogov["fans"][n]["price_usd"]},
                           "v0.2", folder / f"kural_fiyat_{n}.png", f"{label}: DIG fiyatı (USD, log)", "USD", log=True)
            charts.overlay({"§12 kuralı açık": fans[n]["vrgda_price"], "kural kapalı": nogov["fans"][n]["vrgda_price"]},
                           "v0.2", folder / f"kural_vrgda_{n}.png", f"{label}: VRGDA p (DIG/DP, log)", "DIG/DP", log=True)
    if notank:
        early = {k: v[:, :90] for k, v in notank["fans"]["base"].items()}
        early_spec = {k: v[:, :90] for k, v in fans["base"].items()}
        charts.overlay({"tank sınırı (v0.2)": early_spec["price_usd"], "sınır yok": early["price_usd"]}, "genesis",
                       folder / "tank_fiyat.png", "Baz: ilk 90 gün DIG fiyatı (USD, log)", "USD", log=True,
                       days=90)
        charts.overlay({"tank sınırı (v0.2)": early_spec["pool_eth_usd"], "sınır yok": early["pool_eth_usd"]},
                       "genesis", folder / "tank_havuz.png", "Baz: ilk 90 gün havuzun ETH tarafı (USD)", "USD", days=90)
    samples = {}
    for part in parts.values():
        if part is None:
            continue
        for (daily, hourly) in part.get("mint", {}).values():
            samples.setdefault("daily", []).append(daily.ravel())
            samples.setdefault("hourly", []).append(hourly.ravel())
    charts.mint_ecdf(np.concatenate(samples["daily"]), np.concatenate(samples["hourly"]), folder / "mint.png")


# --------------------------------------------------------------------------------- main
def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--parts", default="spec,nogov,notank,sweeps,calib,details,report",
                    help="comma list of: spec, nogov, notank, sweeps, calib, details, report")
    ap.add_argument("--out", default="results/v02", help="output folder (charts go to charts/<folder name>)")
    ap.add_argument("--param-set", default=None, help="file in param_sets/ applied to every run")
    ap.add_argument("--seeds", type=int, default=200, help="seeds per scenario (spec, notank)")
    ap.add_argument("--variant-seeds", type=int, default=100, help="seeds per scenario for nogov")
    ap.add_argument("--sweep-seeds", type=int, default=50, help="seeds per sensitivity value (base scenario)")
    ap.add_argument("--calib-seeds", type=int, default=50, help="seeds per demand-calibration variant")
    ap.add_argument("--detail-seeds", type=int, default=20, help="seeds for the diagnostics part")
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    ap.add_argument("--quick", action="store_true", help="4 seeds everywhere (smoke test)")
    args = ap.parse_args()
    if args.quick:
        args.seeds = args.variant_seeds = args.sweep_seeds = args.calib_seeds = args.detail_seeds = 4
    study = Study(ROOT / args.out, _overrides(args.param_set), args.workers)
    for part in args.parts.split(","):
        if part in VARIANT_PARTS:
            study.variant(part, getattr(args, VARIANT_PARTS[part][2]))
        elif part == "sweeps":
            study.sweeps(args.sweep_seeds)
        elif part == "calib":
            study.calib(args.calib_seeds)
        elif part == "details":
            study.details(args.detail_seeds)
        elif part == "report":
            study.report()
        else:
            raise SystemExit(f"unknown part: {part}")


if __name__ == "__main__":
    main()
