// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice The part of LiquidityManager that MiningCore calls at Market Open.
interface ILiquidityManager {
    function openMarket(uint160 sqrtPriceX96, uint256 polEth) external;
}
