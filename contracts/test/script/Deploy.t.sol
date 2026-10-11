// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";

import {Deploy} from "../../script/Deploy.s.sol";
import {ManualEthUsdFeed} from "../../script/testnet/ManualEthUsdFeed.sol";
import {MiningCore} from "../../src/MiningCore.sol";

/// @notice The deploy script end to end: deploy, wire, hand over, then a full player journey and a
///         parameter change through the real 96 h Timelock. The Uniswap v4 PoolManager is the
///         chain's runtime code (codehash-checked), as in the market tests.
contract DeployScriptTest is Test {
    address internal constant PM = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    bytes32 internal constant PM_CODEHASH =
        0xbd3881180b547f5fe817545743cfb4343e96b1bc6640dcd70c106b0066e95626;

    address internal opsSafe = makeAddr("opsSafe");
    address internal guardian = makeAddr("guardianSafe");
    address internal keeper = makeAddr("keeper");
    address internal player = makeAddr("player");
    uint64 internal genesis;

    Deploy internal script;
    Deploy.Deployment internal d;

    function setUp() public {
        bytes memory code =
            vm.parseBytes(vm.trim(vm.readFile("test/fixtures/PoolManager.runtime.hex")));
        assertEq(keccak256(code), PM_CODEHASH);
        vm.etch(PM, code);

        genesis = uint64(((block.timestamp + 2 days) / 1 hours) * 1 hours);
        vm.setEnv("GENESIS_TIME", vm.toString(genesis));
        vm.setEnv("OPS_SAFE", vm.toString(opsSafe));
        vm.setEnv("GUARDIAN_SAFE", vm.toString(guardian));
        vm.setEnv("KEEPER", vm.toString(keeper));
        vm.setEnv("DEV_RECIPIENT", vm.toString(makeAddr("dev")));
        vm.setEnv("TREASURY_RECIPIENT", vm.toString(makeAddr("treasury")));
        vm.setEnv("WRITE_DEPLOYMENT", "false");
        // deployCode keeps the script's large creation code out of this test contract.
        script = Deploy(deployCode("Deploy.s.sol:Deploy"));
        d = script.run();
    }

    function test_wiredAndHandedOver() public view {
        assertEq(d.token.minter(), address(d.core), "token minter == core proxy");
        assertEq(d.core.token(), address(d.token));
        assertEq(d.core.router(), address(d.router));
        assertEq(d.core.liquidityManager(), address(d.liquidityManager));
        assertEq(d.core.genesisTime(), genesis);
        assertEq(
            uint160(address(d.liquidityManager)) & Hooks.ALL_HOOK_MASK,
            uint160(1 << 13),
            "hook bits"
        );
        assertTrue(d.core.hasRole(d.core.GUARDIAN_ROLE(), guardian));
        assertTrue(d.core.hasRole(d.core.DEFAULT_ADMIN_ROLE(), address(d.paramsTimelock)));
        assertTrue(d.core.hasRole(d.core.CATALOG_ROLE(), address(d.paramsTimelock)));
        assertTrue(d.core.hasRole(d.core.UPGRADER_ROLE(), address(d.upgradeTimelock)));
        assertTrue(d.router.hasRole(d.router.OPS_ROLE(), opsSafe));
        assertTrue(d.liquidityManager.hasRole(d.liquidityManager.KEEPER_ROLE(), keeper));
        assertTrue(d.buybackBurner.hasRole(d.buybackBurner.KEEPER_ROLE(), keeper));
        assertTrue(
            d.paramsTimelock.hasRole(d.paramsTimelock.PROPOSER_ROLE(), opsSafe), "ops proposes"
        );
        assertTrue(
            d.paramsTimelock.hasRole(d.paramsTimelock.EXECUTOR_ROLE(), address(0)),
            "anyone executes"
        );
        // The script itself asserted that the deployer kept no role; check one more time here.
        (, address deployer,) = vm.readCallers();
        assertFalse(d.core.hasRole(bytes32(0), deployer));
        assertFalse(d.core.hasRole(bytes32(0), address(script)));
    }

    /// The whole player journey on the deployed system.
    function test_playerJourney() public {
        vm.warp(genesis - 12 hours);
        vm.prank(keeper);
        ManualEthUsdFeed(d.ethUsdFeed).set(2500e8);
        vm.deal(player, 1 ether);
        vm.prank(player);
        d.core.buyFuel{value: 0.0009 ether}(address(0)); // register + Pilot Rig + pre-fill

        vm.warp(genesis + 10 hours);
        d.core.poke();
        vm.prank(player);
        d.core.buyMachines(1, 1, type(uint256).max, false); // a Rotary Rig from unrefined MOHN
        assertEq(d.core.rigsOf(player, 1).owned, 1);

        vm.warp(genesis + 72 hours);
        while (!d.core.poke()) {}
        vm.prank(keeper);
        ManualEthUsdFeed(d.ethUsdFeed).set(2500e8);
        d.core.openMarket();
        assertTrue(d.core.marketOpened());

        vm.prank(player);
        d.core.refine(100e18, true);
        assertEq(d.token.balanceOf(player), 92e18);
        vm.prank(player);
        d.core.refine(100e18, false);
        vm.warp(genesis + 144 hours);
        while (!d.core.poke()) {}
        vm.prank(keeper);
        d.core.finalizeRefine(player, 0);
        assertEq(d.token.balanceOf(player), 192e18);
    }

    /// A parameter change goes through the real Timelock: the ops Safe proposes, everyone waits
    /// 96 hours, anyone executes. Nobody can skip the delay.
    function test_parameterChangeThroughTimelock() public {
        TimelockController tl = d.paramsTimelock;
        bytes memory data =
            abi.encodeCall(MiningCore.setParam, (MiningCore.Param.FuelPrice, 0.11e18));
        vm.prank(opsSafe);
        tl.schedule(address(d.core), 0, data, bytes32(0), bytes32(0), 96 hours);

        vm.expectRevert(); // too early
        tl.execute(address(d.core), 0, data, bytes32(0), bytes32(0));

        vm.prank(makeAddr("stranger"));
        vm.expectRevert(); // only the ops Safe proposes
        tl.schedule(address(d.core), 0, data, bytes32(0), bytes32(uint256(1)), 96 hours);

        vm.warp(block.timestamp + 96 hours);
        vm.prank(makeAddr("anyone"));
        tl.execute(address(d.core), 0, data, bytes32(0), bytes32(0));
        assertEq(d.core.fuelPriceUsdWad(), 0.11e18);
    }

    function test_manualFeedRefusedOnMainnet() public {
        vm.chainId(4663);
        Deploy fresh = Deploy(deployCode("Deploy.s.sol:Deploy"));
        vm.expectRevert(Deploy.ManualFeedOnMainnet.selector);
        fresh.run();
    }

    function test_manualFeedOnlyOwner() public {
        vm.expectRevert(ManualEthUsdFeed.NotOwner.selector);
        ManualEthUsdFeed(d.ethUsdFeed).set(1);
        assertEq(ManualEthUsdFeed(d.ethUsdFeed).decimals(), 8);
    }

    function test_guardianCanPauseDeployedSystem() public {
        vm.prank(guardian);
        d.core.pause();
        assertGt(d.core.pausedUntil(), block.timestamp);
        bytes32 role = d.core.DEFAULT_ADMIN_ROLE();
        vm.prank(guardian);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, guardian, role
            )
        );
        d.core.unpause();
    }
}
