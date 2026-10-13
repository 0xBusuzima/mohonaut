// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {MarketTargets} from "./MarketTargets.sol";

/// @notice Market-layer entry point for Medusa and Echidna (`echidna . --contract
///         CryticMarketTester --config echidna.yaml`). Foundry runs the same properties via
///         CryticMarketToFoundry.t.sol.
contract CryticMarketTester is MarketTargets {
    constructor() payable {
        _setup();
        lastPositionLiquidity = _positionLiquidity();
    }
}
