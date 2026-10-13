// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {ERC20Capped} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import {MohnToken} from "../../src/MohnToken.sol";

contract MohnTokenTest is Test {
    MohnToken internal token;
    address internal minter = makeAddr("miningCore");
    address internal alice = makeAddr("alice");

    uint256 internal constant CAP = 100_000_000e18;
    uint256 internal constant DAILY = 500_000e18;

    function setUp() public {
        vm.warp(1_800_000_000); // a realistic timestamp, mid UTC day
        token = new MohnToken(minter);
    }

    // ----- metadata and immutables -----

    function test_metadata() public view {
        assertEq(token.name(), "Mohonaut");
        assertEq(token.symbol(), "MOHN");
        assertEq(token.decimals(), 18);
        assertEq(token.cap(), CAP);
        assertEq(token.DAILY_MINT_CAP(), DAILY);
        assertEq(token.minter(), minter);
        assertEq(token.totalSupply(), 0, "no premine");
    }

    function test_constructor_revertsOnZeroMinter() public {
        vm.expectRevert(MohnToken.ZeroMinter.selector);
        new MohnToken(address(0));
    }

    // ----- mint authority -----

    function test_mint_onlyMinter() public {
        vm.prank(alice);
        vm.expectRevert(MohnToken.NotMinter.selector);
        token.mint(alice, 1);
    }

    function test_mint_byMinter() public {
        vm.prank(minter);
        token.mint(alice, 1_000e18);
        assertEq(token.balanceOf(alice), 1_000e18);
        assertEq(token.totalSupply(), 1_000e18);
        assertEq(token.mintedToday(), 1_000e18);
    }

    function test_mint_toZeroAddressReverts() public {
        vm.prank(minter);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InvalidReceiver.selector, address(0))
        );
        token.mint(address(0), 1);
    }

    // ----- daily mint cap -----

    function test_dailyCap_exactlyReachable() public {
        vm.prank(minter);
        token.mint(alice, DAILY);
        assertEq(token.mintedToday(), DAILY);
    }

    function test_dailyCap_oneWeiOverReverts() public {
        vm.startPrank(minter);
        token.mint(alice, DAILY);
        vm.expectRevert(abi.encodeWithSelector(MohnToken.DailyMintCapExceeded.selector, DAILY, 1));
        token.mint(alice, 1);
        vm.stopPrank();
    }

    function test_dailyCap_singleOversizedMintReverts() public {
        vm.prank(minter);
        vm.expectRevert(
            abi.encodeWithSelector(MohnToken.DailyMintCapExceeded.selector, 0, DAILY + 1)
        );
        token.mint(alice, DAILY + 1);
    }

    function test_dailyCap_resetsAtUtcMidnight() public {
        uint256 nextDayStart = (vm.getBlockTimestamp() / 1 days + 1) * 1 days;
        vm.startPrank(minter);
        token.mint(alice, DAILY);

        vm.warp(nextDayStart - 1); // last second of the same UTC day
        vm.expectRevert(abi.encodeWithSelector(MohnToken.DailyMintCapExceeded.selector, DAILY, 1));
        token.mint(alice, 1);

        vm.warp(nextDayStart); // first second of the next UTC day
        assertEq(token.mintedToday(), 0);
        token.mint(alice, DAILY);
        vm.stopPrank();
        assertEq(token.totalSupply(), 2 * DAILY);
    }

    function test_dailyCap_skippedDaysDoNotAccumulate() public {
        vm.startPrank(minter);
        vm.warp(vm.getBlockTimestamp() + 10 days);
        token.mint(alice, DAILY);
        vm.expectRevert(abi.encodeWithSelector(MohnToken.DailyMintCapExceeded.selector, DAILY, 1));
        token.mint(alice, 1);
        vm.stopPrank();
    }

    // ----- hard cap -----

    function test_hardCap_cannotBeExceeded() public {
        vm.startPrank(minter);
        // Mint the whole cap over 200 days at the daily maximum.
        for (uint256 d = 0; d < CAP / DAILY; ++d) {
            token.mint(alice, DAILY);
            vm.warp(vm.getBlockTimestamp() + 1 days);
        }
        assertEq(token.totalSupply(), CAP);
        vm.expectRevert(abi.encodeWithSelector(ERC20Capped.ERC20ExceededCap.selector, CAP + 1, CAP));
        token.mint(alice, 1);
        vm.stopPrank();
    }

    function test_hardCap_burnFreesRoomButCapStillBinds() public {
        vm.startPrank(minter);
        for (uint256 d = 0; d < CAP / DAILY; ++d) {
            token.mint(alice, DAILY);
            vm.warp(vm.getBlockTimestamp() + 1 days);
        }
        vm.stopPrank();
        vm.prank(alice);
        token.burn(10e18);
        vm.startPrank(minter);
        token.mint(alice, 10e18); // re-mint up to the cap (reserve recycling, docs/02 §6.3)
        vm.expectRevert(abi.encodeWithSelector(ERC20Capped.ERC20ExceededCap.selector, CAP + 1, CAP));
        token.mint(alice, 1);
        vm.stopPrank();
    }

    // ----- burn and permit -----

    function test_burn_reducesSupply() public {
        vm.prank(minter);
        token.mint(alice, 100e18);
        vm.prank(alice);
        token.burn(40e18);
        assertEq(token.totalSupply(), 60e18);
        assertEq(token.balanceOf(alice), 60e18);
    }

    function test_burnFrom_requiresAllowance() public {
        vm.prank(minter);
        token.mint(alice, 100e18);
        address spender = makeAddr("spender");
        vm.prank(spender);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, spender, 0, 1)
        );
        token.burnFrom(alice, 1);
    }

    function test_permit_setsAllowance() public {
        (address owner, uint256 key) = makeAddrAndKey("owner");
        address spender = makeAddr("spender");
        uint256 deadline = vm.getBlockTimestamp() + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
                ),
                owner,
                spender,
                5e18,
                token.nonces(owner),
                deadline
            )
        );
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        token.permit(owner, spender, 5e18, deadline, v, r, s);
        assertEq(token.allowance(owner, spender), 5e18);
        assertEq(token.nonces(owner), 1);
    }

    // ----- no hidden powers -----

    function test_noOwnerOrAdminSurface() public {
        // A selector the contract must NOT expose: owner(), pause(), setMinter(address).
        bytes4[3] memory forbidden = [
            bytes4(keccak256("owner()")),
            bytes4(keccak256("pause()")),
            bytes4(keccak256("setMinter(address)"))
        ];
        for (uint256 i = 0; i < forbidden.length; ++i) {
            (bool ok,) = address(token).call(abi.encodeWithSelector(forbidden[i]));
            assertFalse(ok);
        }
    }

    // ----- fuzz -----

    function testFuzz_mintSequenceRespectsCaps(uint96[16] memory amounts, uint32[16] memory gaps)
        public
    {
        uint256 day = vm.getBlockTimestamp() / 1 days;
        uint256 mintedInDay;
        for (uint256 i = 0; i < amounts.length; ++i) {
            vm.warp(vm.getBlockTimestamp() + uint256(gaps[i]) % 3 days);
            if (vm.getBlockTimestamp() / 1 days != day) {
                day = vm.getBlockTimestamp() / 1 days;
                mintedInDay = 0;
            }
            uint256 amount = uint256(amounts[i]) % (DAILY + 1);
            bool fits = mintedInDay + amount <= DAILY && token.totalSupply() + amount <= CAP;
            vm.prank(minter);
            if (fits) {
                token.mint(alice, amount);
                mintedInDay += amount;
            } else {
                vm.expectRevert();
                token.mint(alice, amount);
            }
            assertLe(token.mintedToday(), DAILY);
            assertLe(token.totalSupply(), CAP);
        }
    }
}
