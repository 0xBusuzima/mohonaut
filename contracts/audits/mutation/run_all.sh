#!/usr/bin/env bash
# Runs audits/mutation/run.sh for every contract with the tests that target it.
# Run from contracts/ in a dedicated copy of the repository (the script rewrites sources in place).
set -euo pipefail
cd "$(dirname "$0")/../.."
run() { audits/mutation/run.sh "$1" "$2" | tee -a audits/mutation/results/summary.txt; }
mkdir -p audits/mutation/results
: > audits/mutation/results/summary.txt
run src/lib/EmissionMath.sol "test/*/EmissionMath*"
run src/lib/VrgdaMath.sol "test/{fuzz,differential}/VrgdaMath*"
run src/lib/MarketOpenMath.sol "test/differential/MarketOpenMath*"
run src/lib/SiteMath.sol "test/{differential/SiteMath*,unit/MiningCoreRigs*}"
run src/lib/MohnPool.sol "test/{integration,script}/*"
run src/MohnToken.sol "test/{unit,invariant}/MohnToken*"
run src/RevenueRouter.sol "test/{unit/RevenueRouter*,unit/Governance*,integration/*,script/*}"
run src/MiningAccounting.sol "test/{unit,differential}/*"
run src/PoolActor.sol "test/{integration,script}/*"
run src/BuybackBurner.sol "test/{integration,script}/*"
run src/LiquidityManager.sol "test/{integration,script}/*"
MUTANTS=200 run src/MiningCore.sol "test/{unit,integration,script}/*" # sampled: ~35 KB source
