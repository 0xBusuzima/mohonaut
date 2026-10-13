// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {MiningAccounting} from "../../src/MiningAccounting.sol";

/// @notice Test-only harness: exposes position setting directly (machines and fuel arrive in 2.3/2.4).
contract AccountingHarness is MiningAccounting {
    constructor(uint64 genesisTime) {
        _initAccounting(genesisTime, genesisTime / 1 hours + 72);
    }

    function setPosition(address account, uint128 dp, uint64 expiryHour) external {
        _requireCheckpointed();
        _setPosition(account, dp, expiryHour);
    }

    function settle(address account) external {
        _requireCheckpointed();
        _settle(account);
    }

    /// No referral program in the bare accounting core.
    function _onAccrued(address, uint256) internal override {}
}
