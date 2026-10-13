// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice The parts of MohnToken that MiningCore (its only minter) uses.
interface IMohnToken {
    function mint(address to, uint256 amount) external;
    function burnFrom(address account, uint256 value) external;
}
