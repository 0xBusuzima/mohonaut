// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";

import {MiningCore} from "../src/MiningCore.sol";
import {MohnToken} from "../src/MohnToken.sol";
import {RevenueRouter} from "../src/RevenueRouter.sol";
import {LiquidityManager} from "../src/LiquidityManager.sol";
import {BuybackBurner} from "../src/BuybackBurner.sol";
import {MohnPool} from "../src/lib/MohnPool.sol";
import {ManualEthUsdFeed} from "./testnet/ManualEthUsdFeed.sol";

/// @title Deploy
/// @notice Deploys, wires and hands over the whole Mohonaut system in one broadcast
///         (docs/04 S4, docs/03 S3.8):
///         1. deploy: token (minter = the predicted MiningCore proxy, asserted), MiningCore behind a
///            UUPS proxy, RevenueRouter, LiquidityManager at a CREATE2 address with the Uniswap v4
///            hook bits 0x2000, BuybackBurner, a 96 h and a 7-day TimelockController;
///         2. configure: every bucket, keeper, guardian and catalog role, and the one-time wiring;
///         3. hand over: every admin role to the 96 h Timelock, upgrades to the 7-day Timelock,
///            then the deployer renounces everything and the script asserts it holds no role left.
///         The deployer key is never in a file: run with `--account <keystore>` or `--ledger`.
///         Configuration comes from the environment; see contracts/.env.example.
contract Deploy is Script {
    /// @notice Arachnid deterministic deployer, present on Robinhood Chain mainnet and testnet.
    address internal constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    address internal constant POOL_MANAGER = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    uint256 internal constant MAINNET_CHAIN_ID = 4663;
    uint256 internal constant PARAMS_DELAY = 96 hours;
    uint256 internal constant UPGRADE_DELAY = 7 days;
    uint256 internal constant FUEL_PRICE_USD = 0.1e18;

    struct Config {
        uint64 genesisTime;
        address opsSafe; // proposes to both Timelocks, receives the ops bucket
        address guardianSafe;
        address keeper;
        address devRecipient;
        address treasuryRecipient;
        address ethUsdFeed; // address(0) on testnet: deploy a ManualEthUsdFeed owned by the keeper
        address poolManager;
    }

    struct Deployment {
        MohnToken token;
        MiningCore core;
        address coreImplementation;
        RevenueRouter router;
        LiquidityManager liquidityManager;
        BuybackBurner buybackBurner;
        TimelockController paramsTimelock;
        TimelockController upgradeTimelock;
        address ethUsdFeed;
    }

    error HookAddressNotFound();
    error MinterMismatch(address predicted, address actual);
    error ManualFeedOnMainnet();
    error GenesisTooLate(uint64 genesisTime);
    error DeployerStillHasRole(address target, bytes32 role);

    function run() external returns (Deployment memory d) {
        Config memory cfg = configFromEnv();
        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        d = deploy(cfg, deployer);
        configure(d, cfg);
        handOver(d, deployer);
        vm.stopBroadcast();
        assertHandedOver(d, deployer);
        if (vm.envOr("WRITE_DEPLOYMENT", true)) _write(d, cfg);
    }

    function configFromEnv() public view returns (Config memory cfg) {
        cfg.genesisTime = uint64(vm.envUint("GENESIS_TIME"));
        cfg.opsSafe = vm.envAddress("OPS_SAFE");
        cfg.guardianSafe = vm.envAddress("GUARDIAN_SAFE");
        cfg.keeper = vm.envAddress("KEEPER");
        cfg.devRecipient = vm.envAddress("DEV_RECIPIENT");
        cfg.treasuryRecipient = vm.envAddress("TREASURY_RECIPIENT");
        cfg.ethUsdFeed = vm.envOr("ETH_USD_FEED", address(0));
        cfg.poolManager = vm.envOr("POOL_MANAGER", POOL_MANAGER);
    }

    // ------------------------------------------------------------------ 1. deploy

    function deploy(Config memory cfg, address deployer) public returns (Deployment memory d) {
        _checkGenesis(cfg.genesisTime);
        d.router = new RevenueRouter(deployer);
        d.ethUsdFeed = cfg.ethUsdFeed;
        if (d.ethUsdFeed == address(0)) {
            if (block.chainid == MAINNET_CHAIN_ID) revert ManualFeedOnMainnet();
            d.ethUsdFeed = address(new ManualEthUsdFeed(cfg.keeper, 2500e8));
        }

        d.coreImplementation = address(new MiningCore());
        address predictedProxy = vm.computeCreateAddress(deployer, vm.getNonce(deployer) + 1);
        d.token = new MohnToken(predictedProxy);
        d.core = MiningCore(
            address(
                new ERC1967Proxy(
                    d.coreImplementation,
                    abi.encodeCall(
                        MiningCore.initialize,
                        (
                            deployer,
                            address(d.token),
                            address(d.router),
                            d.ethUsdFeed,
                            address(0), // no sequencer uptime feed on this chain
                            cfg.genesisTime,
                            FUEL_PRICE_USD,
                            cfg.devRecipient,
                            cfg.treasuryRecipient
                        )
                    )
                )
            )
        );
        if (address(d.core) != predictedProxy || d.token.minter() != address(d.core)) {
            revert MinterMismatch(predictedProxy, address(d.core));
        }

        bytes memory lmInit = abi.encodePacked(
            type(LiquidityManager).creationCode,
            abi.encode(
                deployer, address(d.core), cfg.poolManager, address(d.token), address(d.router)
            )
        );
        d.liquidityManager = LiquidityManager(payable(_create2Hooked(lmInit)));
        d.buybackBurner = new BuybackBurner(
            deployer,
            cfg.poolManager,
            address(d.token),
            address(d.router),
            address(d.liquidityManager)
        );

        address[] memory proposers = new address[](1);
        proposers[0] = cfg.opsSafe;
        address[] memory executors = new address[](1); // address(0): anyone may execute
        d.paramsTimelock = new TimelockController(PARAMS_DELAY, proposers, executors, address(0));
        d.upgradeTimelock = new TimelockController(UPGRADE_DELAY, proposers, executors, address(0));
    }

    /// @dev Mines a CREATE2 salt whose address carries exactly the beforeInitialize hook flag.
    function _create2Hooked(bytes memory initCode) internal returns (address addr) {
        bytes32 codeHash = keccak256(initCode);
        for (uint256 i = 0; i < 400_000; ++i) {
            addr = vm.computeCreate2Address(bytes32(i), codeHash, CREATE2_DEPLOYER);
            if (uint160(addr) & Hooks.ALL_HOOK_MASK != MohnPool.HOOK_FLAGS) continue;
            (bool ok, bytes memory ret) =
                CREATE2_DEPLOYER.call(abi.encodePacked(bytes32(i), initCode));
            require(ok && address(bytes20(ret)) == addr, "CREATE2 failed");
            return addr;
        }
        revert HookAddressNotFound();
    }

    /// @dev Market Open records the genesis miner accrual at genesis + 72 h; if that moment has
    ///      passed with nobody mining, openMarket can never succeed. Mainnet also needs the 24 h
    ///      pre-fill ahead. ALLOW_CLOSED_GENESIS=true skips the check for testnet playgrounds only.
    function _checkGenesis(uint64 genesisTime) internal view {
        bool mainnet = block.chainid == MAINNET_CHAIN_ID;
        if (!mainnet && vm.envOr("ALLOW_CLOSED_GENESIS", false)) return;
        uint256 earliest = mainnet
            ? block.timestamp + 24 hours
            : (block.timestamp > 71 hours ? block.timestamp - 71 hours : 0);
        if (genesisTime < earliest) revert GenesisTooLate(genesisTime);
    }

    // ------------------------------------------------------------------ 2. configure

    /// @dev The deployer still holds every admin role here; handOver moves them.
    function configure(Deployment memory d, Config memory cfg) public {
        RevenueRouter r = d.router;
        r.grantRole(r.DEPOSITOR_ROLE(), address(d.core));
        r.grantRole(r.FEE_DEPOSITOR_ROLE(), address(d.liquidityManager));
        r.grantRole(r.FEE_DEPOSITOR_ROLE(), address(d.buybackBurner));
        r.grantRole(r.POL_ROLE(), address(d.liquidityManager));
        r.grantRole(r.BUYBACK_ROLE(), address(d.buybackBurner));
        r.grantRole(r.OPS_ROLE(), cfg.opsSafe);
        r.lockBucketRoles(); // nobody, not even the Timelock, can rewire the buckets afterwards
        d.liquidityManager.grantRole(d.liquidityManager.KEEPER_ROLE(), cfg.keeper);
        d.buybackBurner.grantRole(d.buybackBurner.KEEPER_ROLE(), cfg.keeper);
        d.core.grantRole(d.core.GUARDIAN_ROLE(), cfg.guardianSafe);
        d.core.wireLiquidityManager(address(d.liquidityManager));
    }

    // ------------------------------------------------------------------ 3. hand over

    function handOver(Deployment memory d, address deployer) public {
        address params = address(d.paramsTimelock);
        MiningCore c = d.core;
        c.grantRole(c.DEFAULT_ADMIN_ROLE(), params);
        c.grantRole(c.CATALOG_ROLE(), params);
        c.grantRole(c.UPGRADER_ROLE(), address(d.upgradeTimelock));
        c.renounceRole(c.CATALOG_ROLE(), deployer);
        c.renounceRole(c.UPGRADER_ROLE(), deployer);
        c.renounceRole(c.DEFAULT_ADMIN_ROLE(), deployer);
        _handOverAdmin(IAccessControl(address(d.router)), params, deployer);
        _handOverAdmin(IAccessControl(address(d.liquidityManager)), params, deployer);
        _handOverAdmin(IAccessControl(address(d.buybackBurner)), params, deployer);
    }

    function _handOverAdmin(IAccessControl target, address admin, address deployer) internal {
        target.grantRole(bytes32(0), admin);
        target.renounceRole(bytes32(0), deployer);
    }

    /// @notice Fails unless the deployer holds no role on any contract and the Timelocks hold theirs.
    function assertHandedOver(Deployment memory d, address deployer) public view {
        MiningCore c = d.core;
        bytes32[5] memory coreRoles = [
            c.DEFAULT_ADMIN_ROLE(),
            c.CATALOG_ROLE(),
            c.UPGRADER_ROLE(),
            c.GUARDIAN_ROLE(),
            keccak256("KEEPER_ROLE")
        ];
        address[4] memory targets =
            [address(c), address(d.router), address(d.liquidityManager), address(d.buybackBurner)];
        bytes32[6] memory routerRoles = [
            bytes32(0),
            d.router.DEPOSITOR_ROLE(),
            d.router.FEE_DEPOSITOR_ROLE(),
            d.router.POL_ROLE(),
            d.router.BUYBACK_ROLE(),
            d.router.OPS_ROLE()
        ];
        for (uint256 t = 0; t < targets.length; ++t) {
            for (uint256 i = 0; i < coreRoles.length; ++i) {
                _requireNoRole(targets[t], coreRoles[i], deployer);
            }
            for (uint256 i = 0; i < routerRoles.length; ++i) {
                _requireNoRole(targets[t], routerRoles[i], deployer);
            }
        }
        require(c.hasRole(c.DEFAULT_ADMIN_ROLE(), address(d.paramsTimelock)), "params admin");
        require(c.hasRole(c.UPGRADER_ROLE(), address(d.upgradeTimelock)), "upgrader");
        // Only upgraders manage upgraders: the 96 h Timelock cannot skip the 7-day one.
        require(c.getRoleAdmin(c.UPGRADER_ROLE()) == c.UPGRADER_ROLE(), "upgrader admin");
        RevenueRouter r = d.router;
        require(r.bucketRolesLocked(), "buckets locked");
        require(r.getRoleAdmin(r.POL_ROLE()) == r.LOCKED_ROLE(), "POL locked");
        require(r.getRoleAdmin(r.BUYBACK_ROLE()) == r.LOCKED_ROLE(), "buyback locked");
        require(d.paramsTimelock.getMinDelay() == PARAMS_DELAY, "params delay");
        require(d.upgradeTimelock.getMinDelay() == UPGRADE_DELAY, "upgrade delay");
        // The Timelocks administer themselves: nobody can shorten a delay without waiting it out.
        require(
            !d.paramsTimelock.hasRole(bytes32(0), deployer)
                && !d.upgradeTimelock.hasRole(bytes32(0), deployer),
            "timelock admin"
        );
    }

    function _requireNoRole(address target, bytes32 role, address account) internal view {
        if (IAccessControl(target).hasRole(role, account)) {
            revert DeployerStillHasRole(target, role);
        }
    }

    // ------------------------------------------------------------------ output

    function _write(Deployment memory d, Config memory cfg) internal {
        string memory k = "deployment";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeUint(k, "genesisTime", cfg.genesisTime);
        // First block the indexer scans. The simulated block precedes every broadcast transaction
        // (and on Arbitrum chains it is the L2 block number, unlike the NUMBER opcode).
        vm.serializeUint(k, "startBlock", vm.getBlockNumber());
        vm.serializeAddress(k, "MohnToken", address(d.token));
        vm.serializeAddress(k, "MiningCore", address(d.core));
        vm.serializeAddress(k, "MiningCoreImplementation", d.coreImplementation);
        vm.serializeAddress(k, "RevenueRouter", address(d.router));
        vm.serializeAddress(k, "LiquidityManager", address(d.liquidityManager));
        vm.serializeAddress(k, "BuybackBurner", address(d.buybackBurner));
        vm.serializeAddress(k, "ParamsTimelock", address(d.paramsTimelock));
        vm.serializeAddress(k, "UpgradeTimelock", address(d.upgradeTimelock));
        vm.serializeAddress(k, "EthUsdFeed", d.ethUsdFeed);
        vm.serializeAddress(k, "OpsSafe", cfg.opsSafe);
        vm.serializeAddress(k, "GuardianSafe", cfg.guardianSafe);
        string memory json = vm.serializeAddress(k, "Keeper", cfg.keeper);
        string memory dir = string.concat(vm.projectRoot(), "/../deployments/");
        // DEPLOYMENT_NAME separates extra deployments on one chain (e.g. a testnet playground).
        string memory name = vm.envOr("DEPLOYMENT_NAME", string(""));
        string memory file = bytes(name).length == 0
            ? vm.toString(block.chainid)
            : string.concat(vm.toString(block.chainid), "-", name);
        vm.writeJson(json, string.concat(dir, file, ".json"));
    }
}
