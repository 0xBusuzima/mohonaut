// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, stdJson} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {CustomRevert} from "@uniswap/v4-core/src/libraries/CustomRevert.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";

import {MiningCore} from "../../src/MiningCore.sol";
import {MohnToken} from "../../src/MohnToken.sol";
import {RevenueRouter} from "../../src/RevenueRouter.sol";
import {LiquidityManager} from "../../src/LiquidityManager.sol";
import {BuybackBurner} from "../../src/BuybackBurner.sol";
import {PoolActor} from "../../src/PoolActor.sol";
import {EmissionMath} from "../../src/lib/EmissionMath.sol";
import {MarketOpenMath} from "../../src/lib/MarketOpenMath.sol";
import {MockAggregator} from "../mocks/MockAggregator.sol";
import {PoolSwapper} from "../utils/PoolSwapper.sol";

/// @notice Market Open, buyback & burn, protocol liquidity and fees against the real Uniswap v4
///         PoolManager bytecode of Robinhood Chain (etched at its canonical address; the fixture's
///         code hash is checked against the hash read from mainnet and testnet).
contract MarketTest is Test {
    using stdJson for string;
    using StateLibrary for IPoolManager;

    address internal constant PM = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    bytes32 internal constant PM_CODEHASH =
        0xbd3881180b547f5fe817545743cfb4343e96b1bc6640dcd70c106b0066e95626;
    /// Low 14 bits = 0x2000: the beforeInitialize hook flag only.
    address internal constant LM_ADDR = 0x00000000000000000000000000000000004c2000;
    uint64 internal constant GENESIS = 1_800_003_600 - (1_800_003_600 % 3600);
    uint64 internal constant MARKET_OPEN = GENESIS + 72 hours;
    int256 internal constant ETH_USD = 2500e8;

    IPoolManager internal pm = IPoolManager(PM);
    MockAggregator internal feed;
    RevenueRouter internal router;
    MohnToken internal mohn;
    MiningCore internal core;
    LiquidityManager internal lm;
    BuybackBurner internal bb;
    PoolSwapper internal trader;
    address internal admin = makeAddr("admin");
    address internal keeper = makeAddr("keeper");
    address[] internal drillers;

    function setUp() public {
        vm.warp(GENESIS - 12 hours);
        bytes memory code =
            vm.parseBytes(vm.trim(vm.readFile("test/fixtures/PoolManager.runtime.hex")));
        assertEq(keccak256(code), PM_CODEHASH, "fixture == on-chain PoolManager");
        vm.etch(PM, code);

        feed = new MockAggregator(8, ETH_USD);
        router = new RevenueRouter(admin);
        core = _deployCore();
        deployCodeTo(
            "LiquidityManager.sol:LiquidityManager",
            abi.encode(admin, address(core), PM, address(mohn), address(router)),
            LM_ADDR
        );
        lm = LiquidityManager(payable(LM_ADDR));
        bb = BuybackBurner(
            payable(deployCode(
                    "BuybackBurner.sol:BuybackBurner",
                    abi.encode(admin, PM, address(mohn), address(router), LM_ADDR)
                ))
        );
        trader = new PoolSwapper(pm);

        vm.startPrank(admin);
        router.grantRole(router.DEPOSITOR_ROLE(), address(core));
        router.grantRole(router.FEE_DEPOSITOR_ROLE(), LM_ADDR);
        router.grantRole(router.POL_ROLE(), LM_ADDR);
        router.grantRole(router.BUYBACK_ROLE(), address(bb));
        router.grantRole(router.FEE_DEPOSITOR_ROLE(), address(bb)); // returns unspent ETH
        lm.grantRole(lm.KEEPER_ROLE(), keeper);
        bb.grantRole(bb.KEEPER_ROLE(), keeper);
        core.wireLiquidityManager(LM_ADDR);
        vm.stopPrank();

        // Ten drillers fill their tanks in pre-fill and mine through genesis.
        for (uint256 i = 0; i < 10; ++i) {
            address d = makeAddr(string.concat("driller", vm.toString(i)));
            drillers.push(d);
            vm.deal(d, 10 ether);
            vm.prank(d);
            core.buyFuel{value: 0.0009 ether}(address(0));
        }
        vm.warp(MARKET_OPEN);
        _catchUp();
        _fresh();
    }

    function _deployCore() internal returns (MiningCore c) {
        // deployCode keeps the large creation codes out of this test contract (size limit).
        address impl = deployCode("MiningCore.sol:MiningCore");
        address proxyAddr = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        mohn = new MohnToken(proxyAddr);
        bytes memory init = abi.encodeCall(
            MiningCore.initialize,
            (
                admin,
                address(mohn),
                address(router),
                address(feed),
                address(0),
                GENESIS,
                0.1e18,
                address(0xDE7),
                address(0x7EA5)
            )
        );
        c = MiningCore(address(new ERC1967Proxy(impl, init)));
        assertEq(address(c), proxyAddr);
    }

    function _catchUp() internal {
        while (!core.poke()) {}
    }

    function _fresh() internal {
        feed.set(ETH_USD, vm.getBlockTimestamp(), vm.getBlockTimestamp());
    }

    function _key() internal view returns (PoolKey memory) {
        return lm.poolKey();
    }

    function _id() internal view returns (PoolId) {
        return _key().toId();
    }

    function _sqrtPrice() internal view returns (uint160 p) {
        (p,,,) = pm.getSlot0(_id());
    }

    function _liquidity() internal view returns (uint128) {
        return pm.getLiquidity(_id());
    }

    /// E2 including MOHN burned outside MiningCore (buybacks, LP fee burns).
    function _conservation() internal view {
        assertEq(
            core.reserve() + core.minersDistributed() + core.referralPaid() - core.unrefinedSpent()
                - core.unrefinedRefined() + core.devPending() + core.treasuryPending()
                + core.burnedForever() + core.refineQueued() + mohn.totalSupply() + bb.totalBurned()
                + lm.mohnFeesBurned(),
            EmissionMath.CAP,
            "E2"
        );
    }

    function _open() internal returns (uint256 lp) {
        uint256 supplyBefore = mohn.totalSupply();
        core.openMarket();
        lp = mohn.totalSupply() - supplyBefore;
    }

    // ------------------------------------------------------------------ market open

    function test_openMarket_formulaPriceAndLockedLiquidity() public {
        uint256 polEth = router.polBalance();
        uint256 p0 = MarketOpenMath.openingPrice(core.genesisFuelUsd(), core.genesisMinerAccrual());
        uint256 expectedLp = MarketOpenMath.lpAmount(polEth, 2500e18, p0);
        uint160 expectedSqrt = MarketOpenMath.sqrtPriceX96(2500e18, p0);
        assertEq(core.genesisFuelUsd(), 10 * 2.25e18, "10 x 22.5 L at $0.10");
        assertGt(core.genesisMinerAccrual(), 134_000e18, "~90 % of 72 h emission");
        uint256 reserveBefore = core.reserve();

        vm.expectEmit(address(core));
        emit MiningCore.MarketOpened(p0, 2500e18, polEth, expectedLp, expectedSqrt);
        vm.prank(makeAddr("anyone"));
        uint256 lp = _open();

        assertEq(lp, expectedLp);
        assertApproxEqRel(lp, 40_000e18, 0.1e18, "about 40K MOHN, as in docs/02 S11");
        assertEq(core.reserve(), reserveBefore - lp, "minted from the reserve");
        assertTrue(core.marketOpened());
        assertTrue(lm.opened());
        assertEq(_sqrtPrice(), expectedSqrt, "pool opens at the formula price");
        assertGt(_liquidity(), 0);
        assertEq(router.polBalance(), 0, "all POL ETH went into the pool");
        assertLt(LM_ADDR.balance, 1e12, "only rounding dust stays");
        assertLt(mohn.balanceOf(LM_ADDR), 1e15, "only rounding dust stays");
        _conservation();
    }

    function test_openMarketGuards() public {
        vm.warp(MARKET_OPEN - 1);
        vm.expectRevert(MiningCore.MarketNotOpenYet.selector);
        core.openMarket();
        vm.warp(MARKET_OPEN);
        _open();
        vm.expectRevert(MiningCore.MarketAlreadyOpen.selector);
        core.openMarket();
        vm.expectRevert(LiquidityManager.NotCore.selector);
        lm.openMarket(1, 0);
        vm.prank(address(core));
        vm.expectRevert(LiquidityManager.AlreadyOpen.selector);
        lm.openMarket(1, 0);
    }

    function test_nobodyElseCanInitializeThePool() public {
        PoolKey memory key = _key();
        // The hook rejects any initializer but the LiquidityManager itself.
        vm.expectRevert(
            abi.encodeWithSelector(
                CustomRevert.WrappedError.selector,
                LM_ADDR,
                IHooks.beforeInitialize.selector,
                abi.encodeWithSelector(LiquidityManager.NotSelf.selector),
                abi.encodeWithSelector(Hooks.HookCallFailed.selector)
            )
        );
        pm.initialize(key, TickMath.getSqrtPriceAtTick(0));
        vm.expectRevert(PoolActor.NotPoolManager.selector);
        lm.beforeInitialize(address(lm), key, 1);
    }

    function test_hookAddressIsChecked() public {
        vm.expectRevert(LiquidityManager.BadHookAddress.selector);
        deployCode(
            "LiquidityManager.sol:LiquidityManager",
            abi.encode(admin, address(core), PM, address(mohn), address(router))
        );
    }

    function test_lmConstructorRejectsZeroAddresses() public {
        address target = address(uint160(LM_ADDR) + (1 << 14)); // same hook bits, free address
        vm.expectRevert(PoolActor.ZeroAddress.selector);
        deployCodeTo(
            "LiquidityManager.sol:LiquidityManager",
            abi.encode(address(0), address(core), PM, address(mohn), address(router)),
            target
        );
        vm.expectRevert(PoolActor.ZeroAddress.selector);
        deployCodeTo(
            "LiquidityManager.sol:LiquidityManager",
            abi.encode(admin, address(0), PM, address(mohn), address(router)),
            target
        );
    }

    function test_wiringIsOneTime() public {
        assertEq(core.liquidityManager(), LM_ADDR);
        vm.startPrank(admin);
        vm.expectRevert(MiningCore.AlreadyWired.selector);
        core.wireLiquidityManager(address(1));
        vm.stopPrank();
        MiningCore fresh = _deployCore();
        vm.startPrank(admin);
        vm.expectRevert(MiningCore.ZeroAddress.selector);
        fresh.wireLiquidityManager(address(0));
        vm.stopPrank();
        vm.expectRevert(MiningCore.ZeroAddress.selector);
        fresh.openMarket(); // not wired
        vm.prank(admin);
        fresh.wireLiquidityManager(address(1));
        vm.expectRevert(MarketOpenMath.NoGenesisActivity.selector);
        fresh.openMarket(); // nobody mined during its genesis
    }

    function test_openMarketTripsBreakerOnHugeLp() public {
        vm.deal(address(core), 100 ether);
        vm.prank(address(core));
        router.deposit{value: 100 ether}(); // 30 ETH of POL: LP far above 150K
        vm.expectEmit(address(core));
        emit MiningCore.MintBreakerTripped(1_000_000e18);
        core.openMarket();
        assertFalse(core.marketOpened(), "stays closed until the breaker is reset");
        assertTrue(core.mintBreakerTripped());
        assertEq(mohn.totalSupply(), 0);
    }

    // ------------------------------------------------------------------ buyback

    function test_buyback_burnsEverythingBought() public {
        vm.prank(keeper);
        vm.expectRevert(PoolActor.MarketNotOpen.selector);
        bb.executeBuyback(1e12, 0);

        _open();
        uint256 supply = mohn.totalSupply();
        // The genesis buyback bucket is spent over many days at the 2 % daily cap (docs/02 S11).
        uint256 cap = (lm.poolEth() * 200) / 10_000;
        assertGt(router.buybackBalance(), cap);
        uint256 ethIn = cap;
        vm.prank(keeper);
        bb.executeBuyback(ethIn, 1);
        assertGt(bb.totalBurned(), 0);
        assertEq(mohn.totalSupply(), supply - bb.totalBurned(), "100 % burned");
        assertEq(mohn.balanceOf(address(bb)), 0);
        assertEq(bb.totalEthSpent(), ethIn);
        _conservation();
    }

    function test_buybackGuards() public {
        _open();
        uint256 cap = (lm.poolEth() * 200) / 10_000;
        bytes32 role = bb.KEEPER_ROLE();
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, address(this), role
            )
        );
        bb.executeBuyback(1e12, 0);

        vm.startPrank(keeper);
        vm.expectRevert(BuybackBurner.ZeroValue.selector);
        bb.executeBuyback(0, 0);
        vm.expectRevert(abi.encodeWithSelector(BuybackBurner.DailyCapExceeded.selector, cap));
        bb.executeBuyback(cap + 1, 0);
        vm.expectRevert(); // SlippageExceeded inside the callback
        bb.executeBuyback(cap / 2, type(uint256).max);
        bb.executeBuyback(cap / 2, 1);
        uint256 remaining = (lm.poolEth() * 200) / 10_000 - cap / 2;
        vm.expectRevert(abi.encodeWithSelector(BuybackBurner.DailyCapExceeded.selector, remaining));
        bb.executeBuyback(remaining + 1, 0);
        vm.stopPrank();

        vm.warp(MARKET_OPEN + 1 days); // a new UTC day resets the cap
        vm.prank(keeper);
        bb.executeBuyback(cap / 4, 1);
    }

    /// Manipulation scenario (docs/06 2.6): someone pumps the pool right before the keeper's
    /// buyback. The keeper's off-chain minOut makes the buyback revert instead of buying high;
    /// with a careless minOut the loss is bounded by the 2 % daily cap.
    function test_pumpBeforeBuyback_isBoundedByCapAndMinOut() public {
        _open();
        uint256 cap = (lm.poolEth() * 200) / 10_000;
        uint256 fairOut = _quoteBuy(cap / 2);

        vm.deal(address(trader), 1 ether);
        trader.swap(_key(), true, lm.poolEth()); // doubles the ETH side: MOHN price up ~4x

        vm.prank(keeper);
        vm.expectRevert(); // minOut (99 % of fair) fails after the pump
        bb.executeBuyback(cap / 2, (fairOut * 99) / 100);

        // Careless keeper (minOut = 1): the cap still bounds what can be spent today.
        uint256 newCap = (lm.poolEth() * 200) / 10_000;
        vm.prank(keeper);
        bb.executeBuyback(newCap, 1);
        assertLe(bb.totalEthSpent(), newCap);
        _conservation();
    }

    function _quoteBuy(uint256 ethIn) internal returns (uint256 out) {
        uint256 snap = vm.snapshotState();
        vm.deal(address(trader), ethIn);
        out = trader.swap(_key(), true, ethIn);
        vm.revertToState(snap);
    }

    function test_buybackDailyBpsBoundedAndRateLimited() public {
        bytes32 role = bb.DEFAULT_ADMIN_ROLE();
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, address(this), role
            )
        );
        bb.setDailyBps(100);
        vm.startPrank(admin);
        vm.expectRevert(BuybackBurner.DailyBpsOutOfBounds.selector);
        bb.setDailyBps(49);
        vm.expectRevert(BuybackBurner.DailyBpsOutOfBounds.selector);
        bb.setDailyBps(501);
        vm.expectEmit(address(bb));
        emit BuybackBurner.DailyBpsChanged(100);
        bb.setDailyBps(100);
        assertEq(bb.dailyBps(), 100);
        vm.expectRevert(
            abi.encodeWithSelector(
                BuybackBurner.RateLimited.selector, uint64(vm.getBlockTimestamp()) + 7 days
            )
        );
        bb.setDailyBps(300);
        vm.warp(vm.getBlockTimestamp() + 7 days);
        bb.setDailyBps(300);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ liquidity

    function test_addLiquidity_growsLockedPosition() public {
        _open();
        vm.deal(address(core), 1 ether);
        vm.prank(address(core));
        router.deposit{value: 1 ether}(); // more POL ETH arrives from fuel sales
        uint128 before = _liquidity();
        uint256 ethIn = (lm.poolEth() * 400) / 10_000;

        vm.prank(keeper);
        lm.addLiquidity(ethIn, 1);
        assertGt(_liquidity(), before);
        assertLt(LM_ADDR.balance, ethIn / 100, "nearly all ETH went in");
        _conservation();
    }

    function test_addLiquidityGuards() public {
        vm.prank(keeper);
        vm.expectRevert(PoolActor.MarketNotOpen.selector);
        lm.addLiquidity(1e12, 0);
        _open();
        vm.deal(address(core), 1 ether);
        vm.prank(address(core));
        router.deposit{value: 1 ether}();
        uint256 cap = (lm.poolEth() * 400) / 10_000;
        bytes32 role = lm.KEEPER_ROLE();
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, address(this), role
            )
        );
        lm.addLiquidity(1e12, 0);
        vm.startPrank(keeper);
        vm.expectRevert(LiquidityManager.ZeroValue.selector);
        lm.addLiquidity(1, 0);
        vm.expectRevert(abi.encodeWithSelector(LiquidityManager.DailyCapExceeded.selector, cap));
        lm.addLiquidity(cap + 1, 0);
        vm.expectRevert(); // SlippageExceeded inside the callback
        lm.addLiquidity(cap / 2, type(uint256).max);
        lm.addLiquidity(cap / 2, 1);
        vm.stopPrank();
    }

    function test_collectFees_burnsMohnAndFundsBuyback() public {
        _open();
        vm.deal(address(trader), 1 ether);
        uint256 bought = trader.swap(_key(), true, lm.poolEth() / 20); // ETH fees accrue
        trader.swap(_key(), false, bought / 2); // MOHN fees accrue
        uint256 buybackBefore = router.buybackBalance();
        uint256 supply = mohn.totalSupply();

        vm.prank(makeAddr("anyone"));
        lm.collectFees();
        assertGt(lm.ethFeesToBuyback(), 0);
        assertGt(lm.mohnFeesBurned(), 0);
        assertEq(router.buybackBalance(), buybackBefore + lm.ethFeesToBuyback());
        assertEq(mohn.totalSupply(), supply - lm.mohnFeesBurned());
        _conservation();

        vm.prank(makeAddr("anyone"));
        lm.collectFees(); // nothing new: a no-op
    }

    function test_unexpectedEthRejected() public {
        vm.deal(address(this), 1 ether);
        (bool ok,) = LM_ADDR.call{value: 1}("");
        assertFalse(ok);
        (ok,) = address(bb).call{value: 1}("");
        assertFalse(ok);
        vm.expectRevert(PoolActor.NotPoolManager.selector);
        lm.unlockCallback("");
        vm.expectRevert(PoolActor.NotPoolManager.selector);
        bb.unlockCallback("");
    }

    function test_constructorsRejectZeroAddresses() public {
        vm.expectRevert(PoolActor.ZeroAddress.selector);
        deployCode(
            "BuybackBurner.sol:BuybackBurner",
            abi.encode(admin, address(0), address(mohn), address(router), LM_ADDR)
        );
        vm.expectRevert(PoolActor.ZeroAddress.selector);
        deployCode(
            "BuybackBurner.sol:BuybackBurner",
            abi.encode(address(0), PM, address(mohn), address(router), LM_ADDR)
        );
    }

    // ------------------------------------------------------------------ L1

    /// L1: the LiquidityManager has no way to remove liquidity. Its external surface is exactly
    /// this list (from the compiled ABI); adding any function makes this test fail.
    function test_noLiquidityRemovalFunction() public view {
        string memory artifact = vm.readFile("out/LiquidityManager.sol/LiquidityManager.json");
        string[23] memory allowed = [
            "ADD_DAILY_BPS()",
            "DEFAULT_ADMIN_ROLE()",
            "KEEPER_ROLE()",
            "addDay()",
            "addLiquidity(uint256,uint256)",
            "addedInDay()",
            "beforeInitialize(address,(address,address,uint24,int24,address),uint160)",
            "collectFees()",
            "core()",
            "ethFeesToBuyback()",
            "getRoleAdmin(bytes32)",
            "grantRole(bytes32,address)",
            "hasRole(bytes32,address)",
            "mohn()",
            "mohnFeesBurned()",
            "openMarket(uint160,uint256)",
            "opened()",
            "poolEth()",
            "poolKey()",
            "poolManager()",
            "renounceRole(bytes32,address)",
            "revokeRole(bytes32,address)",
            "router()"
        ];
        string[] memory keys = vm.parseJsonKeys(artifact, ".methodIdentifiers");
        // supportsInterface and unlockCallback complete the surface.
        assertEq(keys.length, allowed.length + 2, "unexpected external function");
        for (uint256 i = 0; i < allowed.length; ++i) {
            assertTrue(
                vm.keyExistsJson(
                    artifact, string.concat(".methodIdentifiers.['", allowed[i], "']")
                ),
                allowed[i]
            );
        }
    }

    /// L1 under trading: the protocol position's liquidity only ever grows.
    function test_liquidityNeverDecreases() public {
        _open();
        uint128 last = _liquidity();
        vm.deal(address(trader), 10 ether);
        vm.deal(address(core), 10 ether);
        for (uint256 i = 0; i < 6; ++i) {
            uint256 bought = trader.swap(_key(), true, lm.poolEth() / 50);
            trader.swap(_key(), false, bought);
            lm.collectFees();
            vm.prank(address(core));
            router.deposit{value: 0.1 ether}();
            uint256 cap = (lm.poolEth() * 400) / 10_000;
            vm.prank(keeper);
            lm.addLiquidity(cap / 2, 1);
            assertGe(_liquidity(), last);
            last = _liquidity();
            vm.warp(vm.getBlockTimestamp() + 1 days);
        }
        _conservation();
    }
}
