// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {MohnToken} from "../../src/MohnToken.sol";

/// @notice Symbolic proofs run by Halmos (`halmos --function prove_`), not by `forge test`.
/// Every argument is symbolic, so each property is checked for all possible inputs.
contract MohnTokenHalmos is Test {
    MohnToken internal token;
    address internal constant MINTER = address(0xC0FFEE);

    function setUp() public {
        token = new MohnToken(MINTER);
    }

    /// T2: any caller other than the minter is always rejected.
    function prove_onlyMinterCanMint(address caller, address to, uint256 amount) public {
        vm.assume(caller != MINTER);
        vm.prank(caller);
        try token.mint(to, amount) {
            assert(false);
        } catch {}
    }

    /// T1: after any two mints, total supply is still within the cap.
    function prove_totalSupplyNeverExceedsCap(uint256 a, uint256 b, uint256 gap) public {
        vm.startPrank(MINTER);
        try token.mint(address(0xA11CE), a) {} catch {}
        vm.warp(block.timestamp + gap % 365 days);
        try token.mint(address(0xB0B), b) {} catch {}
        vm.stopPrank();
        assert(token.totalSupply() <= token.MAX_SUPPLY());
    }

    /// T3: two mints in the same UTC day can never exceed the daily cap together.
    function prove_dailyMintNeverExceedsCap(uint256 a, uint256 b) public {
        vm.startPrank(MINTER);
        try token.mint(address(0xA11CE), a) {} catch {}
        try token.mint(address(0xB0B), b) {} catch {}
        vm.stopPrank();
        assert(token.mintedToday() <= token.DAILY_MINT_CAP());
        assert(token.totalSupply() <= token.DAILY_MINT_CAP());
    }
}
