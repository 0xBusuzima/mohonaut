// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {TargetFunctions} from "./TargetFunctions.sol";

/// @notice Entry point for Medusa and Echidna (`medusa fuzz`, `echidna . --contract CryticTester
///         --config echidna.yaml`). Foundry runs the same properties via CryticToFoundry.t.sol.
contract CryticTester is TargetFunctions {
    constructor() payable {
        _setup();
    }
}
