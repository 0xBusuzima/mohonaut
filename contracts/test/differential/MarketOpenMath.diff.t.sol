// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, stdJson} from "forge-std/Test.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {MarketOpenMath} from "../../src/lib/MarketOpenMath.sol";

/// @notice MarketOpenMath equals sim/vectors/market_open.json exactly (integer algorithm).
contract MarketOpenMathDiffTest is Test {
    using stdJson for string;

    function _u(string memory json, string memory row, string memory field)
        internal
        pure
        returns (uint256)
    {
        return vm.parseUint(json.readString(string.concat(row, field)));
    }

    function test_matchesVectors() public view {
        string memory json =
            vm.readFile(string.concat(vm.projectRoot(), "/../sim/vectors/market_open.json"));
        uint256 rows = 0;
        for (
            uint256 i = 0;
            vm.keyExistsJson(json, string.concat(".rows[", vm.toString(i), "]"));
            ++i
        ) {
            string memory row = string.concat(".rows[", vm.toString(i), "]");
            uint256 energyUsd = _u(json, row, ".genesis_energy_usd_wad");
            assertEq(
                (_u(json, row, ".genesis_kwh_wad") * _u(json, row, ".usd_per_kwh_wad")) / 1e18,
                energyUsd,
                "fuel USD"
            );
            uint256 p0 =
                MarketOpenMath.openingPrice(energyUsd, _u(json, row, ".genesis_miner_accrual_wad"));
            assertEq(p0, _u(json, row, ".p0_usd_wad"), "P0");
            uint256 ethUsd = _u(json, row, ".eth_usd_wad");
            assertEq(
                MarketOpenMath.lpAmount(_u(json, row, ".pol_eth_wad"), ethUsd, p0),
                _u(json, row, ".dig_lp_wad"),
                "LP"
            );
            // sqrt price: price = ethUsd / p0 MOHN per ETH, to ~1e-18 relative (sqrt rounding).
            uint256 sqrtP = MarketOpenMath.sqrtPriceX96(ethUsd, p0);
            uint256 priceWad = Math.mulDiv(sqrtP * sqrtP, 1e18, 1 << 192);
            assertApproxEqRel(priceWad, (ethUsd * 1e18) / p0, 1e9, "price");
            ++rows;
        }
        assertEq(rows, 9);
    }

    function test_noGenesisActivityReverts() public {
        vm.expectRevert(MarketOpenMath.NoGenesisActivity.selector);
        this.price(1e18, 0);
        vm.expectRevert(MarketOpenMath.NoGenesisActivity.selector);
        this.price(0, 1e18);
    }

    function test_lpCappedAtOneMillion() public pure {
        assertEq(MarketOpenMath.lpAmount(1000e18, 3000e18, 1e15), 1_000_000e18);
    }

    function price(uint256 usd, uint256 accrual) external pure returns (uint256) {
        return MarketOpenMath.openingPrice(usd, accrual);
    }
}
