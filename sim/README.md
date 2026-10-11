# MOHO economy simulator (code name DIG)

This is an agent-based Monte Carlo simulator of the idle-mining economy in `docs/02_TOKENOMI_VE_OYUN_MATEMATIGI.md`. The spec is currently **v0.2** (token MOHO). The simulator and the test vectors still call the token `DIG`; it is the same token.

- Results and recommendations: **`RAPOR.md`** (Turkish). The v0.2 validation is at the top; the v0.1 study follows.
- Parameters: `params.json` (v0.2) and `PARAMS.md`. Alternative parameter sets live in `param_sets/`.

```
sim/
  params.json, PARAMS.md     all parameters (spec v0.2 values + model assumptions)
  param_sets/                dotted overrides: v01.json (spec v0.1), v01_recommended.json, v02_nogov.json, v02_notankcap.json
  engine/
    config.py      params.json → typed dataclasses, dotted overrides
    emission.py    reserve-based emission, 90/5/5 + referral distribution, exact integer reference
    vrgda.py       LinearVRGDA (closed form, daily batch), outposts
    governance.py  price-continuous r changes (re-anchoring) and the §12 r rule (72 h delay, cooldown)
    minting.py     daily mint cap with deferral (T3), hourly mint profile
    amm.py         constant-product ETH/DIG pool, protocol-owned liquidity, zap
    agents.py      cohort store, merit-order on/off, payback-driven capex planning, refine choice
    model.py       the daily simulation (step order documented at the top of the file)
    metrics.py     SR, NE, RCR, P*, payback, Gini/Nakamoto, mint statistics, §13 criteria (v0.2 definitions)
    scenarios.py   base, bear, deep_bear, whale, churn, sybil, hype
    charts.py      PNG charts for the report
  run_scenarios.py           the v0.2 study: scenarios, variants, sweeps, demand calibration, diagnostics, report
  make_vectors.py            golden vectors for the Solidity differential tests → vectors/
  tests/                     unittest suite
  results/v02/, charts/v02/  v0.2 outputs; results/ and charts/ top level hold the v0.1 study used in RAPOR.md §1–10
```

## Setup (Windows PowerShell, from `crypto-game-project\sim`)

You need Python 3.12. The simulator needs numpy; the charts need matplotlib.

```powershell
cd C:\Users\yazic\Desktop\crypto-game-project\sim
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install numpy matplotlib
```

## Tests

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -t . -v
```

There are 42 tests and they run in a few seconds:

- **Emission:** the schedule matches the spec table (§3.2), plus the integer reference and the World Depth stratum days.
- **VRGDA:** the closed-form batch cost equals the summed unit prices, and the daily batch equals fine sequential buying. Catalog and outpost tables are checked too.
- **Accounting:** pro-rata distribution conserves emission. The supply invariant `supply + pending + queue + reserve + burnedForever == CAP` holds every day in full simulations.
- **Sybil neutrality:** splitting an account does not change emission per ETH of energy.
- **AMM:** pool conservation.
- **v0.2 mechanics:**
  - a binding daily mint cap defers mints, keeps every day under the cap and conserves supply;
  - the genesis tank cap limits tanks to Market Open + 24 h and lowers P0;
  - r re-anchoring is price-continuous;
  - the §12 rule waits 4 weeks, applies a 72 h delay, honours the cooldown and stays within bounds.
- **Vectors:** the vector files are reproducible.

## Golden vectors

```powershell
.\.venv\Scripts\python.exe make_vectors.py
```

This writes `vectors/*.json`. The algorithms and the v0.2 changes are described in `vectors/README.md`.

## The v0.2 study

```powershell
# everything, about 3,100 runs (~25 min on a 14-core laptop):
#   spec: 7 scenarios x 200 seeds | nogov: 7 x 100 (r rule off) | notank: base x 200 (no genesis tank cap)
#   sweeps: 50 seeds per value | calib: demand x0.5 / x2, 50 seeds | details: 20 seeds | report
.\.venv\Scripts\python.exe run_scenarios.py

# the same in parts; each part caches results\v02\raw\<part>.pkl and "report" merges them
.\.venv\Scripts\python.exe run_scenarios.py --parts spec
.\.venv\Scripts\python.exe run_scenarios.py --parts nogov,notank
.\.venv\Scripts\python.exe run_scenarios.py --parts sweeps,calib,details
.\.venv\Scripts\python.exe run_scenarios.py --parts report

# smoke test: 4 seeds everywhere, written to a separate folder
.\.venv\Scripts\python.exe run_scenarios.py --quick --out results\v02_quick

# spec v0.1 with the current engine (reproduces the v0.1 study to ~1e-15)
.\.venv\Scripts\python.exe run_scenarios.py --param-set v01.json --parts spec,report --out results\v01
```

The study writes these outputs:

- `results/v02/scenarios.json`: P5/P25/P50/P75/P95 of every metric, for each part and scenario. It also includes the cached v0.1 runs as `v01`.
- `results/v02/criteria.json`: the §13 criteria (v0.2 definitions) for v0.1, v0.2 and v0.2 without the rule.
- `results/v02/mint.json`: the daily and hourly mint distribution, pooled over all run-days.
- `sweeps.json`, `calibration.json` and `details.json`.
- `tables.md`: the tables used in the report.
- `charts/v02/*.png`.

`results/*/raw/*.pkl` holds the per-part caches (tens of MB). They can be deleted if you re-run the parts.

Seed *i* uses the same random stream in every configuration, so differences between configurations are not seed noise.

A single run in Python:

```python
from engine.config import load_params
from engine.scenarios import SCENARIOS
from engine.model import Simulation
res = Simulation(load_params({"spec.governance.enabled": False}), SCENARIOS["bear"], seed=0).run()
res.series["price_usd"], res.series["vrgda_r"], res.series["mint_daily"], res.series["invariant_err"]
```
