// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, stdJson} from "forge-std/Test.sol";
import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";
import {VrgdaMath} from "../../src/lib/VrgdaMath.sol";

/// @notice VrgdaMath against sim/vectors/vrgda_costs.json (60-digit Decimal reference).
///         Tolerance: relative 1e-12 (exp/ln approximations), or 2 wei per unit for prices so far
///         behind schedule that they are only a few wei (absolute rounding dominates there).
contract VrgdaMathDiffTest is Test {
    using stdJson for string;

    uint256 internal constant P0 = 10e18;
    uint256 internal constant R = 2000;
    uint256 internal constant REL_TOL = 1e6; // 1e-12 in forge's 1e18 scale

    int256 internal lnP0;
    int256 internal decay;
    string internal json;

    function setUp() public {
        lnP0 = FixedPointMathLib.lnWad(int256(P0));
        decay = FixedPointMathLib.lnWad(0.85e18);
        json = vm.readFile(string.concat(vm.projectRoot(), "/../sim/vectors/vrgda_costs.json"));
    }

    function _premiumBps(uint256 tier) internal pure returns (uint256) {
        uint16[6] memory bps = [uint16(0), 0, 800, 1700, 2700, 4000];
        return bps[tier];
    }

    function _close(uint256 got, uint256 want, uint256 q, string memory what) internal pure {
        uint256 diff = got > want ? got - want : want - got;
        if (diff <= 2 * q) return;
        assertApproxEqRel(got, want, REL_TOL, what);
    }

    function test_pricesAndCostsMatchVectors() public view {
        uint256 rows = 61;
        assertFalse(vm.keyExistsJson(json, ".rows[61]"), "row count");
        for (uint256 i = 0; i < rows; ++i) {
            string memory row = string.concat(".rows[", vm.toString(i), "]");
            uint256 t = vm.parseUint(json.readString(string.concat(row, ".t_seconds")));
            uint256 n = vm.parseUint(json.readString(string.concat(row, ".n_units")));
            uint256 q = vm.parseUint(json.readString(string.concat(row, ".q_units")));
            string memory priceStr = json.readString(string.concat(row, ".unit_price_wad"));
            // Beyond expWad (and uint256): covered by test_farAheadReverts.
            if (bytes(priceStr).length > 58) continue;
            uint256 wantPrice = vm.parseUint(priceStr);
            uint256 price = VrgdaMath.unitPrice(t, n, lnP0, decay, R);
            _close(price, wantPrice, 1, "unit price");
            uint256 cost = VrgdaMath.batchCost(price, q, decay, R);
            _close(
                cost,
                vm.parseUint(json.readString(string.concat(row, ".batch_cost_wad"))),
                q,
                "batch"
            );
            if (vm.keyExistsJson(json, string.concat(row, ".tier"))) {
                uint256 tier = json.readUint(string.concat(row, ".tier"));
                uint256 tierCost =
                    FixedPointMathLib.mulDivUp(cost, 10_000 + _premiumBps(tier), 10_000);
                _close(
                    tierCost,
                    vm.parseUint(json.readString(string.concat(row, ".tier_cost_wad"))),
                    q,
                    "tier"
                );
            }
        }
    }

    /// The 730-day row (4M units sold, ~1e90 MOHN per unit) is beyond expWad: it must revert,
    /// never wrap.
    function test_farAheadReverts() public {
        vm.expectRevert(FixedPointMathLib.ExpOverflow.selector);
        this.priceAt(730 days, 4_000_000);
    }

    function test_farBehindRoundsToZero() public view {
        assertEq(this.priceAt(365 days, 0), 0);
    }

    function priceAt(uint256 t, uint256 n) external view returns (uint256) {
        return VrgdaMath.unitPrice(t, n, lnP0, decay, R);
    }
}
