// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {MiningCore} from "../../src/MiningCore.sol";
import {MohnToken} from "../../src/MohnToken.sol";
import {RevenueRouter} from "../../src/RevenueRouter.sol";
import {EmissionMath} from "../../src/lib/EmissionMath.sol";
import {MockAggregator} from "../../test/mocks/MockAggregator.sol";

/// @notice Audit (ACCOUNTANT): deploys MiningCore behind its proxy with the real token and router,
///         exactly like test/invariant/MiningCoreEconomy.invariant.t.sol.
abstract contract AccountantBase is Test {
    uint64 internal constant GENESIS = 1_800_003_600 - (1_800_003_600 % 3600);
    address internal constant DEV = address(0xDE7);
    address internal constant TREASURY = address(0x7EA5);

    MiningCore internal core;
    MohnToken internal mohn;
    RevenueRouter internal router;
    MockAggregator internal feed;

    function _deploy() internal {
        vm.warp(GENESIS - 12 hours);
        feed = new MockAggregator(8, 2500e8);
        router = new RevenueRouter(address(this));
        address impl = deployCode("MiningCore.sol:MiningCore");
        address proxyAddr = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        mohn = new MohnToken(proxyAddr);
        core = MiningCore(
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
        );
        assertEq(address(core), proxyAddr, "minter == proxy");
        router.grantRole(router.DEPOSITOR_ROLE(), address(core));
    }

    function _catchUp() internal {
        while (!core.poke()) {}
    }

    function _fresh() internal {
        feed.set(2500e8, vm.getBlockTimestamp(), vm.getBlockTimestamp());
    }

    /// docs/04 S2 E2 exactly as the repository asserts it (no term for MOHN burned outside
    /// MiningCore).
    function _e2Sum() internal view returns (uint256) {
        return core.reserve() + core.minersDistributed() + core.referralPaid()
            - core.unrefinedSpent() - core.unrefinedRefined() + core.devPending()
            + core.treasuryPending() + core.burnedForever() + core.refineQueued()
            + mohn.totalSupply();
    }

    function _cap() internal pure returns (uint256) {
        return EmissionMath.CAP;
    }
}
