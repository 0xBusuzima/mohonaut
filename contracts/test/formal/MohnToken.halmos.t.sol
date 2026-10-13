// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Vm} from "forge-std/Vm.sol";
import {MohnToken} from "../../src/MohnToken.sol";

/// @notice Symbolic proofs run by Halmos (`halmos --function prove_`), not by `forge test`.
/// Every argument is symbolic, so each property holds for all possible inputs.
/// Deliberately does not inherit forge-std `Test`: Halmos does not support some cheatcodes
/// used by recent forge-std versions (e.g. deployCode).
contract MohnTokenHalmos {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

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

    /// T1: after any two mints separated by any delay, total supply is within the cap.
    function prove_totalSupplyNeverExceedsCap(uint256 a, uint256 b, uint256 gap) public {
        vm.prank(MINTER);
        try token.mint(address(0xA11CE), a) {} catch {}
        vm.warp(block.timestamp + (gap % 365 days));
        vm.prank(MINTER);
        try token.mint(address(0xB0B), b) {} catch {}
        assert(token.totalSupply() <= token.MAX_SUPPLY());
    }

    /// T3: two mints in the same UTC day can never exceed the daily cap together.
    function prove_dailyMintNeverExceedsCap(uint256 a, uint256 b) public {
        vm.prank(MINTER);
        try token.mint(address(0xA11CE), a) {} catch {}
        vm.prank(MINTER);
        try token.mint(address(0xB0B), b) {} catch {}
        assert(token.mintedToday() <= token.DAILY_MINT_CAP());
        assert(token.totalSupply() <= token.DAILY_MINT_CAP());
    }
}
