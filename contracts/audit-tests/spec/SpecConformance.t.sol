// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, console2} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {MiningCore} from "../../src/MiningCore.sol";
import {MohnToken} from "../../src/MohnToken.sol";
import {RevenueRouter} from "../../src/RevenueRouter.sol";
import {BuybackBurner} from "../../src/BuybackBurner.sol";
import {EmissionMath} from "../../src/lib/EmissionMath.sol";
import {MarketOpenMath} from "../../src/lib/MarketOpenMath.sol";
import {SiteMath} from "../../src/lib/SiteMath.sol";
import {MockAggregator} from "../../test/mocks/MockAggregator.sol";
import {MockRouter} from "../../test/mocks/MockRouter.sol";

/// @notice SPEC audit (contracts/audits/ai/SPEC.md): the deployed initial state of MiningCore and
///         the other contracts against docs/02 v1.0.1 and sim/params.json. Each test names the
///         docs/02 section it checks. Tests that pin a DIFFERENCE are named test_diff_*: they pass
///         while the difference exists and document its size.
/// Run: FOUNDRY_TEST=audit-tests/spec FOUNDRY_OUT=out-spec FOUNDRY_CACHE_PATH=cache-spec forge test -vv
contract SpecConformanceTest is Test {
    MiningCore internal core;
    MohnToken internal mohn;
    MockAggregator internal ethUsd;
    address internal admin = makeAddr("admin");

    uint64 internal constant GENESIS = 1_800_003_600 - (1_800_003_600 % 3600);

    function setUp() public {
        vm.warp(GENESIS);
        ethUsd = new MockAggregator(8, 2500e8);
        MockRouter router = new MockRouter();
        MiningCore impl = new MiningCore();
        address proxyAddr = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        mohn = new MohnToken(proxyAddr);
        bytes memory init = abi.encodeCall(
            MiningCore.initialize,
            (
                admin,
                address(mohn),
                address(router),
                address(ethUsd),
                address(0),
                GENESIS,
                0.1e18,
                address(0xDE7),
                address(0x7EA5)
            )
        );
        core = MiningCore(address(new ERC1967Proxy(address(impl), init)));
    }

    // ------------------------------------------------------------ S2 token

    function test_token_capAndDailyCap() public view {
        assertEq(mohn.MAX_SUPPLY(), 100_000_000e18, "CAP (S2)");
        assertEq(mohn.DAILY_MINT_CAP(), 500_000e18, "daily mint cap (S2, v1.0)");
        assertEq(core.MINT_BREAKER_LIMIT(), 150_000e18, "hourly mint limit (S2)");
        assertEq(core.MINT_BUCKET() * core.MINT_BUCKETS(), 65 minutes, "window 60-65 min");
        assertEq(core.MAX_REFINE_PER_REQUEST(), 100_000e18, "refine request cap (S2)");
    }

    // ------------------------------------------------------------ S3 emission

    function test_emission_day1() public pure {
        uint256 r = EmissionMath.CAP;
        uint256 day;
        for (uint256 h = 0; h < 24; ++h) {
            uint256 e = EmissionMath.hourlyEmission(r);
            day += e;
            r -= e;
        }
        // docs/02 S3.2: day 1 = 50,000 MOHN; the floored delta_h loses 1.6e-9 MOHN per day.
        assertApproxEqAbs(day, 50_000e18, 2e9, "day 1 emission");
        assertLt(day, 50_000e18, "floored: protocol keeps the dust");
        (uint256 m, uint256 d, uint256 t) = EmissionMath.split(1e18 + 7);
        assertEq(m, 0.9e18 + 6);
        assertEq(d, 0.05e18);
        assertEq(t, 0.05e18 + 1, "split remainder goes to the treasury");
    }

    // ------------------------------------------------------------ S5 fuel, S11 genesis

    function test_fuelAndGenesisConstants() public view {
        assertEq(core.fuelPriceUsdWad(), 0.1e18, "pi_l = $0.10 (S5.1)");
        assertEq(core.maxTankHours(), 720, "tank 720 h (S5.1)");
        assertEq(core.INITIAL_ORACLE_STALENESS(), 26 hours, "staleness 26 h (S5.1)");
        assertEq(core.GENESIS_TANK_GRACE(), 24 hours, "Market Open + 24 h (S11)");
        assertEq(core.PREFILL_WINDOW(), 24 hours, "pre-fill (S11)");
        assertEq(core.GENESIS_DURATION(), 72 hours, "genesis (S11)");
        assertEq(core.REFERRAL_MIN_FUEL_WEI(), 0.003 ether, "referral min fuel (S9)");
        assertEq(core.REFERRAL_BPS(), 300, "referral 3 % (S9)");
        assertEq(core.RESERVE_SHARE_BPS(), 2000, "80/20 spend (S6.3)");
        assertEq(core.SCRAP_CREDIT_BPS(), 2000, "scrap 20 % (S6.4)");
        assertEq(core.SHARE_DAILY_LIMIT(), 100_000e18, "dev/treasury 100K (S3.3)");
        assertEq(core.MOHN_PER_METRE(), 1000e18, "World Depth (S3.4)");
    }

    // ------------------------------------------------------------ S6.1 catalog

    function test_gen1CatalogMatchesDocs() public view {
        uint32[6] memory dp = [uint32(10), 50, 150, 420, 1000, 2700];
        uint128[6] memory burn = [uint128(0.25e18), 1e18, 2.5e18, 6e18, 12.5e18, 30e18];
        uint16[6] memory prem = [uint16(0), 0, 800, 1700, 2700, 4000];
        uint8[6] memory lvl = [uint8(1), 1, 3, 6, 10, 15];
        assertEq(core.machineTypeCount(), 6);
        for (uint256 i = 0; i < 6; ++i) {
            MiningCore.MachineType memory m = core.machineType(i);
            assertEq(m.dp, dp[i], "dp");
            assertEq(m.burn, burn[i], "L/h");
            assertEq(m.premiumBps, prem[i], "premium");
            assertEq(m.minLevel, lvl[i], "unlock level");
            assertEq(m.generation, 1, "generation");
            // eta = 40, 50, ..., 90 DP per L/h
            assertEq((uint256(m.dp) * 1e18) / m.burn, i == 0 ? 40 : 40 + 10 * i, "eta");
        }
    }

    /// docs/02 S6.1 column "Fiyat at p0=10" = DP x 10 x (1 + premium). The contract charges the
    /// VRGDA batch cost, which rises within the batch (unit j costs p(t, n + j)): at t = 0, n = 0
    /// the actual first-buy price is 0.2 % (T1) to 11.8 % (T5) above the docs column.
    function test_diff_docsPriceColumnUnderstatesVrgdaBatchCost() public view {
        uint256[6] memory docPrice = [uint256(0), 500e18, 1620e18, 4914e18, 12_700e18, 37_800e18];
        for (uint256 i = 1; i < 6; ++i) {
            uint256 q = core.quoteMachines(i, 1);
            console2.log("type", i);
            console2.log("  docs/02 S6.1 price (MOHN wei)", docPrice[i]);
            console2.log("  contract quote at t=0,n=0    ", q);
            assertGt(q, docPrice[i], "contract quote above the docs column");
        }
        // Plasma Bore: 42,265.6 MOHN (sim/vectors/vrgda_costs.json tier_cost row 1).
        assertApproxEqRel(core.quoteMachines(5, 1), 42_265.605134022357790511e18, 1e6);
    }

    // ------------------------------------------------------------ S6.2 / S12 bounds

    function test_paramBoundsMatchDocs() public view {
        _bounds(MiningCore.Param.FuelPrice, 0.03e18, 0.5e18, 2500, 7 days);
        _bounds(MiningCore.Param.VrgdaR, 1000e18, 100_000e18, 2500, 30 days);
        _bounds(MiningCore.Param.VrgdaK, 0.05e18, 0.35e18, 2500, 30 days);
        _bounds(MiningCore.Param.FastRefineFee, 0, 1200, 0, 7 days); // docs: 0-12 %, no rate
        _bounds(MiningCore.Param.RefineDelay, 24 hours, 168 hours, 0, 7 days); // docs: no rate
        _bounds(MiningCore.Param.MaxTankHours, 168, 2160, 0, 7 days); // docs: rate "-"
        _bounds(MiningCore.Param.OracleStaleness, 25 hours, 30 hours, 0, 7 days); // docs: rate "-"
        _bounds(MiningCore.Param.SiteCostScale, 5000, 20_000, 2500, 30 days); // docs: no bounds
        assertEq(core.paramValue(MiningCore.Param.VrgdaR), 2000e18, "r (S6.2)");
        assertEq(core.paramValue(MiningCore.Param.VrgdaK), 0.15e18, "k (S6.2)");
        assertEq(core.paramValue(MiningCore.Param.FastRefineFee), 800, "fast fee (S8)");
        assertEq(core.paramValue(MiningCore.Param.RefineDelay), 72 hours, "queue (S8)");
        assertEq(core.paramValue(MiningCore.Param.SiteCostScale), 10_000, "1x");
        assertEq(core.MAX_UNITS_PER_TX(), 10_000);
    }

    function _bounds(MiningCore.Param p, uint256 lo, uint256 hi, uint256 step, uint64 period)
        internal
        view
    {
        (uint256 a, uint256 b, uint256 c, uint64 d) = core.paramBounds(p);
        assertEq(a, lo, "min");
        assertEq(b, hi, "max");
        assertEq(c, step, "step bps");
        assertEq(d, period, "period");
    }

    // ------------------------------------------------------------ S7 site

    /// At genesis p(t, n) should equal p0 = 10 MOHN exactly. The ln/exp round trip
    /// (lnAnchor = lnWad(P0), unitPrice = expWad(lnAnchor)) gives 11 wei less, so idx is floored
    /// to 1 - 2e-18 and every site upgrade at "idx = 1" costs a few hundred wei less than the
    /// SiteMath table (150 MOHN - 300 wei at L1). Not protocol-favourable; dust (ROUNDING).
    function test_diff_genesisPriceAndIdxRoundBelowSpec() public view {
        assertEq(core.unitPrice(), 10e18 - 11, "p(0,0) = p0 - 11 wei");
        assertEq(core.quoteSiteUpgrade(1), 150e18 - 300, "L1 upgrade 300 wei below 150 MOHN");
        for (uint8 level = 1; level < 30; ++level) {
            uint256 q = core.quoteSiteUpgrade(level);
            uint256 t = SiteMath.upgradeCost(level);
            assertLe(q, t, "quote <= table at idx ~ 1");
            assertApproxEqRel(q, t, 3, "within 3e-18 relative");
        }
        assertEq(SiteMath.upgradeCost(1), 150e18);
        assertEq(SiteMath.slots(30), 33);
        assertEq(SiteMath.fuelLineCapacity(1), 6e18);
    }

    /// docs/02 S7 prints L29 capacity "~1,565" and L30 "~1,909" L/h; 6 x 1.22^(L-1) gives
    /// 1,571.18 and 1,916.84 (the table in SiteMath is exact).
    function test_diff_docsCapacityL29L30() public pure {
        assertEq(SiteMath.fuelLineCapacity(29) / 1e16, 157_118, "L29 = 1,571.18 L/h");
        assertEq(SiteMath.fuelLineCapacity(30) / 1e16, 191_684, "L30 = 1,916.84 L/h");
    }

    // ------------------------------------------------------------ S10 revenue, buyback, POL

    function test_revenueSplitAndCaps() public {
        RevenueRouter router = new RevenueRouter(address(this));
        router.grantRole(router.DEPOSITOR_ROLE(), address(this));
        router.deposit{value: 1 ether}();
        assertEq(router.buybackBalance(), 0.55 ether, "55 %");
        assertEq(router.polBalance(), 0.3 ether, "30 %");
        assertEq(router.opsBalance(), 0.15 ether, "15 %");
        router.deposit{value: 7}();
        // floor(7 * 0.55) = 3, floor(7 * 0.3) = 2, ops gets the remainder 2 (not 1).
        assertEq(router.opsBalance(), 0.15 ether + 2, "rounding dust goes to ops");
    }

    /// Not in docs/02: buybacks are capped at 2 % of the pool's ETH per day (Timelock, 0.5-5 %)
    /// and POL additions at 4 % (LiquidityManager.ADD_DAILY_BPS, immutable; checked by
    /// spec_check.py C63 because the LiquidityManager needs a mined hook address). The simulator
    /// adds the whole POL bucket every day (pol_cap_experiment.py).
    function test_diff_buybackDailyCap() public {
        BuybackBurner bb =
            new BuybackBurner(admin, address(0x1), address(mohn), address(0x2), address(0x3));
        assertEq(bb.INITIAL_DAILY_BPS(), 200, "2 % of pool ETH per day");
        assertEq(bb.dailyBps(), 200);
        assertEq(bb.DAILY_BPS_PERIOD(), 7 days);
    }

    // ------------------------------------------------------------ S11 Market Open rounding

    /// P0 is floored, so the LP minted from the reserve is rounded UP relative to the exact value
    /// (not protocol-favourable; dust: here 9,000 wei on 9,000 MOHN, 1e-18 relative).
    function test_diff_openingPriceFloorMintsDustMoreLp() public pure {
        uint256 p0 = MarketOpenMath.openingPrice(1e18, 3e18); // $1 of fuel, 3 MOHN accrued
        assertEq(p0, 333_333_333_333_333_333);
        uint256 lp = MarketOpenMath.lpAmount(1e18, 3000e18, p0);
        assertGt(lp, 9000e18, "floored P0 => LP above the exact 9,000 MOHN");
        assertEq(lp - 9000e18, 9000, "by 9,000 wei");
        // The 1M cap can never bind on-chain: the hourly room is at most 150K.
        assertLt(uint256(150_000e18), MarketOpenMath.LP_CAP);
    }

    // ------------------------------------------------------------ S12 next generation

    function test_generationRule() public view {
        assertEq(core.MAX_EFFICIENCY_GAIN_BPS(), 11_500, "+15 %");
        assertEq(core.GENERATION_INTERVAL(), 45 days, "1 generation / 45 days");
        assertEq(core.MAX_TYPES_PER_GENERATION(), 8, "DOC-GAP: 8 types");
        assertEq(core.MAX_PREMIUM_BPS(), 10_000, "DOC-GAP: premium <= 100 %");
        assertEq(core.GUARDIAN_PAUSE(), 72 hours);
        assertEq(core.GUARDIAN_COOLDOWN(), 7 days);
        assertEq(core.MAX_TIMELOCK_PAUSE(), 30 days);
        assertEq(core.SEQUENCER_GRACE(), 1 hours);
    }
}
