// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";

import {MiningCore} from "../../src/MiningCore.sol";
import {MohnToken} from "../../src/MohnToken.sol";
import {RevenueRouter} from "../../src/RevenueRouter.sol";
import {EmissionMath} from "../../src/lib/EmissionMath.sol";
import {MockAggregator} from "../../test/mocks/MockAggregator.sol";

/// @notice Audit (ACCOUNTANT) handler. Covers the entry points the repository's handlers skip:
///         wallet payments, holder burns and transfers, dev/treasury withdrawals together with
///         player flows, every setParam (incl. VRGDA re-anchoring), router setSplit, Guardian
///         pause / Timelock extendPause / unpause, oracle price moves and new machine
///         generations. Keeps ghosts for the proposed invariants (ACCOUNTANT.md S5).
/// @dev bound() logs through the console, which would consume a pending prank: bound first.
contract AccountantHandler is Test {
    bytes32 internal constant HOUR_CLOSED =
        keccak256("HourClosed(uint64,uint256,uint256,uint256,uint256)");

    MiningCore public immutable core;
    MohnToken public immutable mohn;
    RevenueRouter public immutable router;
    MockAggregator public immutable feed;
    address public constant DEV = address(0xDE7);
    address public constant TREASURY = address(0x7EA5);
    address[] public actors;
    int256 public ethUsd = 2500e8;

    // ETH ghosts
    uint256 public ghostFuelEth;
    uint256 public ghostBuybackIn;
    uint256 public ghostPolIn;
    // MOHN ghosts
    uint256 public ghostUnitsSold;
    uint256 public ghostDevWithdrawn;
    uint256 public ghostTreasuryWithdrawn;
    uint256 public ghostExternalBurned;
    uint256 public ghostRecycled;
    uint256[] internal mintBuckets;
    uint256[] internal mintAmounts;
    // hour tracking (E5 / E6 from HourClosed events)
    uint256 internal lastBoundaryReserve;
    uint256 internal lastBoundaryEmission;
    uint256 internal recycledSinceBoundary;
    uint256 internal lastAcc;
    // pause model
    uint256 public ghostPausedUntil;
    uint256 internal lastGuardianPause;
    // genesis snapshot freeze
    bool internal accrualSeen;
    uint256 internal accrualAtOpen;
    bool internal fuelUsdSeen;
    uint256 internal fuelUsdAtOpen;
    // catalog
    MiningCore.MachineType[] internal catalog;

    // violations
    uint256 public s1Violations;
    uint256 public e5Violations;
    uint256 public e6Violations;
    uint256 public accMonotoneViolations;
    uint256 public reanchorJumps;
    uint256 public scrapCreditViolations;
    uint256 public frozenViolations;
    uint256 public guardianCooldownViolations;

    // coverage (non-vacuity)
    mapping(bytes32 action => uint256 successes) public hits;

    constructor(MiningCore core_, MohnToken mohn_, RevenueRouter router_, MockAggregator feed_) {
        core = core_;
        mohn = mohn_;
        router = router_;
        feed = feed_;
        for (uint256 i = 0; i < 4; ++i) {
            address a = makeAddr(string.concat("acct", vm.toString(i)));
            actors.push(a);
            vm.deal(a, 1_000 ether);
            vm.prank(a);
            mohn.approve(address(core_), type(uint256).max);
        }
        lastBoundaryReserve = EmissionMath.CAP;
        lastBoundaryEmission = EmissionMath.hourlyEmission(EmissionMath.CAP);
        for (uint256 i = 0; i < core_.machineTypeCount(); ++i) {
            catalog.push(core_.machineType(i));
        }
    }

    // ------------------------------------------------------------------ views for invariants

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function catalogLength() external view returns (uint256) {
        return catalog.length;
    }

    function catalogAt(uint256 i) external view returns (MiningCore.MachineType memory) {
        return catalog[i];
    }

    /// MOHN minted in the current 13-bucket window, by the ghost record.
    function ghostWindowMinted() external view returns (uint256 used) {
        uint256 cur = block.timestamp / 5 minutes;
        for (uint256 i = mintBuckets.length; i > 0; --i) {
            uint256 b = mintBuckets[i - 1];
            if (b + 12 < cur) break;
            used += mintAmounts[i - 1];
        }
    }

    // ------------------------------------------------------------------ helpers

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    /// Catches up and checks every HourClosed boundary: E6 (E_h = floor(R_h * delta)), E5 (what
    /// left the reserve in the hour <= that hour's E_h, net of recycling) and acc monotone.
    function _catchUp() internal {
        vm.recordLogs();
        while (!core.poke()) {}
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i = 0; i < logs.length; ++i) {
            if (logs[i].emitter != address(core) || logs[i].topics[0] != HOUR_CLOSED) continue;
            (uint256 acc,, uint256 res, uint256 emission) =
                abi.decode(logs[i].data, (uint256, uint256, uint256, uint256));
            uint256 before = lastBoundaryReserve + recycledSinceBoundary;
            if (res > before || before - res > lastBoundaryEmission) ++e5Violations;
            if (emission != EmissionMath.hourlyEmission(res)) ++e6Violations;
            if (acc < lastAcc) ++accMonotoneViolations;
            lastBoundaryReserve = res;
            lastBoundaryEmission = emission;
            recycledSinceBoundary = 0;
            lastAcc = acc;
        }
        _checkFrozen();
    }

    function _checkFrozen() internal {
        if (core.currentHour() >= (core.marketOpenTime()) / 1 hours) {
            uint256 a = core.genesisMinerAccrual();
            if (!accrualSeen) {
                accrualSeen = true;
                accrualAtOpen = a;
            } else if (a != accrualAtOpen) {
                ++frozenViolations;
            }
        }
        if (block.timestamp >= core.marketOpenTime()) {
            uint256 f = core.genesisFuelUsd();
            if (!fuelUsdSeen) {
                fuelUsdSeen = true;
                fuelUsdAtOpen = f;
            } else if (f != fuelUsdAtOpen) {
                ++frozenViolations;
            }
        }
    }

    function _recordRecycle(uint256 reserveBefore) internal {
        uint256 r = core.reserve();
        if (r > reserveBefore) {
            ghostRecycled += r - reserveBefore;
            recycledSinceBoundary += r - reserveBefore;
        }
    }

    function _recordMint(uint256 supplyBefore) internal {
        uint256 supply = mohn.totalSupply();
        if (supply <= supplyBefore) return;
        mintBuckets.push(block.timestamp / 5 minutes);
        mintAmounts.push(supply - supplyBefore);
    }

    /// Runs a capex action and checks S1 over unrefined AND wallet MOHN (the repository's S1
    /// check only sees unrefined credit because its handlers never pay from the wallet).
    function _spend(address who, bytes memory action, bytes32 tag) internal returns (bool ok) {
        uint256 spentBefore = core.unrefinedSpent();
        uint256 burnedBefore = core.burnedForever();
        uint256 reserveBefore = core.reserve();
        uint256 supplyBefore = mohn.totalSupply();
        vm.prank(who);
        (ok,) = address(core).call(action);
        if (!ok) return false;
        ++hits[tag];
        uint256 spent = (core.unrefinedSpent() - spentBefore) + (supplyBefore - mohn.totalSupply());
        uint256 toReserve = (spent * 2000) / 10_000;
        if (
            core.burnedForever() - burnedBefore != spent - toReserve
                || core.reserve() - reserveBefore != toReserve
        ) ++s1Violations;
        _recordRecycle(reserveBefore);
        if (supplyBefore != mohn.totalSupply()) ++hits["walletPay"];
    }

    // ------------------------------------------------------------------ players

    function buyFuel(uint256 actorSeed, uint256 weiAmount, uint256 refSeed) external {
        feed.set(ethUsd, block.timestamp, block.timestamp);
        _catchUp();
        uint256 value = bound(weiAmount, 1e12, 0.05 ether);
        address who = _actor(actorSeed);
        uint256 bb = router.buybackBps();
        uint256 pb = router.polBps();
        vm.prank(who);
        try core.buyFuel{value: value}(_actor(refSeed)) {
            ghostFuelEth += value;
            ghostBuybackIn += (value * bb) / 10_000;
            ghostPolIn += (value * pb) / 10_000;
            ++hits["buyFuel"];
        } catch {}
    }

    function buyMachines(uint256 actorSeed, uint256 typeSeed, uint32 qty, bool wallet) external {
        _catchUp();
        uint256 types = core.machineTypeCount();
        uint256 typeId = 1 + (typeSeed % (types - 1));
        qty = uint32(bound(qty, 1, 4));
        uint256 units = uint256(core.machineType(typeId).dp) * qty;
        bool ok = _spend(
            _actor(actorSeed),
            abi.encodeCall(MiningCore.buyMachines, (typeId, qty, type(uint256).max, wallet)),
            "buyMachines"
        );
        if (ok) ghostUnitsSold += units;
    }

    function upgradeSite(uint256 actorSeed, bool wallet) external {
        _catchUp();
        _spend(
            _actor(actorSeed),
            abi.encodeCall(MiningCore.upgradeSite, (type(uint256).max, wallet)),
            "upgradeSite"
        );
    }

    function setActiveRigs(uint256 actorSeed, uint256 typeSeed, uint32 active) external {
        _catchUp();
        address who = _actor(actorSeed);
        uint256 typeId = typeSeed % core.machineTypeCount();
        active = uint32(bound(active, 0, core.rigsOf(who, typeId).owned));
        vm.prank(who);
        try core.setActiveRigs(typeId, active) {
            ++hits["setActiveRigs"];
        } catch {}
    }

    /// Also checks the scrap credit formula: 20 % of the scrapped DP at the current unit price,
    /// zero for the Pilot Rig.
    function scrapMachines(uint256 actorSeed, uint256 typeSeed, uint32 qty) external {
        _catchUp();
        address who = _actor(actorSeed);
        uint256 typeId = typeSeed % core.machineTypeCount();
        uint32 owned = core.rigsOf(who, typeId).owned;
        if (owned == 0) return;
        qty = uint32(bound(qty, 1, owned));
        uint256 creditBefore = core.siteOf(who).scrapCredit;
        uint256 price = core.unitPrice();
        uint256 expected =
            typeId == 0 ? 0 : (uint256(core.machineType(typeId).dp) * qty * price * 2000) / 10_000;
        vm.prank(who);
        try core.scrapMachines(typeId, qty) {
            ++hits["scrap"];
            if (core.siteOf(who).scrapCredit - creditBefore != expected) ++scrapCreditViolations;
        } catch {}
    }

    function refine(uint256 actorSeed, uint256 amount, bool fast) external {
        _catchUp();
        address who = _actor(actorSeed);
        uint256 pending = core.pendingOf(who);
        if (pending == 0) return;
        uint256 cap = pending < 100_000e18 ? pending : 100_000e18;
        // Half of the fast refines take everything, so later capex must use the wallet.
        amount = fast && amount % 2 == 0 ? cap : bound(amount, 1, cap);
        uint256 supplyBefore = mohn.totalSupply();
        uint256 reserveBefore = core.reserve();
        vm.prank(who);
        try core.refine(amount, fast) {
            ++hits[fast ? bytes32("refineFast") : bytes32("refineQueued")];
        } catch {}
        _recordMint(supplyBefore);
        _recordRecycle(reserveBefore);
    }

    function finalizeRefine(uint256 ownerSeed, uint256 idSeed) external {
        _catchUp();
        address owner = ownerSeed % 6 == 4 ? DEV : ownerSeed % 6 == 5 ? TREASURY : _actor(ownerSeed);
        uint256 count = core.refineRequestCount(owner);
        if (count == 0) return;
        uint256 supplyBefore = mohn.totalSupply();
        try core.finalizeRefine(owner, idSeed % count) {
            ++hits["finalize"];
        } catch {}
        _recordMint(supplyBefore);
    }

    function withdrawShare(bool dev, uint256 amount) external {
        _catchUp();
        uint256 avail = dev ? core.devPending() : core.treasuryPending() - core.referralReserve();
        if (avail == 0) return;
        amount = bound(amount, 1, avail < 100_000e18 ? avail : 100_000e18);
        vm.prank(dev ? DEV : TREASURY);
        if (dev) {
            try core.withdrawDevShare(amount) {
                ghostDevWithdrawn += amount;
                ++hits["withdrawDev"];
            } catch {}
        } else {
            try core.withdrawTreasuryShare(amount) {
                ghostTreasuryWithdrawn += amount;
                ++hits["withdrawTreasury"];
            } catch {}
        }
    }

    /// A holder burns its own MOHN (ERC20Burnable): outside every MiningCore counter.
    function burnTokens(uint256 actorSeed, uint256 amount) external {
        address who = _actor(actorSeed);
        uint256 bal = mohn.balanceOf(who);
        if (bal == 0) return;
        amount = bound(amount, 1, bal);
        vm.prank(who);
        mohn.burn(amount);
        ghostExternalBurned += amount;
        ++hits["holderBurn"];
    }

    function transferTokens(uint256 fromSeed, uint256 toSeed, uint256 amount) external {
        address from = _actor(fromSeed);
        uint256 bal = mohn.balanceOf(from);
        if (bal == 0) return;
        amount = bound(amount, 1, bal);
        vm.prank(from);
        assertTrue(mohn.transfer(_actor(toSeed), amount));
        ++hits["transfer"];
    }

    function poke() external {
        _catchUp();
    }

    function warp(uint32 dt) external {
        vm.warp(block.timestamp + bound(dt, 1, 2 days));
    }

    function setEthUsd(uint256 seed) external {
        ethUsd = int256(bound(seed, 1000e8, 5000e8));
    }

    // ------------------------------------------------------------------ governance

    /// Timelock parameter change; VRGDA r / k changes must not move the price (re-anchoring).
    function setParam(uint8 paramSeed, uint256 value) external {
        MiningCore.Param p = MiningCore.Param(paramSeed % 8);
        (uint256 min, uint256 max,,) = core.paramBounds(p);
        value = bound(value, min, max);
        uint256 before = core.unitPrice();
        try core.setParam(p, value) {
            ++hits["setParam"];
            if (
                (p == MiningCore.Param.VrgdaR || p == MiningCore.Param.VrgdaK)
                    && core.unitPrice() != before
            ) ++reanchorJumps;
        } catch {}
    }

    function setSplit(uint16 bb, uint16 pb) external {
        bb = uint16(bound(bb, 3000, 6000));
        pb = uint16(bound(pb, 2000, 5000));
        try router.setSplit(bb, pb) {
            ++hits["setSplit"];
        } catch {}
    }

    function guardianPause() external {
        uint256 nowTs = block.timestamp;
        try core.pause() {
            if (lastGuardianPause != 0 && nowTs < lastGuardianPause + 7 days) {
                ++guardianCooldownViolations;
            }
            lastGuardianPause = nowTs;
            if (nowTs + 72 hours > ghostPausedUntil) ghostPausedUntil = nowTs + 72 hours;
            ++hits["pause"];
        } catch {}
    }

    function extendPause(uint64 until) external {
        until = uint64(bound(until, 0, block.timestamp + 31 days));
        try core.extendPause(until) {
            ghostPausedUntil = until;
            ++hits["extendPause"];
        } catch {}
    }

    function unpause() external {
        core.unpause();
        ghostPausedUntil = 0;
    }

    /// A gen-2 generation (rarely succeeds: needs 2,000 m of World Depth and 45 days).
    function addGeneration(uint32 dp) external {
        MiningCore.MachineType[] memory types = new MiningCore.MachineType[](1);
        uint32 d = uint32(bound(dp, 50, 5000));
        // efficiency d / burn <= 90 * 1.15 = 103.5 DP per L/h; burn = d / 100 L/h -> 100.
        types[0] = MiningCore.MachineType(d, 500, 1, 0, uint128(uint256(d) * 1e16));
        try core.addMachineGeneration(types) {
            catalog.push(core.machineType(core.machineTypeCount() - 1));
            ++hits["addGeneration"];
        } catch {}
    }
}
