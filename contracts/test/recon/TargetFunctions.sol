// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {MiningCore} from "../../src/MiningCore.sol";
import {Properties} from "./Properties.sol";
import {Actor} from "./Setup.sol";

/// @title TargetFunctions
/// @notice The actions the fuzzers call. Inputs are clamped to useful ranges; reverts are
///         allowed (a rejected action must leave every property intact).
abstract contract TargetFunctions is Properties {
    function _actor(uint256 seed) internal view returns (Actor) {
        return actors[seed % actors.length];
    }

    function _clamp(uint256 x, uint256 lo, uint256 hi) internal pure returns (uint256) {
        return hi <= lo ? lo : lo + (x % (hi - lo + 1));
    }

    function _catchUp() internal {
        for (uint256 i = 0; i < 64 && !core.poke(); ++i) {}
    }

    function _recordMint(uint256 supplyBefore) internal {
        uint256 supply = mohn.totalSupply();
        if (supply <= supplyBefore) return;
        mintTimes.push(block.timestamp);
        mintAmounts.push(supply - supplyBefore);
        uint256 total = 0;
        for (uint256 i = mintTimes.length; i > 0; --i) {
            if (mintTimes[i - 1] + 60 minutes <= block.timestamp) break;
            total += mintAmounts[i - 1];
        }
        if (total > core.MINT_BREAKER_LIMIT()) ++b1Violations;
    }

    /// Runs `data` from an actor and checks S1 on the MOHN it spent.
    function _spend(Actor a, bytes memory data) internal {
        uint256 spentBefore = core.unrefinedSpent();
        uint256 burnedBefore = core.burnedForever();
        uint256 reserveBefore = core.reserve();
        if (!a.call(address(core), 0, data)) return;
        uint256 spent = core.unrefinedSpent() - spentBefore;
        uint256 toReserve = (spent * 2000) / 10_000;
        if (
            core.burnedForever() - burnedBefore != spent - toReserve
                || core.reserve() - reserveBefore != toReserve
        ) ++s1Violations;
    }

    // ------------------------------------------------------------------ players

    function buyFuel(uint256 actorSeed, uint256 weiAmount, uint256 refSeed) public {
        feed.set(2500e8, block.timestamp, block.timestamp);
        _catchUp();
        _actor(actorSeed)
            .call(
                address(core),
                _clamp(weiAmount, 1e12, 0.05 ether),
                abi.encodeCall(MiningCore.buyFuel, (address(_actor(refSeed))))
            );
    }

    function buyMachines(uint256 actorSeed, uint256 typeSeed, uint256 qty) public {
        _catchUp();
        _spend(
            _actor(actorSeed),
            abi.encodeCall(
                MiningCore.buyMachines,
                (1 + (typeSeed % 5), uint32(_clamp(qty, 1, 4)), type(uint256).max, false)
            )
        );
    }

    function upgradeSite(uint256 actorSeed) public {
        _catchUp();
        _spend(
            _actor(actorSeed), abi.encodeCall(MiningCore.upgradeSite, (type(uint256).max, false))
        );
    }

    function setActiveRigs(uint256 actorSeed, uint256 typeSeed, uint256 active) public {
        _catchUp();
        Actor a = _actor(actorSeed);
        uint256 typeId = typeSeed % 6;
        uint32 owned = core.rigsOf(address(a), typeId).owned;
        a.call(
            address(core),
            0,
            abi.encodeCall(MiningCore.setActiveRigs, (typeId, uint32(_clamp(active, 0, owned))))
        );
    }

    function scrapMachines(uint256 actorSeed, uint256 typeSeed, uint256 qty) public {
        _catchUp();
        Actor a = _actor(actorSeed);
        uint256 typeId = typeSeed % 6;
        uint32 owned = core.rigsOf(address(a), typeId).owned;
        if (owned == 0) return;
        a.call(
            address(core),
            0,
            abi.encodeCall(MiningCore.scrapMachines, (typeId, uint32(_clamp(qty, 1, owned))))
        );
    }

    function refine(uint256 actorSeed, uint256 amount, bool fast) public {
        _catchUp();
        Actor a = _actor(actorSeed);
        uint256 pending = core.pendingOf(address(a));
        if (pending == 0) return;
        uint256 supplyBefore = mohn.totalSupply();
        a.call(
            address(core), 0, abi.encodeCall(MiningCore.refine, (_clamp(amount, 1, pending), fast))
        );
        _recordMint(supplyBefore);
    }

    function finalizeRefine(uint256 actorSeed, uint256 idSeed) public {
        _catchUp();
        address owner = address(_actor(actorSeed));
        uint256 count = core.refineRequestCount(owner);
        if (count == 0) return;
        uint256 supplyBefore = mohn.totalSupply();
        try core.finalizeRefine(owner, idSeed % count) {} catch {}
        _recordMint(supplyBefore);
    }

    function warp(uint256 dt) public {
        hevm.warp(block.timestamp + _clamp(dt, 1, 2 days));
    }

    function poke() public {
        core.poke();
    }

    // ------------------------------------------------------------------ governance

    function setParam(uint256 paramSeed, uint256 value) public {
        MiningCore.Param p = MiningCore.Param(paramSeed % 8);
        (uint256 min, uint256 max,, uint64 period) = core.paramBounds(p);
        try core.setParam(p, _clamp(value, min, max)) {
            uint256 last = lastParamChange[uint256(p)];
            if (last != 0 && block.timestamp < last + period) ++rateViolations;
            lastParamChange[uint256(p)] = block.timestamp;
        } catch {}
    }

    function pause() public {
        try core.pause() {
            lastGuardianPauseGhost = block.timestamp;
        } catch {}
    }
}
