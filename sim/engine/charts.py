"""Static PNG charts for RAPOR.md (matplotlib, Agg backend).

Colours follow the validated reference palette (light mode): categorical slots in fixed
order, recessive grid, text in ink colours. Fans: median line, P25–P75 and P5–P95 bands.
"""
from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

SERIES_COLORS = ("#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948")
SURFACE, TEXT, TEXT2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
REF = "#8a8984"  # reference / target lines

plt.rcParams.update({
    "figure.facecolor": SURFACE, "axes.facecolor": SURFACE, "savefig.facecolor": SURFACE,
    "axes.edgecolor": GRID, "axes.labelcolor": TEXT2, "axes.titlecolor": TEXT, "text.color": TEXT,
    "xtick.color": TEXT2, "ytick.color": TEXT2, "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.6,
    "axes.spines.top": False, "axes.spines.right": False, "font.size": 8.5, "axes.titlesize": 9.5,
    "lines.linewidth": 2.0, "legend.frameon": False,
})

Fan = np.ndarray  # shape (5, n): P5, P25, P50, P75, P95


def _fan(ax, fan: Fan, x: np.ndarray, color: str, label: str | None = None) -> None:
    ax.fill_between(x, fan[0], fan[4], color=color, alpha=0.13, linewidth=0)
    ax.fill_between(x, fan[1], fan[3], color=color, alpha=0.30, linewidth=0)
    ax.plot(x, fan[2], color=color, label=label)


def _months(ax, label: bool = True) -> None:
    ax.set_xticks(np.arange(0, 1096, 180))
    ax.set_xticklabels([f"{m}" for m in range(0, 37, 6)])
    if label:
        ax.set_xlabel("ay")


def fan_grid(fans: dict[str, dict[str, Fan]], titles: dict[str, str], key: str, path: Path, title: str,
             ylabel: str, log: bool = False, ref: float | None = None, ref_label: str = "") -> None:
    """One panel per scenario (small multiples, shared y)."""
    names = list(fans)
    cols = 4
    rows = int(np.ceil(len(names) / cols))
    fig, axes = plt.subplots(rows, cols, figsize=(12, 2.9 * rows), sharex=True, sharey=True)
    for ax, name in zip(axes.ravel(), names):
        fan = fans[name][key]
        _fan(ax, fan, np.arange(fan.shape[1]), SERIES_COLORS[0])
        if ref is not None:
            ax.axhline(ref, color=REF, linewidth=1, linestyle="--")
            ax.text(5, ref, ref_label, color=TEXT2, fontsize=7, va="bottom")
        ax.set_title(titles[name])
        if log:
            ax.set_yscale("log")
        _months(ax, label=False)
    for ax in axes.ravel()[len(names):]:
        ax.set_visible(False)
    axes.ravel()[0].set_ylabel(ylabel)
    fig.supxlabel("ay", color=TEXT2, fontsize=8.5)
    fig.suptitle(title + "  (çizgi: medyan, koyu bant: P25–P75, açık bant: P5–P95)", x=0.01, ha="left")
    fig.tight_layout(rect=(0, 0, 1, 0.97))
    fig.savefig(path, dpi=130)
    plt.close(fig)


def overlay(series: dict[str, Fan], key_label: str, path: Path, title: str, ylabel: str,
            log: bool = False, ref: float | None = None, ref_label: str = "", days: int | None = None) -> None:
    """Up to three fans on one axis (e.g. two parameter sets). ``days`` < 400 labels the x axis in days."""
    fig, ax = plt.subplots(figsize=(8, 3.6))
    for i, (label, fan) in enumerate(series.items()):
        _fan(ax, fan, np.arange(fan.shape[1]), SERIES_COLORS[i], label)
    if ref is not None:
        ax.axhline(ref, color=REF, linewidth=1, linestyle="--")
        ax.text(5, ref, ref_label, color=TEXT2, fontsize=7, va="bottom")
    if log:
        ax.set_yscale("log")
    if days is not None and days < 400:
        ax.set_xticks(np.arange(0, days + 1, 15))
        ax.set_xlabel("gün (market açılışı: 3. gün)")
    else:
        _months(ax)
    ax.set_ylabel(ylabel)
    ax.set_title(title)
    ax.legend(loc="best", title=key_label)
    fig.tight_layout()
    fig.savefig(path, dpi=130)
    plt.close(fig)


def sinks_vs_emission(medians: dict[str, dict[str, np.ndarray]], titles: dict[str, str], path: Path) -> None:
    """Median 28-day-average emission vs. stacked sinks, one panel per scenario."""
    parts = (("burn_spend", "harcama yakımı (%80)"), ("recycled", "rezerve dönüş"),
             ("burn_buyback", "buyback yakımı"), ("burn_fee", "hızlı rafine yakımı"),
             ("burn_cosmetic", "kozmetik yakım"))
    names = list(medians)
    cols = min(len(names), 3)
    rows = int(np.ceil(len(names) / cols))
    fig, axes = plt.subplots(rows, cols, figsize=(4.2 * cols, 3.0 * rows), sharex=True, sharey=True, squeeze=False)
    for ax, name in zip(axes.ravel(), names):
        m = medians[name]
        x = np.arange(len(m["emission"]))
        stack = [m[key] for key, _ in parts]
        ax.stackplot(x, stack, colors=SERIES_COLORS[: len(parts)], labels=[lab for _, lab in parts],
                     edgecolor=SURFACE, linewidth=0.4)
        ax.plot(x, m["emission"], color=TEXT, linewidth=1.6, label="emisyon E")
        ax.set_title(titles[name])
        _months(ax)
    for ax in axes.ravel()[len(names):]:
        ax.set_visible(False)
    axes.ravel()[0].set_ylabel("DIG / gün (28g ort., medyan)")
    handles, labels = axes.ravel()[0].get_legend_handles_labels()
    fig.legend(handles, labels, loc="lower center", ncol=len(labels), fontsize=7.5)
    fig.tight_layout(rect=(0, 0.08, 1, 1))
    fig.savefig(path, dpi=130)
    plt.close(fig)


def emission_schedule(years: np.ndarray, yearly: np.ndarray, cumulative: np.ndarray,
                      spec_rows: dict[int, tuple[float, float]], path: Path) -> None:
    fig, axes = plt.subplots(1, 2, figsize=(10, 3.4))
    axes[0].bar(years, yearly / 1e6, color=SERIES_COLORS[0], width=0.7)
    axes[0].set_title("Yıllık emisyon (geri dönüşüm hariç)")
    axes[0].set_ylabel("milyon DIG")
    axes[0].set_xlabel("yıl")
    axes[1].plot(years, cumulative / 1e6, color=SERIES_COLORS[0], label="formül")
    sy = np.array(sorted(spec_rows))
    axes[1].plot(sy, [spec_rows[y][1] for y in sy], "o", color=SERIES_COLORS[1], markersize=6,
                 label="şartname tablosu §3.2")
    axes[1].axhline(100, color=REF, linewidth=1, linestyle="--")
    axes[1].set_title("Kümülatif emisyon")
    axes[1].set_ylabel("milyon DIG")
    axes[1].set_xlabel("yıl")
    axes[1].legend(loc="lower right")
    fig.tight_layout()
    fig.savefig(path, dpi=130)
    plt.close(fig)


def sweep_grid(rows: list[dict], metrics: list[tuple[str, str]], path: Path) -> None:
    """rows: [{knob, label, value_label, metric: (p25, p50, p75)}]; one column per metric, one row per knob."""
    knobs = list(dict.fromkeys(r["knob"] for r in rows))
    fig, axes = plt.subplots(len(knobs), len(metrics), figsize=(3.0 * len(metrics), 2.0 * len(knobs)), squeeze=False)
    for i, knob in enumerate(knobs):
        sub = [r for r in rows if r["knob"] == knob]
        x = np.arange(len(sub))
        for j, (metric, mlabel) in enumerate(metrics):
            ax = axes[i, j]
            p25 = np.array([r[metric][0] for r in sub])
            p50 = np.array([r[metric][1] for r in sub])
            p75 = np.array([r[metric][2] for r in sub])
            colors = [SERIES_COLORS[1] if r["is_spec"] else SERIES_COLORS[0] for r in sub]
            ax.bar(x, p50, color=colors, width=0.6)
            ax.errorbar(x, p50, yerr=[p50 - p25, p75 - p50], fmt="none", ecolor=TEXT2, elinewidth=1, capsize=2)
            ax.set_xticks(x)
            ax.set_xticklabels([r["value_label"] for r in sub], fontsize=7)
            ax.grid(axis="x", visible=False)
            if i == 0:
                ax.set_title(mlabel)
            if j == 0:
                ax.set_ylabel(sub[0]["label"], fontsize=8)
    fig.suptitle("Duyarlılık (baz senaryo; çubuk: medyan, çizgi: P25–P75; turuncu = şartname v0.1 değeri)",
                 x=0.01, ha="left")
    fig.tight_layout(rect=(0, 0, 1, 0.975))
    fig.savefig(path, dpi=120)
    plt.close(fig)


def payback_cdf(samples: dict[str, tuple[np.ndarray, np.ndarray]], path: Path, title: str) -> None:
    """Wallet-weighted CDF of entry payback days (∞ = never within the horizon)."""
    fig, ax = plt.subplots(figsize=(7, 3.4))
    for i, (label, (days, weights)) in enumerate(samples.items()):
        order = np.argsort(days)
        d, w = days[order], weights[order]
        cum = np.cumsum(w) / w.sum()
        finite = np.isfinite(d)
        ax.step(d[finite], cum[finite], where="post", color=SERIES_COLORS[i], label=label)
    ax.axvline(365, color=REF, linewidth=1, linestyle="--")
    ax.text(370, 0.02, "365 gün", color=TEXT2, fontsize=7)
    ax.set_xlim(0, 730)
    ax.set_ylim(0, 1)
    ax.set_xlabel("giriş yatırımının DIG cinsi geri dönüş süresi (gün)")
    ax.set_ylabel("cüzdan payı (kümülatif)")
    ax.set_title(title)
    ax.legend(loc="lower right")
    fig.tight_layout()
    fig.savefig(path, dpi=130)
    plt.close(fig)


def monthly_lines(series: dict[str, np.ndarray], path: Path, title: str, ylabel: str,
                  ref: float | None = None, ref_label: str = "") -> None:
    """Median monthly value per scenario; small multiples to keep one hue per panel."""
    names = list(series)
    cols = 4
    rows = int(np.ceil(len(names) / cols))
    fig, axes = plt.subplots(rows, cols, figsize=(12, 2.5 * rows), sharex=True, sharey=True)
    for ax, name in zip(axes.ravel(), names):
        y = series[name]
        ax.plot(np.arange(1, len(y) + 1), y, color=SERIES_COLORS[0])
        if ref is not None:
            ax.axhline(ref, color=REF, linewidth=1, linestyle="--")
            ax.text(1, ref, ref_label, color=TEXT2, fontsize=7, va="bottom")
        ax.set_title(name)
        ax.set_xlabel("ay")
    for ax in axes.ravel()[len(names):]:
        ax.set_visible(False)
    axes.ravel()[0].set_ylabel(ylabel)
    fig.suptitle(title, x=0.01, ha="left")
    fig.tight_layout(rect=(0, 0, 1, 0.96))
    fig.savefig(path, dpi=130)
    plt.close(fig)


def mint_ecdf(daily: np.ndarray, hourly: np.ndarray, path: Path, daily_cap: float = 2e6) -> None:
    """Complementary ECDF of daily mint and of each day's busiest hour (all run-days pooled)."""
    fig, axes = plt.subplots(1, 2, figsize=(10, 3.4))
    for ax, values, label in ((axes[0], daily, "günlük mint"), (axes[1], hourly, "günün en yüksek saati")):
        v = np.sort(values[values > 0])
        tail = 1.0 - np.arange(len(v)) / len(v)
        ax.plot(v, tail, color=SERIES_COLORS[0], label=label)
        ax.set_xscale("log")
        ax.set_yscale("log")
        ax.set_xlabel("DIG")
        ax.set_ylabel("P(≥ x) (koşu-günleri)")
        ax.set_title(label.capitalize())
    axes[0].axvline(daily_cap, color=SERIES_COLORS[7], linewidth=1.2, linestyle="--")
    axes[0].text(daily_cap, 0.5, " DAILY_MINT_CAP", color=TEXT2, fontsize=7, rotation=90, va="center")
    fig.suptitle("Mint dağılımı — tüm v0.2 koşuları (açılış günü dahil)", x=0.01, ha="left")
    fig.tight_layout(rect=(0, 0, 1, 0.94))
    fig.savefig(path, dpi=130)
    plt.close(fig)
