// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Receives fuel revenue (ETH) from MiningCore and splits it into buckets (docs/03 §3.5).
interface IRevenueRouter {
    function deposit() external payable;
}
