// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Vm} from "forge-std/Vm.sol";
import {MiningCore} from "../../src/MiningCore.sol";

/// @notice Unit tests of the refinery run without a Uniswap pool, but refining needs `openMarket`
///         to have run (AI review AI-4). This marks the market open directly in storage: it wires
///         a placeholder LiquidityManager, finds the CoreStorage slot that packs its address with
///         the `marketOpened` flag, and sets that flag. Integration tests open the real market.
library MarketOpenCheat {
    Vm internal constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    // MiningCore's ERC-7201 namespace (CORE_STORAGE_SLOT).
    bytes32 internal constant CORE_SLOT =
        0x23f0141ec1bbecd7265da6fbc91f7278ae21b7e83f5560ce12ee55220b9da600;
    address internal constant PLACEHOLDER_LM = address(0x4D4D);

    function forceOpen(MiningCore core, address admin) internal {
        VM.prank(admin);
        core.wireLiquidityManager(PLACEHOLDER_LM);
        markOpen(core);
    }

    /// @dev After the placeholder was wired (by the admin, e.g. in setUp).
    function markOpen(MiningCore core) internal {
        for (uint256 i = 0; i < 64; ++i) {
            bytes32 slot = bytes32(uint256(CORE_SLOT) + i);
            bytes32 word = VM.load(address(core), slot);
            if (address(uint160(uint256(word))) == PLACEHOLDER_LM) {
                // `marketOpened` is the next field, packed right above the address (byte 20).
                VM.store(address(core), slot, word | bytes32(uint256(1) << 160));
                require(core.marketOpened(), "MarketOpenCheat: wrong slot");
                return;
            }
        }
        revert("MarketOpenCheat: liquidityManager slot not found");
    }
}
