// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Minimal fuel-revenue sink for MiningCore tests (only deposit is called there).
contract MockRouter {
    uint256 public totalDeposited;

    function deposit() external payable {
        totalDeposited += msg.value;
    }
}

interface IBuyFuel {
    function buyFuel(address referrer) external payable;
}

/// @notice A router that tries to re-enter MiningCore during deposit.
contract ReenteringRouter {
    IBuyFuel public core;

    function setCore(address core_) external {
        core = IBuyFuel(core_);
    }

    function deposit() external payable {
        core.buyFuel{value: msg.value}(address(0));
    }
}
