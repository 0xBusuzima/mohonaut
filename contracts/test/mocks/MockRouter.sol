// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IRevenueRouter} from "../../src/interfaces/IRevenueRouter.sol";

contract MockRouter is IRevenueRouter {
    uint256 public totalDeposited;

    function deposit() external payable override {
        totalDeposited += msg.value;
    }
}

interface IBuyFuel {
    function buyFuel(address referrer) external payable;
}

/// @notice A router that tries to re-enter MiningCore during deposit.
contract ReenteringRouter is IRevenueRouter {
    IBuyFuel public core;

    function setCore(address core_) external {
        core = IBuyFuel(core_);
    }

    function deposit() external payable override {
        core.buyFuel{value: msg.value}(address(0));
    }
}
