"""Health metrics (spec §10, §12, §13), per-run summaries and the acceptance criteria (v0.2 definitions).

Definitions used throughout (all DIG flows are daily, windows are 28 days):

* SR  (sink ratio)  = (burned + returned to reserve) / emitted. Burns = spending burn (80 %),
  cosmetic burn, fast-refine fee burn, buyback burn; "returned to reserve" = 20 % of spending
  + half of the fast fee (spec's "gömülen"). ``sr_burn`` counts burns only.
* NE  (net emission) = E − spending/cosmetic/fee burns − buyback burn (spec §10).
* RCR = buyback USD / (E · P);  s = DIG sold on the DEX by emission recipients / E.
* P*  = R_ETH(USD) · α · β / E with α = buyback share, β = 1.
* Payback (DIG terms, per wallet; energy valued in DIG at each day's price), two definitions:
  - entry (used for the acceptance criterion): DIG spent on capex in the first 14 days after
    joining is recovered by the share of net mining attributable to the DP owned at day 14
    (net mining × min(1, DP_day14 / DP_now));
  - cash: first day cumulative net mining ≥ cumulative capex, where re-invested DIG counts as
    capex — a cohort that re-invests everything it mines never "pays back" by this measure.
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np

from .config import T_SYBIL, Params

WINDOW = 28
MONTH = 30


def gini_weighted(values: np.ndarray, weights: np.ndarray) -> float:
    """Gini of a population in which ``weights[i]`` wallets each hold ``values[i]``."""
    total_w = float(weights.sum())
    if len(values) == 0 or total_w <= 0.0:
        return math.nan
    order = np.argsort(values, kind="stable")
    v, w = values[order], weights[order]
    amount = v * w
    total = float(amount.sum())
    if total <= 0.0:
        return math.nan
    cum = np.cumsum(amount) / total
    prev = np.concatenate([[0.0], cum[:-1]])
    return float(1.0 - np.sum((w / total_w) * (cum + prev)))


def nakamoto_weighted(values: np.ndarray, weights: np.ndarray) -> float:
    """Smallest number of wallets controlling more than 50 % of the total."""
    if len(values) == 0:
        return math.nan
    order = np.argsort(-values, kind="stable")
    v, w = values[order], weights[order]
    cum = np.cumsum(v * w)
    half = 0.5 * float(cum[-1])
    i = int(np.searchsorted(cum, half, side="right"))
    i = min(i, len(v) - 1)
    before_amt = float(cum[i - 1]) if i > 0 else 0.0
    return float(w[:i].sum()) + math.floor((half - before_amt) / v[i]) + 1.0


def month_days(month: int) -> slice:
    """Month m (1-based) = days [30(m−1), 30m)."""
    return slice(MONTH * (month - 1), MONTH * month)


def _window(day_end: int) -> slice:
    return slice(max(day_end - WINDOW + 1, 0), day_end + 1)


def burns_total(s: dict[str, np.ndarray]) -> np.ndarray:
    return s["burn_spend"] + s["burn_cosmetic"] + s["burn_fee"] + s["burn_buyback"]


def rolling(x: np.ndarray, n: int = WINDOW) -> np.ndarray:
    """Trailing n-day sum (shorter at the start)."""
    c = np.cumsum(np.concatenate([[0.0], x]))
    idx = np.arange(1, len(x) + 1)
    return c[idx] - c[np.maximum(idx - n, 0)]


def sr_series(s: dict[str, np.ndarray]) -> np.ndarray:
    with np.errstate(divide="ignore", invalid="ignore"):
        return rolling(burns_total(s) + s["recycled"]) / rolling(s["emission"])


def ratio_at(num: np.ndarray, den: np.ndarray, day_end: int) -> float:
    w = _window(day_end)
    d = float(np.nansum(den[w]))
    return float(np.nansum(num[w])) / d if d > 0 else math.nan


def ops_runway_months(s: dict[str, np.ndarray], day: int, monthly_cost: float) -> float:
    """Months the ops balance lasts at the current net burn (trailing 90-day ops income); ∞ if self-funding."""
    balance = float(s["ops_eth"][day] * s["eth_usd"][day])
    income = float(np.mean(s["ops_income_usd"][max(day - 89, 0): day + 1])) * MONTH
    net_burn = monthly_cost - income
    if net_burn <= 0.0:
        return math.inf
    return max(balance, 0.0) / net_burn


def cohort_payback(cohorts: dict[str, np.ndarray], days: int, kind: str, horizon: int = 365,
                   exclude_types: tuple[int, ...] = ()) -> dict[str, Any]:
    """Weekly join cohorts' (wallet-weighted) median DIG payback; ``kind`` is "entry" or "cash".

    Only cohorts that spent DIG on capex and were observable for ``horizon`` days count.
    Never-paid-back wallets are +∞.
    """
    join, typ, n0 = cohorts["join"], cohorts["typ"], cohorts["N0"]
    day = cohorts[f"payback_{kind}_day"]
    capex = cohorts["entry_capex_pp"] if kind == "entry" else cohorts["capex_pp"]
    pb = np.where(np.isnan(day), np.inf, day)
    keep = (capex > 0) & (join <= days - 1 - horizon) & ~np.isin(typ, exclude_types)
    weeks = (join[keep] // 7).astype(int)
    pb_k, w_k = pb[keep], n0[keep]
    medians = []
    for wk in np.unique(weeks):
        sel = weeks == wk
        medians.append(weighted_quantile(pb_k[sel], w_k[sel], 0.5))
    medians_arr = np.asarray(medians)
    return {
        "share_weeks_below": float(np.mean(medians_arr < horizon)) if len(medians_arr) else math.nan,
        "median_days": weighted_quantile(pb_k, w_k, 0.5) if len(pb_k) else math.nan,
        "p25_days": weighted_quantile(pb_k, w_k, 0.25) if len(pb_k) else math.nan,
        "p75_days": weighted_quantile(pb_k, w_k, 0.75) if len(pb_k) else math.nan,
        "never_share": float(w_k[np.isinf(pb_k)].sum() / w_k.sum()) if w_k.sum() > 0 else math.nan,
    }


def weighted_quantile(values: np.ndarray, weights: np.ndarray, q: float) -> float:
    order = np.argsort(values, kind="stable")
    v, w = values[order], weights[order]
    cum = np.cumsum(w)
    if cum[-1] <= 0:
        return math.nan
    return float(v[int(np.searchsorted(cum, q * cum[-1], side="left"))])


def summarize_run(series: dict[str, np.ndarray], monthly: dict[str, np.ndarray],
                  cohorts: dict[str, np.ndarray], scalars: dict[str, float], params: Params) -> dict[str, float]:
    """Scalar metrics of one run (inputs to tables, criteria and sensitivity results)."""
    s = series
    monthly_ops_cost, buyback_share = params.model.ops_monthly_usd, params.spec.rev_buyback
    open_day = params.spec.genesis_days
    days = len(s["price_usd"])
    price = s["price_usd"]
    m1 = float(np.nanmean(price[3:MONTH]))
    out: dict[str, float] = {
        "p0_usd": scalars["p0_usd"], "dig_lp": scalars["dig_lp"], "pol_eth_open": scalars["pol_eth_open"],
        "price_m1": m1, "price_peak_m1": float(np.nanmax(price[3:MONTH])),
        "price_m2": float(np.nanmean(price[month_days(2)])),
        "max_invariant_err": float(np.max(np.abs(s["invariant_err"]))),
    }
    burns = burns_total(s)
    for m in (6, 12, 24, 36):
        end = MONTH * m - 1
        if end >= days:
            continue
        sl = month_days(m)
        out[f"price_m{m}"] = float(np.nanmean(price[sl]))
        out[f"ratio_m{m}_m1"] = out[f"price_m{m}"] / m1
        out[f"ratio_m{m}_m2"] = out[f"price_m{m}"] / out["price_m2"]
        out[f"H_m{m}"] = float(np.mean(s["H"][sl]))
        out[f"players_m{m}"] = float(np.mean(s["players"][sl]))
        out[f"sr_m{m}"] = ratio_at(burns + s["recycled"], s["emission"], end)
        out[f"sr_burn_m{m}"] = ratio_at(burns, s["emission"], end)
        out[f"ne_m{m}"] = float(np.sum((s["emission"] - burns)[_window(end)]))
        out[f"rcr_m{m}"] = ratio_at(s["buyback_eth"] * s["eth_usd"], s["emission"] * price, end)
        out[f"s_m{m}"] = ratio_at(s["sold_emission"], s["emission"], end)
        out[f"pstar_m{m}"] = ratio_at(s["revenue_usd"] * buyback_share, s["emission"], end)
        out[f"vrgda_m{m}"] = float(np.mean(s["vrgda_price"][sl]))
        out[f"pol_usd_m{m}"] = float(s["pool_eth"][end] * s["eth_usd"][end])
        out[f"depth2_usd_m{m}"] = float(s["depth2_usd"][end])
        out[f"runway_m{m}"] = ops_runway_months(s, end, monthly_ops_cost)
        out[f"ops_income_m{m}"] = float(np.sum(s["ops_income_usd"][sl]))
        out[f"bb_backlog_usd_m{m}"] = float(s["bb_backlog_eth"][end] * s["eth_usd"][end])
        out[f"gini_m{m}"] = float(monthly["gini"][m - 1])
        out[f"nakamoto_m{m}"] = float(monthly["nakamoto"][m - 1])
        out[f"burned_m{m}"] = float(s["burned_cum"][end])
        out[f"emitted_m{m}"] = float(np.sum(s["emission"][: end + 1]))
        out[f"circ_m{m}"] = float(s["circulating"][end])
        out[f"reserve_m{m}"] = float(s["reserve"][end])
    # token mints (spec v0.2 §2): daily cap and hourly breaker evidence
    mint, hourly = s["mint_daily"], s["mint_hourly_max"]
    out["mint_max_daily"] = float(mint.max())
    out["mint_max_daily_day"] = float(mint.argmax())
    out["mint_open_day"] = float(mint[open_day])
    out["mint_max_daily_after_open"] = float(mint[open_day + 1:].max())
    out["mint_max_hourly"] = float(hourly.max())
    out["mint_open_hour"] = float(hourly[open_day])
    out["mint_max_hourly_after_open"] = float(hourly[open_day + 1:].max())
    out["mint_bind_days"] = float(np.count_nonzero(s["mint_deferred"] > 0.0))
    out["bankrun_max"] = float(s["bankrun_mint"].max())
    # governance (spec v0.2 §12)
    out["r_final"] = float(s["vrgda_r"][-1])
    out["r_min"] = float(s["vrgda_r"].min())
    out["r_max"] = float(s["vrgda_r"].max())
    out["r_changes"] = float(np.count_nonzero(np.diff(s["vrgda_r"])))
    out["genesis_purchased_usd"] = scalars["genesis_purchased_usd"]
    out["gini_max"] = float(np.nanmax(monthly["gini"][2:]))
    out["nakamoto_min"] = float(np.nanmin(monthly["nakamoto"][2:]))
    out["ne_cum"] = float(np.sum(s["emission"] - burns))
    for kind in ("entry", "cash"):
        pay = cohort_payback(cohorts, days, kind, exclude_types=(T_SYBIL,))
        out.update({f"payback_{kind}_{key}": value for key, value in pay.items()})
    if scalars["sybil_kwh"] > 0:
        emis_share = scalars["sybil_accrual"] / scalars["sybil_total_accrual"]
        energy_share = scalars["sybil_kwh"] / scalars["sybil_total_kwh"]
        out["sybil_ratio"] = emis_share / energy_share
        out["sybil_ratio_same_tier"] = scalars["sybil_accrual"] / scalars["sybil_fair"]
        out["sybil_emission_share"] = emis_share
        energy_usd_per_kwh = float(np.nansum(s["energy_usd"])) / scalars["sybil_total_kwh"]
        out["sybil_value_per_energy"] = scalars["sybil_value_usd"] / (scalars["sybil_kwh"] * energy_usd_per_kwh)
        out["network_value_per_energy"] = scalars["sybil_total_value_usd"] / float(np.nansum(s["energy_usd"]))
    return out


# --- acceptance criteria (spec v0.2 §13) -------------------------------------------------

def _q(values: list[float], q: float) -> float:
    arr = np.asarray(values, dtype=float)
    arr = arr[~np.isnan(arr)]
    return float(np.quantile(arr, q, method="inverted_cdf")) if len(arr) else math.nan


def evaluate_criteria(summaries: dict[str, list[dict[str, float]]], referral_rate: float = 0.03) -> list[dict[str, Any]]:
    """Pass/fail rows under the v0.2 definitions. ``passed`` is None for monitored-only metrics."""
    rows: list[dict[str, Any]] = []

    def add(criterion: str, scenario: str, value: float, target: str, ok: bool | None, detail: str = "") -> None:
        rows.append({"criterion": criterion, "scenario": scenario, "value": value, "target": target,
                         "passed": None if ok is None else bool(ok), "detail": detail})

    if "base" in summaries:
        base = summaries["base"]
        p = float(np.mean([r["ratio_m24_m2"] > 0.3 for r in base]))
        add("price_m24_gt_30pct_m2", "base", p, "P ≥ 0.5", p >= 0.5,
            f"median m24/m2 = {_q([r['ratio_m24_m2'] for r in base], 0.5):.2f}; "
            f"v0.1 definition (m1): P = {np.mean([r['ratio_m24_m1'] > 0.3 for r in base]):.2f}")
        share = _q([r["payback_entry_share_weeks_below"] for r in base], 0.5)
        add("cohort_payback_lt_365", "base", share, "≥ 0.70 of weekly cohorts", share >= 0.7,
            f"median entry payback = {_q([r['payback_entry_median_days'] for r in base], 0.5):.0f} d")
        sr = _q([r["sr_m12"] for r in base], 0.5)
        add("sr_m12", "base", sr, "≥ 0.6", sr >= 0.6,
            f"P5–P95 {_q([r['sr_m12'] for r in base], 0.05):.2f}–{_q([r['sr_m12'] for r in base], 0.95):.2f}")
    for name in ("bear", "deep_bear"):
        if name in summaries:
            sr = _q([r["sr_m12"] for r in summaries[name]], 0.5)
            add("sr_m12", name, sr, "≥ 0.3", sr >= 0.3)
    for name, runs in summaries.items():
        g = _q([r["gini_max"] for r in runs], 0.5)
        add("gini_lt_0.8", name, g, "< 0.8 (wallet, active DP, max of months 3–36)", g < 0.8,
            f"m12 {_q([r['gini_m12'] for r in runs], 0.5):.2f}, m36 {_q([r['gini_m36'] for r in runs], 0.5):.2f}; "
            f"Nakamoto m36 {_q([r['nakamoto_m36'] for r in runs], 0.5):.0f}")
    if "sybil" in summaries:
        runs = summaries["sybil"]
        same = _q([r["sybil_ratio_same_tier"] for r in runs], 0.5)
        add("sybil_same_day_vs_auger", "sybil", same, f"≤ {1 + referral_rate:.2f} (1 + referral)",
            same <= 1 + referral_rate + 1e-9,
            f"P95 {_q([r['sybil_ratio_same_tier'] for r in runs], 0.95):.3f}; lifetime share ratio "
            f"{_q([r['sybil_ratio'] for r in runs], 0.5):.2f} (not a criterion)")
    for name, runs in summaries.items():
        p5 = _q([r["runway_m12"] for r in runs], 0.05)
        add("ops_runway_m12", name, p5, "> 12 months (P5 across seeds)", p5 > 12.0,
            f"ops income P5: m12 ${_q([r['ops_income_m12'] for r in runs], 0.05):,.0f}/mo, "
            f"m36 ${_q([r['ops_income_m36'] for r in runs], 0.05):,.0f}/mo")
    all_runs = [r for runs in summaries.values() for r in runs]
    if all("mint_bind_days" in r for r in all_runs):  # v0.1 runs predate the mint cap
        binds = float(np.sum([r["mint_bind_days"] for r in all_runs]))
        add("daily_mint_cap_never_binds", "all", binds, "0 days with a deferred mint", binds == 0,
            f"max daily mint {max(r['mint_max_daily'] for r in all_runs):,.0f}")
    if "base" in summaries:
        add("rcr_m12 (health metric)", "base", _q([r["rcr_m12"] for r in summaries["base"]], 0.5), "monitored", None,
            f"s = {_q([r['s_m12'] for r in summaries['base']], 0.5):.2f}")
    return rows
