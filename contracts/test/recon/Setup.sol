// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {MarketOpenCheat} from "../utils/MarketOpenCheat.sol";
import {MiningCore} from "../../src/MiningCore.sol";
import {MohnToken} from "../../src/MohnToken.sol";
import {RevenueRouter} from "../../src/RevenueRouter.sol";
import {MockAggregator} from "../mocks/MockAggregator.sol";

/// @notice The cheatcodes shared by Foundry, Medusa and Echidna (hevm address).
interface IHevm {
    function warp(uint256) external;
    function deal(address, uint256) external;
}

/// @notice A player: forwards calls from the tester to MiningCore with its own address.
contract Actor {
    address internal immutable tester;

    constructor() payable {
        tester = msg.sender;
    }

    receive() external payable {}

    function call(address target, uint256 value, bytes calldata data) external returns (bool ok) {
        require(msg.sender == tester, "tester only");
        (ok,) = target.call{value: value}(data);
    }
}

/// @title Setup
/// @notice Deploys the system for the property fuzzers (Recon Chimera layout, without the library):
///         MiningCore behind its proxy, the token minted only by it, the real RevenueRouter and a
///         mock ETH/USD feed. The tester holds the admin and Guardian roles so parameter changes
///         and pauses are fuzzed too; four Actor contracts are the players.
abstract contract Setup {
    IHevm internal constant hevm = IHevm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);
    uint64 internal constant GENESIS = 1_800_003_600 - (1_800_003_600 % 3600);
    address internal constant DEV = address(0xDE7);
    address internal constant TREASURY = address(0x7EA5);

    MiningCore internal core;
    MohnToken internal mohn;
    RevenueRouter internal router;
    MockAggregator internal feed;
    Actor[] internal actors;
    MiningCore.MachineType[] internal catalogAtStart;
    uint256 internal createNonce = 1; // a contract's CREATE nonce starts at 1

    function _setup() internal {
        hevm.warp(GENESIS - 12 hours);
        feed = MockAggregator(_track(address(new MockAggregator(8, 2500e8))));
        router = RevenueRouter(payable(_track(address(new RevenueRouter(address(this))))));
        address impl = _track(address(new MiningCore()));
        // token is the next creation, the proxy the one after it
        address proxyAddr = _createAddress(createNonce + 1);
        mohn = MohnToken(_track(address(new MohnToken(proxyAddr))));
        core = MiningCore(
            _track(
                address(
                    new ERC1967Proxy(
                        impl,
                        abi.encodeCall(
                            MiningCore.initialize,
                            (
                                address(this),
                                address(mohn),
                                address(router),
                                address(feed),
                                address(0),
                                GENESIS,
                                0.1e18,
                                DEV,
                                TREASURY
                            )
                        )
                    )
                )
            )
        );
        require(address(core) == proxyAddr, "minter prediction");
        router.grantRole(router.DEPOSITOR_ROLE(), address(core));
        core.grantRole(core.GUARDIAN_ROLE(), address(this));
        // No pool in this harness; warp() marks the market open at its time (AI review AI-4).
        core.wireLiquidityManager(MarketOpenCheat.PLACEHOLDER_LM);
        for (uint256 i = 0; i < 4; ++i) {
            Actor a = Actor(payable(_track(address(new Actor()))));
            hevm.deal(address(a), 1000 ether);
            actors.push(a);
        }
        for (uint256 i = 0; i < core.machineTypeCount(); ++i) {
            catalogAtStart.push(core.machineType(i));
        }
    }

    function _track(address created) internal returns (address) {
        ++createNonce;
        return created;
    }

    /// @dev CREATE address of this contract for `nonce` (< 128): keccak(rlp([this, nonce])).
    function _createAddress(uint256 nonce) internal view returns (address) {
        return address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(bytes1(0xd6), bytes1(0x94), address(this), uint8(nonce))
                    )
                )
            )
        );
    }
}
