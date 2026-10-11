// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title MarketOpenMath
/// @notice Market Open formulas (docs/02 S11), integer algorithm of sim/vectors/market_open.json:
///         P0 = floor(genesisFuelUsd * 1e18 / genesisMinerAccrual)        (USD per MOHN, WAD)
///         LP = min(floor(polEth * ethUsd / P0), 1,000,000 MOHN)           (minted from the reserve)
///         sqrtPriceX96 = sqrt(ethUsd / P0 * 2^192): MOHN per ETH, both 18 decimals, ETH is currency0.
library MarketOpenMath {
    uint256 internal constant LP_CAP = 1_000_000e18;

    error NoGenesisActivity();

    /// @notice Opening price in USD per MOHN (WAD): the miners' average genesis fuel cost.
    function openingPrice(uint256 genesisFuelUsd, uint256 genesisMinerAccrual)
        internal
        pure
        returns (uint256 p0)
    {
        // No loop here; the lint flags a caller that iterates over vectors (tests).
        // forge-lint: disable-next-line(require-revert-in-loop)
        if (genesisMinerAccrual == 0) revert NoGenesisActivity();
        p0 = Math.mulDiv(genesisFuelUsd, 1e18, genesisMinerAccrual);
        // forge-lint: disable-next-line(require-revert-in-loop)
        if (p0 == 0) revert NoGenesisActivity();
    }

    /// @notice MOHN paired with `polEth` at price `p0`, capped at 1M.
    function lpAmount(uint256 polEth, uint256 ethUsd, uint256 p0) internal pure returns (uint256) {
        return Math.min(Math.mulDiv(polEth, ethUsd, p0), LP_CAP);
    }

    /// @notice Uniswap v4 sqrt price (Q64.96) of currency1 (MOHN) in currency0 (ETH) units.
    function sqrtPriceX96(uint256 ethUsd, uint256 p0) internal pure returns (uint160) {
        // price = ethUsd / p0 MOHN per ETH; sqrt(price * 2^192) = sqrt(price) * 2^96.
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint160(Math.sqrt(Math.mulDiv(ethUsd, 1 << 192, p0)));
    }
}
