"""Regenerate contracts/src/lib/SiteMath.sol from sim/vectors/outpost_costs.json.

Usage (repo root):  python tools/gen_sitemath.py && (cd contracts && forge fmt src/lib/SiteMath.sol)
The differential test contracts/test/differential/SiteMath.diff.t.sol checks the result.
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
rows = json.loads((ROOT / "sim/vectors/outpost_costs.json").read_text(encoding="utf-8"))["rows"]
capacity = [r["capacity_kw_wad"] for r in rows]
cost = [r["next_level_cost_wad"] for r in rows[:-1]]
assert len(capacity) == 30 and len(cost) == 29
assert all(r["slots"] == 4 + i for i, r in enumerate(rows))


def table(name: str, values: list[str]) -> str:
    first, rest = values[0], values[1:]
    body = ",\n".join([f"            uint256({first})"] + [f"            {v}" for v in rest])
    return (
        f"    function {name}(uint256 level) private pure returns (uint256) {{\n"
        f"        uint256[{len(values)}] memory table = [\n{body}\n        ];\n"
        f"        return table[level - 1];\n    }}"
    )


SRC = f"""// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title SiteMath
/// @notice Drill-site level tables (docs/02 §7). Generated from sim/vectors/outpost_costs.json
///         (capacity = 6 · 1.22^(L−1) ℓ/h and upgrade cost = 150 · L^2.2 MOHN are irrational, so the
///         exact floored values are stored). Do not edit by hand: run tools/gen_sitemath.py.
library SiteMath {{
    uint256 internal constant MAX_LEVEL = 30;

    error InvalidLevel(uint256 level);

    /// @notice Rig pads (slots) at `level`: 3 + level.
    function slots(uint256 level) internal pure returns (uint256) {{
        _check(level);
        return 3 + level;
    }}

    /// @notice Fuel-line capacity in litres per hour (WAD) at `level`.
    function fuelLineCapacity(uint256 level) internal pure returns (uint256) {{
        _check(level);
        return _capacity(level);
    }}

    /// @notice Base MOHN cost (WAD, before the price index) to upgrade from `level` to `level + 1`.
    function upgradeCost(uint256 level) internal pure returns (uint256) {{
        // No loop here; the lint flags callers that iterate over levels (tests).
        // forge-lint: disable-next-line(require-revert-in-loop)
        if (level == 0 || level >= MAX_LEVEL) revert InvalidLevel(level);
        return _upgradeCost(level);
    }}

    function _check(uint256 level) private pure {{
        // forge-lint: disable-next-line(require-revert-in-loop)
        if (level == 0 || level > MAX_LEVEL) revert InvalidLevel(level);
    }}

{table("_capacity", capacity)}

{table("_upgradeCost", cost)}
}}
"""

(ROOT / "contracts/src/lib/SiteMath.sol").write_text(SRC, encoding="utf-8")
print("wrote contracts/src/lib/SiteMath.sol")
