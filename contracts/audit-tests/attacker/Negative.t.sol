// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";

import {MiningCore} from "../../src/MiningCore.sol";
import {BuybackBurner} from "../../src/BuybackBurner.sol";
import {VrgdaMath} from "../../src/lib/VrgdaMath.sol";
import {AttackBase} from "./AttackBase.sol";
import {SelfDestructor} from "./Attacks.t.sol";

contract ReentrantOpener is IUnlockCallback {
    address internal immutable pm;
    MiningCore internal immutable core;

    constructor(address pm_, MiningCore core_) {
        pm = pm_;
        core = core_;
    }

    function go() external {
        (bool ok,) = pm.call(abi.encodeWithSignature("unlock(bytes)", bytes("")));
        require(ok, "outer unlock failed");
    }

    function unlockCallback(bytes calldata) external returns (bytes memory) {
        core.openMarket(); // LiquidityManager.openMarket -> PoolManager.unlock (already unlocked)
        return "";
    }
}

/// @notice Attack ideas that did NOT work; kept as evidence.
contract NegativeTest is AttackBase {
    function setUp() public {
        _deploy();
        _prefill(10, "driller");
        vm.warp(MARKET_OPEN);
        _catchUp();
        _fresh();
    }

    /// Buy 10,000 DP and scrap them at once for credit at the pumped price: even at the most
    /// aggressive legal VRGDA parameters (k = 0.35, r = 1,000/day) the credit is below the cost.
    function test_NEG_buyScrapLoopUnprofitable() public pure {
        int256 lnP0 = FixedPointMathLib.lnWad(10e18);
        int256[2] memory decays =
            [FixedPointMathLib.lnWad(0.85e18), FixedPointMathLib.lnWad(0.65e18)];
        uint256[2] memory rs = [uint256(2000e18), 1000e18];
        for (uint256 i = 0; i < 2; ++i) {
            uint256 p = VrgdaMath.unitPrice(0, 0, lnP0, decays[i], rs[i]);
            uint256 cost = VrgdaMath.batchCost(p, 10_000, decays[i], rs[i]);
            uint256 after_ = VrgdaMath.unitPrice(0, 10_000, lnP0, decays[i], rs[i]);
            uint256 credit = (10_000 * after_ * 2000) / 10_000;
            assertLt(credit, cost, "scrap credit < purchase cost");
        }
    }

    /// openMarket cannot be driven from inside another PoolManager unlock.
    function test_NEG_openMarketInsideUnlockReverts() public {
        ReentrantOpener r = new ReentrantOpener(PM, core);
        vm.expectRevert();
        r.go();
        assertFalse(core.marketOpened());
    }

    /// Even if every genesis miner fast-refines at 0 % fee right before openMarket, the window
    /// keeps room, so openMarket cannot be made to revert at Market Open (only squeezed: ATK-2).
    function test_NEG_cannotFillWindowToBlockOpen() public {
        vm.prank(admin);
        core.setParam(MiningCore.Param.FastRefineFee, 0);
        _refineAll(drillers);
        assertGt(core.mintRoom(), 10_000e18);
        core.openMarket();
        assertTrue(core.marketOpened());
    }

    /// Forced ETH (SELFDESTRUCT) into the BuybackBurner or the LiquidityManager does not block
    /// buybacks or additions (the FINDINGS #8 fix also covers this path).
    function test_NEG_forcedEthDoesNotDos() public {
        core.openMarket();
        SelfDestructor s1 = new SelfDestructor{value: 1 ether}();
        s1.boom(payable(address(bb)));
        SelfDestructor s2 = new SelfDestructor{value: 1 ether}();
        s2.boom(payable(address(lm)));
        uint256 cap = (lm.poolEth() * 200) / 10_000;
        vm.prank(keeper);
        bb.executeBuyback(cap / 2, 1);
        assertEq(address(bb).balance, 0, "forced ETH swept to the bucket");
    }

    /// A 1-wei fast refine mints nothing (fee rounds up) and cannot be used to grief.
    function test_NEG_dustFastRefine() public {
        uint256 room = core.mintRoom();
        vm.prank(drillers[0]);
        core.refine(1, true);
        assertEq(core.mintRoom(), room);
    }

    /// A caller with no credit cannot touch the mint window, registered or not.
    function test_NEG_noCreditNoWindow() public {
        address nobody = makeAddr("nobody");
        vm.prank(nobody);
        vm.expectRevert();
        core.refine(100_000e18, true);
        assertEq(core.mintRoom(), 150_000e18);
    }

    /// The implementation behind the proxy cannot be initialized or used to self-destruct.
    function test_NEG_implementationLocked() public {
        MiningCore impl = MiningCore(deployCode("MiningCore.sol:MiningCore"));
        vm.expectRevert();
        impl.initialize(
            address(this),
            address(1),
            address(1),
            address(1),
            address(0),
            GENESIS,
            1,
            address(1),
            address(1)
        );
    }

    /// The 96 h Timelock cannot reach UPGRADER_ROLE on MiningCore (contrast with ATK-1).
    function test_NEG_paramsTimelockCannotGrantUpgrader() public {
        bytes32 up = core.UPGRADER_ROLE();
        assertEq(core.getRoleAdmin(up), up);
        // Hand-over as in Deploy.s.sol: the initializer admin passes UPGRADER_ROLE on and keeps
        // only DEFAULT_ADMIN_ROLE (the 96 h Timelock's role).
        vm.startPrank(admin);
        core.grantRole(up, makeAddr("upgradeTimelock7d"));
        core.renounceRole(up, admin);
        vm.stopPrank();
        vm.prank(admin);
        vm.expectRevert();
        core.grantRole(up, makeAddr("x"));
    }

    /// A stolen keeper key cannot bypass minOut accounting to keep MOHN: everything bought
    /// is burned in the same call.
    function test_NEG_buybackBurnsAll() public {
        core.openMarket();
        uint256 cap = (lm.poolEth() * 200) / 10_000;
        vm.prank(keeper);
        bb.executeBuyback(cap, 1);
        assertEq(mohn.balanceOf(address(bb)), 0);
        vm.expectRevert(BuybackBurner.ZeroValue.selector);
        vm.prank(keeper);
        bb.executeBuyback(0, 0);
    }
}
