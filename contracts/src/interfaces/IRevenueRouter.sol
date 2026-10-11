// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Receives fuel revenue (ETH) from MiningCore and splits it into buckets (docs/03 S3.5).
interface IRevenueRouter {
    /// @notice Fuel revenue, split into the buyback, POL and ops buckets.
    function deposit() external payable;

    /// @notice ETH that goes to the buyback bucket only (e.g. ETH fees of the protocol position).
    function depositBuyback() external payable;

    function pullBuyback(uint256 amount) external;
    function pullPol(uint256 amount) external;
    function polBalance() external view returns (uint256);
    function buybackBalance() external view returns (uint256);
}
