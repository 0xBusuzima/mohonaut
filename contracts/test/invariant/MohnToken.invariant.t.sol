// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {MohnToken} from "../../src/MohnToken.sol";

/// @notice Drives the token with random mints, burns, transfers and time jumps from many actors.
contract MohnTokenHandler is Test {
    MohnToken public immutable token;
    address public immutable minter;
    address[] internal actors;

    // Ghost accounting, independent of the token's own bookkeeping.
    uint256 public ghostMinted;
    uint256 public ghostBurned;
    mapping(uint256 day => uint256 minted) public ghostMintedOnDay;
    uint256 public maxObservedDailyMint;
    uint256 public unauthorizedMintSuccesses;

    constructor(MohnToken token_, address minter_) {
        token = token_;
        minter = minter_;
        for (uint256 i = 0; i < 5; ++i) {
            actors.push(makeAddr(string.concat("actor", vm.toString(i))));
        }
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function mint(uint256 actorSeed, uint256 amount) external {
        amount = bound(amount, 0, token.DAILY_MINT_CAP());
        address to = _actor(actorSeed);
        uint256 day = vm.getBlockTimestamp() / 1 days;
        vm.prank(minter);
        try token.mint(to, amount) {
            ghostMinted += amount;
            ghostMintedOnDay[day] += amount;
            if (ghostMintedOnDay[day] > maxObservedDailyMint) {
                maxObservedDailyMint = ghostMintedOnDay[day];
            }
        } catch {}
    }

    function mintAsStranger(uint256 actorSeed, uint256 amount) external {
        amount = bound(amount, 1, token.DAILY_MINT_CAP());
        address stranger = _actor(actorSeed);
        vm.prank(stranger);
        try token.mint(stranger, amount) {
            ++unauthorizedMintSuccesses;
        } catch {}
    }

    function burn(uint256 actorSeed, uint256 amount) external {
        address from = _actor(actorSeed);
        amount = bound(amount, 0, token.balanceOf(from));
        vm.prank(from);
        token.burn(amount);
        ghostBurned += amount;
    }

    function transfer(uint256 fromSeed, uint256 toSeed, uint256 amount) external {
        address from = _actor(fromSeed);
        amount = bound(amount, 0, token.balanceOf(from));
        vm.prank(from);
        assertTrue(token.transfer(_actor(toSeed), amount));
    }

    function warp(uint256 secondsForward) external {
        vm.warp(vm.getBlockTimestamp() + bound(secondsForward, 1, 3 days));
    }

    function sumOfBalances() external view returns (uint256 sum) {
        for (uint256 i = 0; i < actors.length; ++i) {
            sum += token.balanceOf(actors[i]);
        }
    }
}

contract MohnTokenInvariantTest is Test {
    MohnToken internal token;
    MohnTokenHandler internal handler;

    function setUp() public {
        vm.warp(1_800_000_000);
        address minter = makeAddr("miningCore");
        token = new MohnToken(minter);
        handler = new MohnTokenHandler(token, minter);
        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](5);
        selectors[0] = MohnTokenHandler.mint.selector;
        selectors[1] = MohnTokenHandler.mintAsStranger.selector;
        selectors[2] = MohnTokenHandler.burn.selector;
        selectors[3] = MohnTokenHandler.transfer.selector;
        selectors[4] = MohnTokenHandler.warp.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    /// T1: total supply never exceeds the cap.
    function invariant_supplyNeverExceedsCap() public view {
        assertLe(token.totalSupply(), token.MAX_SUPPLY());
    }

    /// T2: nobody but the minter ever mints.
    function invariant_onlyMinterMints() public view {
        assertEq(handler.unauthorizedMintSuccesses(), 0);
    }

    /// T3: no UTC day ever mints more than DAILY_MINT_CAP.
    function invariant_dailyMintNeverExceedsCap() public view {
        assertLe(handler.maxObservedDailyMint(), token.DAILY_MINT_CAP());
        assertLe(token.mintedToday(), token.DAILY_MINT_CAP());
    }

    /// Supply equals minted minus burned, and all of it is held by the actors.
    function invariant_supplyAccounting() public view {
        assertEq(token.totalSupply(), handler.ghostMinted() - handler.ghostBurned());
        assertEq(handler.sumOfBalances(), token.totalSupply());
    }
}
