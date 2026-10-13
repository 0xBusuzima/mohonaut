"""Specification audit: every economic constant / formula of contracts/src against
docs/02 (v1.0 / v1.0.1), sim/params.json, sim/engine and sim/vectors.

Read-only. Run from the repository root:
    PYTHONIOENCODING=utf-8 sim/.venv/Scripts/python.exe -I contracts/audit-tests/spec/spec_check.py

Prints one line per check: ID | verdict | name | code (file:line) | docs/02 | sim | note
and a summary. It is an audit report generator, not a CI gate.
"""
from __future__ import annotations

import json
import math
import re
import sys
from decimal import ROUND_FLOOR, Decimal, getcontext
from pathlib import Path

getcontext().prec = 80
ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "contracts" / "src"
SIM = ROOT / "sim"
DOC = ROOT / "docs" / "02_TOKENOMI_VE_OYUN_MATEMATIGI.md"

params = json.loads((SIM / "params.json").read_text(encoding="utf-8"))
spec = params["spec"]
doc_lines = DOC.read_text(encoding="utf-8").splitlines()
WAD = Decimal(10) ** 18
rows: list[tuple] = []


def src(file: str) -> str:
    return (SRC / file).read_text(encoding="utf-8")


def loc(file: str, pattern: str) -> str:
    """file:line of the first line matching `pattern` (regex)."""
    for i, line in enumerate(src(file).splitlines(), 1):
        if re.search(pattern, line):
            return f"{file}:{i}"
    return f"{file}:?"


def const(file: str, name: str) -> str:
    m = re.search(rf"\b{name}\s*=\s*([^;]+);", src(file))
    return m.group(1).strip() if m else "?"


def num(expr: str) -> Decimal:
    """Evaluates a Solidity numeric literal such as 150_000e18, 0.25e18, 72 hours."""
    e = expr.replace("_", "").strip()
    units = {"hours": 3600, "days": 86400, "minutes": 60, "ether": 10**18}
    m = re.fullmatch(r"([0-9.]+(?:e[0-9]+)?)\s*(hours|days|minutes|ether)?", e)
    if not m:
        raise ValueError(expr)
    base = m.group(1)
    if "e" in base:
        mant, exp = base.split("e")
        v = Decimal(mant) * (Decimal(10) ** int(exp))
    else:
        v = Decimal(base)
    if m.group(2):
        v *= units[m.group(2)]
    return v


def doc_line(pattern: str) -> str:
    for i, line in enumerate(doc_lines, 1):
        if re.search(pattern, line):
            return f"docs/02:{i}"
    return "docs/02:?"


def check(cid, name, code_val, code_loc, doc_val, doc_loc, sim_val, sim_loc, ok, note=""):
    rows.append((cid, "OK" if ok else "DIFF", name, f"{code_val} ({code_loc})",
                 f"{doc_val} ({doc_loc})", f"{sim_val} ({sim_loc})", note))


mc = src("MiningCore.sol")

# ---------------------------------------------------------------- token
check("C01", "CAP", const("MohnToken.sol", "MAX_SUPPLY"), loc("MohnToken.sol", "MAX_SUPPLY ="),
      "100,000,000 MOHN, 18 dec", doc_line(r"Maksimum arz"), spec["cap"], "params.json:3",
      num(const("MohnToken.sol", "MAX_SUPPLY")) == Decimal(spec["cap"]) * WAD
      and num(const("lib/EmissionMath.sol", "CAP")) == Decimal(spec["cap"]) * WAD)
dmc = num(const("MohnToken.sol", "DAILY_MINT_CAP")) / WAD
check("C02", "Daily mint cap", const("MohnToken.sol", "DAILY_MINT_CAP"),
      loc("MohnToken.sol", "DAILY_MINT_CAP ="), "500,000 / UTC day", doc_line(r"Günlük mint tavanı\*\*"),
      spec["token"]["daily_mint_cap"], "params.json:66",
      dmc == 500_000 and spec["token"]["daily_mint_cap"] == 500_000, "sim params.json still 2,000,000 (v0.2)")
hb = num(const("MiningCore.sol", "MINT_BREAKER_LIMIT")) / WAD
win = num(const("MiningCore.sol", "MINT_BUCKET")) * num(const("MiningCore.sol", "MINT_BUCKETS"))
check("C03", "Hourly mint limit",
      f"{const('MiningCore.sol', 'MINT_BREAKER_LIMIT')}; 13 x 5 min = {int(win) // 60} min ring",
      loc("MiningCore.sol", "MINT_BREAKER_LIMIT ="), "150,000 / sliding 60 min", doc_line(r"Saatlik mint sınırı"),
      "not enforced (hourly stats only)", "engine/minting.py", hb == 150_000,
      "window covers 60-65 min (stricter than 60)")
check("C04", "Max refine per request", const("MiningCore.sol", "MAX_REFINE_PER_REQUEST"),
      loc("MiningCore.sol", "MAX_REFINE_PER_REQUEST ="), "100K per refine request",
      doc_line(r"Rafine isteği başına en çok 100K"), "not modelled", "-",
      num(const("MiningCore.sol", "MAX_REFINE_PER_REQUEST")) == 100_000 * WAD)

# ---------------------------------------------------------------- emission
dh = Decimal(1) - ((Decimal(1) - Decimal("0.0005")).ln() / 24).exp()
dh_wad = int((dh * WAD).to_integral_value(rounding=ROUND_FLOOR))
code_dh = int(num(const("lib/EmissionMath.sol", "DELTA_H_WAD")))
vec = json.loads((SIM / "vectors" / "emission_hourly.json").read_text(encoding="utf-8"))
check("C05", "delta_h (WAD)", code_dh, loc("lib/EmissionMath.sol", "DELTA_H_WAD ="),
      "1-(1-0.0005)^(1/24) ~ 2.08383e-5", doc_line(r"δ_h = 1"),
      f"{vec['DELTA_H_WAD']} / delta_d {spec['emission']['delta_d']}",
      "vectors/emission_hourly.json; params.json:5",
      code_dh == dh_wad == int(vec["DELTA_H_WAD"]) and spec["emission"]["delta_d"] == 0.0005,
      f"80-digit recomputation {dh_wad}")
check("C06", "Emission split 90/5/5",
      f"{const('lib/EmissionMath.sol', 'MINERS_BPS')}/{const('lib/EmissionMath.sol', 'DEV_BPS')}/remainder",
      loc("lib/EmissionMath.sol", "MINERS_BPS ="), "90/5/5", doc_line(r"Madenciler \(pro-rata DP\)"),
      f"{spec['emission']['split_miners']}/{spec['emission']['split_dev']}/{spec['emission']['split_treasury']}",
      "params.json:6-8",
      const("lib/EmissionMath.sol", "MINERS_BPS") == "9_000" and const("lib/EmissionMath.sol", "DEV_BPS") == "500")
check("C07", "MAX_HOURS_PER_POKE", const("MiningAccounting.sol", "MAX_HOURS_PER_POKE"),
      loc("MiningAccounting.sol", "MAX_HOURS_PER_POKE ="), "168", doc_line(r"MAX_HOURS_PER_POKE"),
      "n/a (daily)", "-", const("MiningAccounting.sol", "MAX_HOURS_PER_POKE") == "168")
check("C08", "Accumulator precision", const("MiningAccounting.sol", "PREC"), loc("MiningAccounting.sol", "PREC ="),
      "1e18 (acc += x*1e18/H)", doc_line(r"acc  \+="), "float", "-", False,
      "docs/02 S4 says 1e18; code 1e36 (more precise)")
lam = -math.log1p(-0.0005)
keep = (1 - 0.0005) ** 365
bad = []
for y, v in {1: 16.69e6, 2: 13.90e6, 3: 11.58e6, 4: 9.65e6, 5: 8.04e6, 10: 3.23e6, 20: 0.52e6}.items():
    calc = 1e8 * keep ** (y - 1) * (1 - keep)
    if abs(calc - v) / v > 0.006:
        bad.append(f"y{y}: doc {v / 1e6:.2f}M calc {calc / 1e6:.3f}M")
for y, v in {1: 16.69e6, 2: 30.59e6, 3: 42.17e6, 4: 51.82e6, 5: 59.86e6, 10: 83.9e6, 20: 97.4e6}.items():
    calc = 1e8 * (1 - keep ** y)
    if abs(calc - v) / v > 0.006:
        bad.append(f"cum y{y}: doc {v / 1e6:.2f}M calc {calc / 1e6:.3f}M")
check("C09", "Yearly emission table / half-life", f"half-life {math.log(2) / lam:.1f} d, keep {keep:.6f}",
      "EmissionMath (derived)", "1,386 d; 0.83314; table", doc_line(r"Yarılanma süresi"),
      "engine/emission.py year_emission", "emission.py:71", not bad and abs(keep - 0.83314) < 1e-5,
      "; ".join(bad) or "docs value 0.83314 is truncated (exact 0.833147)")
strata = {2000: 40, 6000: 124, 12262: 262, 20000: 446, 35000: 861, 60000: 1832, 85000: 3793}
sbad = [f"{m_} m: doc {d} d calc {-math.log(1 - m_ / 1e5) / lam:.1f}" for m_, d in strata.items()
        if abs(-math.log(1 - m_ / 1e5) / lam - d) > 1.0]
m = re.search(r"metres = \[uint32\((\d+)\), ([\d_, ]+)\]", mc)
code_strata = [int(m.group(1))] + [int(x.replace("_", "")) for x in m.group(2).split(",")]
check("C10", "Stratum thresholds (gen 2..8+)", code_strata, loc("MiningCore.sol", "metres = "),
      list(strata), doc_line(r"I — Regolith"), "depth_m = accrued/1000", "model.py:783",
      code_strata == list(strata) and not sbad, "; ".join(sbad) or "Gen-8+ reuses 85,000 m (docs names no Gen-8)")
check("C11", "MOHN per metre", const("MiningCore.sol", "MOHN_PER_METRE"), loc("MiningCore.sol", "MOHN_PER_METRE ="),
      "depth = emission / 1,000", doc_line(r"Dünya Derinliği \(m\)"), "accrued_total / 1000", "model.py:783",
      num(const("MiningCore.sol", "MOHN_PER_METRE")) == 1000 * WAD)

# ---------------------------------------------------------------- fuel / oracle
fp = Decimal(str(spec["energy"]["price_usd_per_kwh"]))
check("C12", "Fuel price (initial)", "FUEL_PRICE_USD = 0.1e18", "script/Deploy.s.sol:36",
      "$0.10 / L", doc_line(r"\| `π_ℓ` \|"), spec["energy"]["price_usd_per_kwh"], "params.json:15",
      fp == Decimal("0.1"), "sim key still named usd_per_kwh (energy theme)")
check("C13", "Fuel price bounds/step/period", "0.03e18-0.5e18, 2500 bps, 7 days",
      loc("MiningCore.sol", r"Param.FuelPrice\) return"), "$0.03-0.50, +-25 %/7 d", doc_line(r"\| `π_ℓ` \|"),
      "not modelled (constant)", "-", True)
check("C14", "Tank cap hours (initial)", const("MiningCore.sol", "INITIAL_MAX_TANK_HOURS"),
      loc("MiningCore.sol", "INITIAL_MAX_TANK_HOURS ="), "capacity x 720 h", doc_line(r"Tank üst sınırı"),
      spec["energy"]["tank_cap_hours"], "params.json:16",
      int(const("MiningCore.sol", "INITIAL_MAX_TANK_HOURS")) == spec["energy"]["tank_cap_hours"] == 720)
check("C15", "Tank cap bounds", "168-2160 h, any step, 7 days", loc("MiningCore.sol", r"Param.MaxTankHours\) return"),
      "168-2,160 h, rate '-'", doc_line(r"Tank üst sınırı"), "-", "-", True, "7-day rate limit not in docs/02 (DOC-GAP)")
check("C16", "Oracle staleness", const("MiningCore.sol", "INITIAL_ORACLE_STALENESS"),
      loc("MiningCore.sol", "INITIAL_ORACLE_STALENESS ="), "26 h (25-30 h)", doc_line(r"Oracle bayatlık eşiği"),
      "-", "-", num(const("MiningCore.sol", "INITIAL_ORACLE_STALENESS")) == 26 * 3600,
      "7-day rate limit not in docs/02 (DOC-GAP)")
check("C17", "Sequencer grace", const("MiningCore.sol", "SEQUENCER_GRACE"), loc("MiningCore.sol", "SEQUENCER_GRACE ="),
      "feed absent; optional; no grace defined", doc_line(r"Sequencer uptime feed"), "-", "-", False, "DOC-GAP")
check("C18", "Genesis tank grace", const("MiningCore.sol", "GENESIS_TANK_GRACE"),
      loc("MiningCore.sol", "GENESIS_TANK_GRACE ="), "Market Open + 24 h", doc_line(r"Genesis'te tank üst sınırı"),
      spec["genesis"]["tank_until_hours_after_open"], "params.json:63",
      num(const("MiningCore.sol", "GENESIS_TANK_GRACE")) == 24 * 3600
      and spec["genesis"]["tank_until_hours_after_open"] == 24)
check("C19", "Pre-fill / genesis length",
      f"{const('MiningCore.sol', 'PREFILL_WINDOW')} / {const('MiningCore.sol', 'GENESIS_DURATION')}",
      loc("MiningCore.sol", "PREFILL_WINDOW ="), "T0-24h / T0+72h", doc_line(r"\*\*Genesis Dig\*\*"),
      f"genesis.days {spec['genesis']['days']}", "params.json:58",
      num(const("MiningCore.sol", "GENESIS_DURATION")) == 72 * 3600 and spec["genesis"]["days"] == 3)

# ---------------------------------------------------------------- machines
code_cat = []
for entry in re.findall(r"_addMachine\(c, MachineType\(([^)]*)\)\)", mc):
    parts = [p.strip() for p in entry.split(",")]
    if parts[0] == "t.dp":
        continue  # addMachineGeneration
    if parts[0] == "PILOT_RIG_DP":
        code_cat.append((10, Decimal("0.25"), 0, 1))
    else:
        code_cat.append((int(parts[0]), num(parts[4]) / WAD, int(parts[1]), int(parts[2])))
doc_cat = [(10, Decimal("0.25"), 0, 1), (50, Decimal("1.0"), 0, 1), (150, Decimal("2.5"), 800, 3),
           (420, Decimal("6.0"), 1700, 6), (1000, Decimal("12.5"), 2700, 10), (2700, Decimal("30.0"), 4000, 15)]
doc_names = ["Pilot Rig", "Rotary Rig", "Top Drive", "Diamond Core Drill", "Turbodrill", "Plasma Bore"]
sm = spec["machines"]
sim_cat = [(sm["dp"][i], Decimal(str(sm["kw"][i])), round(sm["premium"][i] * 10_000), sm["unlock_level"][i])
           for i in range(6)]
for i in range(6):
    pat = r"MachineType\(PILOT_RIG_DP" if i == 0 else rf"MachineType\({doc_cat[i][0]},"
    check(f"C2{i}", f"Machine type {i} {doc_names[i]} (DP, L/h, prem bps, min L)",
          tuple(str(x) for x in code_cat[i]), loc("MiningCore.sol", pat),
          tuple(str(x) for x in doc_cat[i]), doc_line(rf"^\| {i} \| {doc_names[i].split()[0]}"),
          tuple(str(x) for x in sim_cat[i]), "params.json:20-23", code_cat[i] == doc_cat[i] == sim_cat[i],
          f"eta {Decimal(code_cat[i][0]) / code_cat[i][1]:.0f}; sim name '{sm['names'][i]}'")
check("C26", "Best efficiency (gen 1)", "90e18", loc("MiningCore.sol", "bestEfficiency = 90e18"),
      "Plasma Bore eta 90", doc_line(r"^\| 5 \| Plasma"), "dp/kw = 90", "config.py:33", True)
check("C27", "Next generation rule",
      f"+{int(const('MiningCore.sol', 'MAX_EFFICIENCY_GAIN_BPS').replace('_', '')) - 10000} bps, "
      f"{const('MiningCore.sol', 'GENERATION_INTERVAL')}, <= {const('MiningCore.sol', 'MAX_TYPES_PER_GENERATION')} types, "
      f"premium <= {const('MiningCore.sol', 'MAX_PREMIUM_BPS')} bps",
      loc("MiningCore.sol", "MAX_EFFICIENCY_GAIN_BPS ="), "eff <= best +15 %, <= 1 gen / 45 d, stratum",
      doc_line(r"Yeni nesil ekleme"), "not modelled", "-", True, "8 types / 100 % premium / dp<=10,000 are DOC-GAP")
check("C28", "Pilot rig", "free on registration, 1 per site, no scrap credit",
      loc("MiningCore.sol", r"if \(typeId != PILOT_RIG_TYPE\)"), "free, 1 per account", doc_line(r"^\| 0 \| Pilot"),
      "tier 0 free", "params.json:19", True, "no-scrap-credit rule is DOC-GAP")

# ---------------------------------------------------------------- VRGDA
vr = spec["vrgda"]
gv = spec["governance"]
check("C30", "VRGDA p0", const("MiningCore.sol", "P0"), loc("MiningCore.sol", "P0 = 10e18"), "10 MOHN/DP (deploy)",
      doc_line(r"\| `p0` \|"), vr["p0"], "params.json:26",
      num(const("MiningCore.sol", "P0")) == 10 * WAD and vr["p0"] == 10)
check("C31", "VRGDA k", const("MiningCore.sol", "INITIAL_K"), loc("MiningCore.sol", "INITIAL_K ="),
      "0.15", doc_line(r"\| `k` \|"), vr["k"], "params.json:27",
      num(const("MiningCore.sol", "INITIAL_K")) == Decimal("0.15") * WAD and vr["k"] == 0.15)
check("C32", "VRGDA r", const("MiningCore.sol", "INITIAL_R"), loc("MiningCore.sol", "INITIAL_R ="),
      "2,000 DP/d", doc_line(r"\| `r` \|"), vr["r"], "params.json:28",
      num(const("MiningCore.sol", "INITIAL_R")) == 2000 * WAD and vr["r"] == 2000)
check("C33", "Max units per tx", const("MiningCore.sol", "MAX_UNITS_PER_TX"), loc("MiningCore.sol", "MAX_UNITS_PER_TX ="),
      "10,000 DP units", doc_line(r"İşlem başı üst sınır"), vr["max_units_per_tx"], "params.json:29",
      int(const("MiningCore.sol", "MAX_UNITS_PER_TX").replace("_", "")) == vr["max_units_per_tx"] == 10000)
check("C34", "r/k bounds & step", "r 1000e18-100000e18, k 0.05e18-0.35e18, 2500 bps, 30 days",
      loc("MiningCore.sol", r"Param.VrgdaR\) return"), "r 1,000-100,000; k 0.05-0.35; +-25 %/30 d",
      doc_line(r"\| `k` \|"), f"r {gv['r_min']}-{gv['r_max']}, step {gv['step']}, cooldown {gv['cooldown_days']} d",
      "params.json:75-78", gv["r_min"] == 1000 and gv["r_max"] == 100000 and gv["step"] == 0.25
      and gv["cooldown_days"] == 30)
check("C35", "Re-anchoring", "on r AND k change (ln-anchor)", loc("MiningCore.sol", r"_reanchorVrgda\(c\);"),
      "on r change: p0(1-k)^(s_a+(t-t_a)-(n-n_a)/r)", doc_line(r"yeniden çapalanır"), "r only",
      "engine/governance.py:255", True, "k re-anchoring is DOC-GAP (docs formula would jump on a k change)")
k = Decimal("0.15")
r = Decimal(2000)
p0 = Decimal(10)
lna = -(Decimal(1) - k).ln() / r
doc_price = {1: 500, 2: 1620, 3: 4914, 4: 12700, 5: 37800}
pbad = []
for i in range(1, 6):
    dp = doc_cat[i][0]
    batch = p0 * ((lna * dp).exp() - 1) / (lna.exp() - 1)
    tier = batch * (1 + Decimal(doc_cat[i][2]) / 10_000)
    pbad.append(f"T{i}: doc {doc_price[i]} actual {tier:.1f} (+{(tier / doc_price[i] - 1) * 100:.2f} %)")
check("C36", "Docs S6.1 'price @ p0=10' column", "batchCost(dp) x (1+prem) at t=0,n=0",
      loc("lib/VrgdaMath.sol", "function batchCost"), doc_price, doc_line(r"^\| ID \| Makine"),
      "tier_cost (vrgda_costs.json: 42,265.6 for T5)", "vectors/vrgda_costs.json", False, "; ".join(pbad))
check("C37", "Unit convention", "unit j costs p(t, n+j); batch = p(t,n)(a^q-1)/(a-1)",
      loc("lib/VrgdaMath.sol", "Unit j of a purchase"), "Maliyet(q) = p(t,n)(a^q-1)/(a-1)", doc_line(r"Maliyet\(q\) ="),
      "same", "engine/vrgda.py:140", True)
check("C38", "VRGDA time origin", "elapsed since vrgdaAnchorTime = genesisTime (0 during pre-fill)",
      loc("MiningCore.sol", "c.vrgdaAnchorTime = genesisTime_"), "t = days since launch", doc_line(r"lansmandan beri gün"),
      "day 0 = T0", "engine/scenarios.py:4", True)

# ---------------------------------------------------------------- spend / scrap / refinery / referral
check("C40", "Spend burn/reserve", f"reserve {const('MiningAccounting.sol', 'RESERVE_SHARE_BPS')} bps (floor), burn = rest",
      loc("MiningAccounting.sol", "RESERVE_SHARE_BPS ="), "80 % burn / 20 % reserve", doc_line(r"%80 → kalıcı yakım"),
      spec["spend"]["burn_share"], "params.json:33",
      spec["spend"]["burn_share"] == 0.8 and const("MiningAccounting.sol", "RESERVE_SHARE_BPS") == "2000")
check("C41", "Cosmetic spend 100 % burn", "no cosmetic sink in contracts", "-", "100 % burn",
      doc_line(r"Kozmetik MOHN harcamaları"), spec["spend"]["cosmetic_burn_share"], "params.json:34", False,
      "DOC-GAP: not implemented on-chain in v1")
check("C42", "Scrap credit", f"{const('MiningCore.sol', 'SCRAP_CREDIT_BPS')} bps x DP x unitPrice (floor)",
      loc("MiningCore.sol", "SCRAP_CREDIT_BPS ="), "DP x p(t,n) x 20 %", doc_line(r"Hurdaya çıkarma"),
      spec["spend"]["scrap_credit_rate"], "params.json:35",
      spec["spend"]["scrap_credit_rate"] == 0.2 and const("MiningCore.sol", "SCRAP_CREDIT_BPS") == "2000")
rf = spec["refinery"]
check("C43", "Fast refine fee",
      f"{const('MiningCore.sol', 'INITIAL_FAST_REFINE_FEE_BPS')} bps (ceil); reserve = fee/2 floor, burn = rest",
      loc("MiningCore.sol", "INITIAL_FAST_REFINE_FEE_BPS ="), "8 % = 4 % burn + 4 % reserve; bounds 0-12 %",
      doc_line(r"\*\*Hızlı rafine\*\*"), f"{rf['fast_fee']} / burn share {rf['fast_fee_burn_share']}",
      "params.json:48-49", rf["fast_fee"] == 0.08 and rf["fast_fee_burn_share"] == 0.5
      and const("MiningCore.sol", "INITIAL_FAST_REFINE_FEE_BPS") == "800", "7-day rate limit DOC-GAP")
check("C44", "Refine delay", const("MiningCore.sol", "INITIAL_REFINE_DELAY"), loc("MiningCore.sol", "INITIAL_REFINE_DELAY ="),
      "72 h; bounds 24-168 h", doc_line(r"\*\*Standart rafine\*\*"), f"queue_days {rf['queue_days']}", "params.json:50",
      num(const("MiningCore.sol", "INITIAL_REFINE_DELAY")) == 72 * 3600 and rf["queue_days"] == 3,
      "7-day rate limit DOC-GAP")
check("C45", "Dev/treasury withdrawal limit", const("MiningCore.sol", "SHARE_DAILY_LIMIT"),
      loc("MiningCore.sol", "SHARE_DAILY_LIMIT ="), "<= 100K per request and per day; 72 h queue",
      doc_line(r"Talep başına ve gün başına"), "dev withdrawn daily via queue, no 100K cap", "model.py:121",
      num(const("MiningCore.sol", "SHARE_DAILY_LIMIT")) == 100_000 * WAD,
      "queue uses the adjustable refineDelay (24-168 h); docs says 72 h")
check("C46", "Referral",
      f"{const('MiningAccounting.sol', 'REFERRAL_BPS')} bps; min fuel {const('MiningCore.sol', 'REFERRAL_MIN_FUEL_WEI')}",
      loc("MiningAccounting.sol", "REFERRAL_BPS ="), "3 % of invitee accrual; >= 0.003 ETH; referrer has fuel",
      doc_line(r"Davet edenin kredisi"),
      f"{spec['referral']['rate']} / {spec['referral']['min_invitee_energy_eth']} ETH", "params.json:11-12",
      spec["referral"]["rate"] == 0.03 and spec["referral"]["min_invitee_energy_eth"] == 0.003,
      "conditions evaluated once at settle time (lump), sim per day")

# ---------------------------------------------------------------- site
sitemath = src("lib/SiteMath.sol")
cap_tab = re.search(r"function _capacity.*?table = \[(.*?)\];", sitemath, re.S).group(1)
cost_tab = re.search(r"function _upgradeCost.*?table = \[(.*?)\];", sitemath, re.S).group(1)
caps = [int(x.strip().replace("uint256(", "").replace(")", "")) for x in cap_tab.split(",")]
costs = [int(x.strip().replace("uint256(", "").replace(")", "")) for x in cost_tab.split(",")]
exact_caps = [int((Decimal(6) * Decimal("1.22") ** (L - 1) * WAD).to_integral_value(rounding=ROUND_FLOOR))
              for L in range(1, 31)]
exact_costs = [150 * 10**18 if L == 1 else
               int((Decimal(150) * (Decimal("2.2") * Decimal(L).ln()).exp() * WAD).to_integral_value(rounding=ROUND_FLOOR))
               for L in range(1, 30)]
ov = json.loads((SIM / "vectors" / "outpost_costs.json").read_text(encoding="utf-8"))["rows"]
vec_caps = [int(r_["capacity_kw_wad"]) for r_ in ov]
vec_costs = [int(r_["next_level_cost_wad"]) for r_ in ov if r_["level"] < 30]
cost_diff = max(abs(a - b) for a, b in zip(costs, exact_costs))
check("C50", "Fuel line capacity table L1-L30", f"{len(caps)} entries", loc("lib/SiteMath.sol", "function _capacity"),
      "6 x 1.22^(L-1)", doc_line(r"kapasite\(L\)  ="), "cap_base_kw 6, cap_growth 1.22", "params.json:39-40",
      caps == exact_caps == vec_caps and spec["outpost"]["cap_base_kw"] == 6.0 and spec["outpost"]["cap_growth"] == 1.22,
      "exact to the wei vs 80-digit recomputation and vectors")
check("C51", "Upgrade cost table L1-L29", f"{len(costs)} entries", loc("lib/SiteMath.sol", "function _upgradeCost"),
      "150 x L^2.2", doc_line(r"yükseltme\(L→L\+1\)"), "cost_base 150, cost_exp 2.2", "params.json:41-42",
      costs == vec_costs and cost_diff <= 1, f"max |code - 80-digit exact| = {cost_diff} wei")
check("C52", "Slots", "3 + level", loc("lib/SiteMath.sol", r"return 3 \+ level"), "3 + L", doc_line(r"slot\(L\)      ="),
      spec["outpost"]["slot_base"], "params.json:38", spec["outpost"]["slot_base"] == 3)
check("C53", "Max level", const("lib/SiteMath.sol", "MAX_LEVEL"), loc("lib/SiteMath.sol", "MAX_LEVEL ="), "L1-L30",
      doc_line(r"L1: 4 → L30: 33"), spec["outpost"]["max_level"], "params.json:45",
      spec["outpost"]["max_level"] == 30 == int(const("lib/SiteMath.sol", "MAX_LEVEL")))
check("C54", "idx clamp", f"{const('MiningCore.sol', 'IDX_MIN')} - {const('MiningCore.sol', 'IDX_MAX')} (idx floored)",
      loc("MiningCore.sol", "IDX_MIN ="), "clamp(p/p0, 0.25, 4)", doc_line(r"idx          ="),
      f"{spec['outpost']['idx_min']} - {spec['outpost']['idx_max']}", "params.json:43-44",
      spec["outpost"]["idx_min"] == 0.25 and spec["outpost"]["idx_max"] == 4.0)
check("C55", "Site cost scale", "1x; 0.5x-2x; +-25 %/30 d", loc("MiningCore.sol", r"return \(5000, 20_000"),
      "'Saha maliyet tabanı' +-25 %/30 d, no bounds", doc_line(r"Saha maliyet tabanı"), "absent", "-", False,
      "absolute bounds DOC-GAP (SCOPE known issue 6)")
tbad = []
for L, (cp, cs) in {1: (6.0, 150), 5: (13.3, 5180), 10: (35.9, 23800), 15: (97.1, 58000),
                    20: (262, 109000), 29: (1565, 247000)}.items():
    c_cap = caps[L - 1] / 1e18
    c_cost = costs[L - 1] / 1e18
    if abs(c_cap - cp) / cp > 0.0035:
        tbad.append(f"L{L} capacity doc {cp} code {c_cap:.2f}")
    if abs(c_cost - cs) / cs > 0.0035:
        tbad.append(f"L{L} cost doc {cs} code {c_cost:.1f}")
if abs(caps[29] / 1e18 - 1909) / 1909 > 0.0035:
    tbad.append(f"L30 capacity doc ~1,909 code {caps[29] / 1e18:.2f}")
tot = sum(costs) / 1e18
check("C56", "Docs S7 table numbers", f"total L1->L30 {tot:,.0f} MOHN", "lib/SiteMath.sol tables",
      "table + 'L30 total ~ 2.3M'", doc_line(r"^\| L \| Slot"), "-", "-", not tbad, "; ".join(tbad))

# ---------------------------------------------------------------- revenue / buyback / LP
rv = spec["revenue"]
check("C60", "Revenue split",
      f"{const('RevenueRouter.sol', 'INITIAL_BUYBACK_BPS')}/{const('RevenueRouter.sol', 'INITIAL_POL_BPS')}/remainder",
      loc("RevenueRouter.sol", "INITIAL_BUYBACK_BPS ="), "55/30/15", doc_line(r"\| Buyback & Burn \|"),
      f"{rv['buyback']}/{rv['pol']}/{rv['ops']}", "params.json:53-55",
      const("RevenueRouter.sol", "INITIAL_BUYBACK_BPS") == "5500" and const("RevenueRouter.sol", "INITIAL_POL_BPS") == "3000"
      and (rv["buyback"], rv["pol"], rv["ops"]) == (0.55, 0.30, 0.15), "rounding dust to ops")
check("C61", "Revenue split bounds", "bb 3000-6000, pol 2000-5000, ops 1000-3500, once / 30 d",
      loc("RevenueRouter.sol", "buybackBps_ < 3000"), "30-60 / 20-50 / 10-35 %, no rate",
      doc_line(r"\| Buyback & Burn \|"), "-", "-", True, "30-day rate limit DOC-GAP")
bbd = int(const("BuybackBurner.sol", "INITIAL_DAILY_BPS"))
check("C62", "Buyback daily cap", f"{bbd} bps of pool ETH; 50-500 bps / 7 d", loc("BuybackBurner.sol", "INITIAL_DAILY_BPS ="),
      "'günlük tavan' (no number)", doc_line(r"Keeper rolü, günlük tavan"),
      params["model"]["buyback_max_daily_frac_of_pool_eth"], "params.json:93",
      bbd / 10_000 == params["model"]["buyback_max_daily_frac_of_pool_eth"], "value and bounds DOC-GAP")
check("C63", "POL add daily cap", f"{const('LiquidityManager.sol', 'ADD_DAILY_BPS')} bps of pool ETH (immutable)",
      loc("LiquidityManager.sol", "ADD_DAILY_BPS ="), "not defined", doc_line(r"Protokol Likiditesi \(POL\)"),
      "whole POL bucket zapped every day (no cap)", "engine/model.py:440-442", False, "MISMATCH sim vs code + DOC-GAP")
check("C64", "Pool fee / fee routing", "0.3 %, tick 60; MOHN fees burned, ETH fees -> buyback",
      loc("lib/MohnPool.sol", "FEE = 3000"), "fee not defined; POL fees = revenue", doc_line(r"POL işlem ücretleri"),
      f"amm.fee {params['model']['amm']['fee']}; fees compound in the pool", "params.json:88; engine/amm.py:3", False,
      "fee value matches; fee routing differs (MISMATCH sim)")
lpcap = num(const("lib/MarketOpenMath.sol", "LP_CAP")) / WAD
check("C65", "Market Open LP cap", f"min(polEth*ethUsd/P0, {lpcap:.0f}, hourly room)",
      loc("lib/MarketOpenMath.sol", "LP_CAP ="), "min(..., 1,000,000, room)", doc_line(r"MOHN_LP   ="),
      f"min(..., {spec['genesis']['dig_lp_cap']}) (no room clamp)", "params.json:59; model.py:701",
      lpcap == spec["genesis"]["dig_lp_cap"] == 1_000_000, "1M is unreachable on-chain: room <= 150K")
check("C66", "P0 formula", "floor(genesisFuelUsd*1e18/minersAtSnapshot)", loc("lib/MarketOpenMath.sol", "p0 = Math.mulDiv"),
      "fuel USD / genesis miner accrual", doc_line(r"P0_USD   ="), "purchased basis", "params.json:97", True,
      "floor P0 => slightly more LP minted (dust)")

# ---------------------------------------------------------------- governance
check("C70", "Timelock delays", "PARAMS_DELAY 96 hours; UPGRADE_DELAY 7 days", "script/Deploy.s.sol:34-35",
      "96 h; upgrades 7 d", doc_line(r"\*\*96 saat\*\* timelock"),
      f"governance.delay_days {gv['delay_days']} (72 h)", "params.json:70", gv["delay_days"] * 24 == 96,
      "sim main study 72 h (v02_delay96 side run only)")
check("C71", "Guardian pause / cooldown / max extension",
      f"{const('MiningCore.sol', 'GUARDIAN_PAUSE')} / {const('MiningCore.sol', 'GUARDIAN_COOLDOWN')} / "
      f"{const('MiningCore.sol', 'MAX_TIMELOCK_PAUSE')}", loc("MiningCore.sol", "GUARDIAN_PAUSE ="),
      "not in docs/02 (docs/04 S5.2 <= 72 h; docs/03 7 d, 30 d)", "docs/02: -", "-", "-", False, "DOC-GAP vs docs/02")
check("C72", "Recipients / sequencer feed rate", "30 days each", loc("MiningCore.sol", r"_rateLimit\(c, 100, 30 days\)"),
      "not in docs/02", "docs/02: -", "-", "-", False, "DOC-GAP")
check("C73", "Intervention rule thresholds", "off-chain (Safe)", "-",
      "SR<0.5 or p/p0<0.25 4 wk -> r x0.75; p>4 p0 4 wk -> r x1.25", doc_line(r"4 hafta üst üste `SR < 0.5`"),
      f"sr_low {gv['sr_low']}, ratio {gv['price_ratio_low']}/{gv['price_ratio_high']}, weeks {gv['weeks']}",
      "params.json:71-75", gv["sr_low"] == 0.5 and gv["price_ratio_low"] == 0.25 and gv["price_ratio_high"] == 4.0)

sys.stdout.reconfigure(encoding="utf-8")
for row in rows:
    print(" | ".join(str(x) for x in row))
ok = sum(1 for r_ in rows if r_[1] == "OK")
print(f"\n{len(rows)} checks: {ok} OK, {len(rows) - ok} DIFF")
