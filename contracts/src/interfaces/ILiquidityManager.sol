// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice The part of LiquidityManager that MiningCore calls at Market Open, and the price
///         anchor that BuybackBurner trades against (docs/02 S10.1).
interface ILiquidityManager {
    function openMarket(uint160 sqrtPriceX96, uint256 polEth) external;

    function anchorTick() external view returns (int24);
}
