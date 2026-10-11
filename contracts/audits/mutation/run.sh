#!/usr/bin/env bash
# Mutation testing with Gambit (Certora, open source): generates mutants of one source file and
# runs a fast test subset against each. A mutant is "killed" if the build or a test fails.
#
# Usage (from contracts/, Linux or WSL, Foundry + Gambit + solc 0.8.30 + python3 installed):
#   audits/mutation/run.sh src/lib/EmissionMath.sol "test/*/EmissionMath*"   (glob, as forge --match-path)
# Never run it in a working tree that other tools use: it rewrites the source file in place
# (and restores it). Results: audits/mutation/results/<file>.md
set -euo pipefail

SRC="$1"
TESTS="$2"
SOLC="${SOLC:-$HOME/.local/share/svm/0.8.30/solc-0.8.30}"
OUT="audits/mutation/results"
NAME="$(basename "$SRC" .sol)"
WORK="$(mktemp -d)"
mkdir -p "$OUT"

# MUTANTS=n samples n mutants (fixed seed) for very large files.
SAMPLE=()
if [ -n "${MUTANTS:-}" ]; then SAMPLE=(--num_mutants "$MUTANTS" --seed 7); fi
gambit mutate --filename "$SRC" --solc "$SOLC" --outdir "$WORK/gambit_out" "${SAMPLE[@]}" \
  --solc_remappings "@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/" \
  --solc_remappings "@openzeppelin/contracts-upgradeable/=lib/openzeppelin-contracts-upgradeable/contracts/" \
  --solc_remappings "solady/=lib/solady/src/" \
  --solc_remappings "@uniswap/v4-core/=lib/v4-core/" >/dev/null

cp "$SRC" "$WORK/original.sol"
killed=0
survived=0
: > "$WORK/survivors.txt"
for dir in "$WORK"/gambit_out/mutants/*/; do
  id="$(basename "$dir")"
  mutant="$(find "$dir" -name "$(basename "$SRC")" | head -n 1)"
  cp "$mutant" "$SRC"
  if FOUNDRY_PROFILE=mutation forge test --match-path "$TESTS" >/dev/null 2>&1; then
    survived=$((survived + 1))
    desc="$(python3 -c 'import json,sys,re; m=next(x for x in json.load(open(sys.argv[1])) if str(x["id"]) == sys.argv[2]); h=re.search(r"@@ -(\d+)", m["diff"]); c=re.search(r"/// (.*)", m["diff"]); print("line " + (h.group(1) if h else "?") + ": " + (c.group(1) if c else m["description"]))' "$WORK/gambit_out/gambit_results.json" "$id")"
    echo "- mutant $id: $desc" >> "$WORK/survivors.txt"
  else
    killed=$((killed + 1))
  fi
  cp "$WORK/original.sol" "$SRC"
done

total=$((killed + survived))
{
  echo "# Mutation results: $SRC"
  echo
  echo "Tests: \`$TESTS\` (profile \`mutation\`). Killed $killed / $total."
  echo
  echo "## Survivors"
  echo
  cat "$WORK/survivors.txt"
} > "$OUT/$NAME.md"
cp "$WORK/gambit_out/gambit_results.json" "$OUT/$NAME.mutants.json"
echo "$SRC: killed $killed / $total"
