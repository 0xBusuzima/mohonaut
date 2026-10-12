// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {
    BeforeSwapDelta,
    BeforeSwapDeltaLibrary
} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";

import {PoolActor} from "./PoolActor.sol";
import {ILiquidityManager} from "./interfaces/ILiquidityManager.sol";
import {MohnPool} from "./lib/MohnPool.sol";
import {PriceAnchor} from "./lib/PriceAnchor.sol";

/// @title LiquidityManager
/// @notice Owns the protocol's full-range ETH/MOHN position (docs/02 S10-S11, docs/03 S3.7).
///         - openMarket: called once by MiningCore at Market Open; initializes the pool at the
///           formula price and adds the POL ETH plus the MOHN minted for it.
///         - addLiquidity: KEEPER, at most 1/7 of the POL bucket per day, only near the price
///           anchor; swaps half of the ETH for MOHN and adds both.
///         - collectFees: anyone; MOHN fees are burned, ETH fees go to the buyback bucket.
///         There is NO function that removes liquidity (invariant L1): the position is locked forever.
///         This contract is also the pool's hook: beforeInitialize (nobody else can initialize
///         the pool at their own price before Market Open) and beforeSwap, which keeps the price
///         anchor (lib/PriceAnchor.sol, docs/02 S10.1) that keeper swaps trade against.
// Not locked: ETH arrives only to be paid into the pool in the same transaction; rounding dust is
// spent by the next addLiquidity (its budget is the whole balance).
// aderyn-fp-next-line(contract-locks-ether)
contract LiquidityManager is ILiquidityManager, PoolActor, AccessControl, ReentrancyGuardTransient {
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    /// @notice addLiquidity may use at most 1/7 of the POL bucket per UTC day (measured at the
    ///         day's first addition). The bucket grows only with fuel revenue, so just-in-time
    ///         liquidity cannot raise this cap (v1.1, AI review AI-2/AI-3).
    uint256 public constant ADD_DAILY_BPS = 1429;

    address public immutable core;
    bool public opened;
    uint64 public addDay;
    uint256 public addedInDay;
    uint256 public addBudget;
    /// @dev Time-weighted average tick (lib/PriceAnchor.sol), updated before every swap.
    PriceAnchor.State internal anchor;
    uint256 public mohnFeesBurned;
    uint256 public ethFeesToBuyback;

    enum Action {
        Open,
        Add,
        Collect
    }

    event MarketOpened(uint160 sqrtPriceX96, uint256 ethIn, uint256 mohnIn, uint128 liquidity);
    event LiquidityAdded(uint256 ethIn, uint256 mohnBought, uint128 liquidity);
    event FeesCollected(uint256 ethToBuyback, uint256 mohnBurned);

    error NotCore();
    error AlreadyOpen();
    error BadHookAddress();
    error NotSelf();
    error ZeroLiquidity();
    error ZeroValue();
    error DailyCapExceeded(uint256 remaining);
    error SlippageExceeded(uint256 mohnOut);

    constructor(address admin, address core_, address poolManager_, address mohn_, address router_)
        PoolActor(poolManager_, mohn_, router_)
    {
        if (admin == address(0) || core_ == address(0)) revert ZeroAddress();
        if (uint160(address(this)) & Hooks.ALL_HOOK_MASK != MohnPool.HOOK_FLAGS) {
            revert BadHookAddress();
        }
        core = core_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ------------------------------------------------------------------ hook

    /// @notice Only this contract may initialize the pool (Uniswap v4 hook, beforeInitialize).
    ///         The PoolManager skips a hook's own calls, so this runs only for others: it reverts.
    function beforeInitialize(address sender, PoolKey calldata, uint160)
        external
        view
        onlyPoolManager
        returns (bytes4)
    {
        if (sender != address(this)) revert NotSelf();
        return IHooks.beforeInitialize.selector;
    }

    /// @notice Before every swap by others: folds the tick that held since the last swap into
    ///         the anchor. This contract's own swaps skip the hook, so it updates the anchor itself.
    function beforeSwap(address, PoolKey calldata, IPoolManager.SwapParams calldata, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        PriceAnchor.update(anchor, _tick(), block.timestamp);
        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    /// @notice The price anchor as of now (time-weighted average tick).
    function anchorTick() public view returns (int24) {
        return PriceAnchor.toTick(PriceAnchor.current(anchor, _tick(), block.timestamp));
    }

    // ------------------------------------------------------------------ actions

    /// @notice Market Open: pulls `polEth` from the router, initializes the pool at `sqrtPriceX96`
    ///         and adds everything as full-range liquidity. MiningCore minted the MOHN beforehand.
    function openMarket(uint160 sqrtPriceX96, uint256 polEth) external nonReentrant {
        if (msg.sender != core) revert NotCore();
        if (opened) revert AlreadyOpen();
        opened = true;
        // The price anchor starts at the opening price (the hook is not called for our own calls).
        PriceAnchor.start(anchor, TickMath.getTickAtSqrtPrice(sqrtPriceX96), block.timestamp);
        router.pullPol(polEth);
        // The initial tick and the (empty) unlock result are not needed.
        // forge-lint: disable-start(unused-return)
        // slither-disable-start unused-return
        poolManager.initialize(_key(), sqrtPriceX96);
        // slither-disable-end unused-return
        // forge-lint: disable-end(unused-return)
        // forge-lint: disable-start(unused-return)
        // slither-disable-start unused-return
        poolManager.unlock(abi.encode(Action.Open, uint256(0), uint256(0), uint160(0)));
        // slither-disable-end unused-return
        // forge-lint: disable-end(unused-return)
    }

    /// @notice Adds `ethIn` from the POL bucket: half is swapped for MOHN (at least `minMohnOut`),
    ///         then both sides go into the full-range position. Leftover dust stays here for the
    ///         next addition.
    function addLiquidity(uint256 ethIn, uint256 minMohnOut)
        external
        nonReentrant
        onlyRole(KEEPER_ROLE)
    {
        if (ethIn < 2) revert ZeroValue();
        int24 tick = _tick();
        // Our own swap below skips the hook: fold the price that held until now ourselves.
        PriceAnchor.update(anchor, tick, block.timestamp);
        int24 anchorNow = PriceAnchor.toTick(anchor.emaWad);
        // Liquidity goes in near the anchor only, and its swap may not move past it (S10.1).
        PriceAnchor.requireNear(tick, anchorNow);
        uint160 limit = PriceAnchor.buyLimit(tick, anchorNow);
        _useDailyCap(ethIn);
        router.pullPol(ethIn);
        // aderyn-fp-next-line(reentrancy-state-change)
        bytes memory result =
            poolManager.unlock(abi.encode(Action.Add, ethIn / 2, minMohnOut, limit));
        (uint256 ethFee, uint256 mohnFee) = abi.decode(result, (uint256, uint256));
        _routeFees(ethFee, mohnFee); // fees accrued before this addition are not reinvested
    }

    /// @notice Collects the position's fees: MOHN is burned, ETH goes to the buyback bucket.
    function collectFees() external nonReentrant {
        // The PoolManager is trusted and this function is nonReentrant; the counters below record
        // the result of the call.
        // aderyn-fp-next-line(reentrancy-state-change)
        bytes memory result =
            poolManager.unlock(abi.encode(Action.Collect, uint256(0), uint256(0), uint160(0)));
        (uint256 ethFee, uint256 mohnFee) = abi.decode(result, (uint256, uint256));
        _routeFees(ethFee, mohnFee);
    }

    /// @dev MOHN fees are burned, ETH fees go to the router's buyback bucket.
    function _routeFees(uint256 ethFee, uint256 mohnFee) private {
        mohnFeesBurned += mohnFee;
        ethFeesToBuyback += ethFee;
        // The only external calls are to the trusted router and Uniswap PoolManager, under
        // nonReentrant; the event needs their result.
        // forge-lint: disable-next-line(reentrancy-events)
        emit FeesCollected(ethFee, mohnFee);
        if (mohnFee != 0) ERC20Burnable(address(mohn)).burn(mohnFee);
        if (ethFee != 0) router.depositBuyback{value: ethFee}();
    }

    /// @notice Uniswap v4 unlock callback: runs the requested action and settles all deltas.
    function unlockCallback(bytes calldata data) external onlyPoolManager returns (bytes memory) {
        (Action action, uint256 swapEth, uint256 minMohnOut, uint160 limit) =
            abi.decode(data, (Action, uint256, uint256, uint160));
        if (action == Action.Collect) {
            // A zero liquidity change returns exactly the accrued fees as the caller delta.
            // forge-lint: disable-start(unused-return)
            // slither-disable-start unused-return
            (BalanceDelta accrued,) = poolManager.modifyLiquidity(_key(), _params(0), "");
            // slither-disable-end unused-return
            // forge-lint: disable-end(unused-return)
            (uint256 ethFee, uint256 mohnFee) = _settle(accrued);
            return abi.encode(ethFee, mohnFee);
        }
        BalanceDelta total = BalanceDeltaLibrary.ZERO_DELTA;
        uint256 mohnBought = 0;
        uint256 ethBudget = address(this).balance;
        if (action == Action.Add) {
            total = poolManager.swap(
                _key(),
                IPoolManager.SwapParams({
                    zeroForOne: true,
                    amountSpecified: -SafeCast.toInt256(swapEth),
                    sqrtPriceLimitX96: limit
                }),
                ""
            );
            mohnBought = SafeCast.toUint256(int256(total.amount1()));
            if (mohnBought < minMohnOut) revert SlippageExceeded(mohnBought);
            // At the anchor limit the swap fills partly; unspent ETH stays for the next addition.
            ethBudget -= SafeCast.toUint256(-int256(total.amount0()));
        }
        uint128 liquidity = MohnPool.liquidityFor(
            _sqrtPrice(), ethBudget, mohn.balanceOf(address(this)) + mohnBought
        );
        if (liquidity < 1) revert ZeroLiquidity();
        // The caller delta includes the fees accrued so far; they are netted against what we owe,
        // stay in this contract's balance (outside the liquidity budget) and are routed afterwards.
        (BalanceDelta added, BalanceDelta fees) =
            poolManager.modifyLiquidity(_key(), _params(SafeCast.toInt256(liquidity)), "");
        _settle(total + added);
        // Calls above go only to the Uniswap PoolManager that invoked this callback.
        // forge-lint: disable-start(reentrancy-events)
        if (action == Action.Open) {
            emit MarketOpened(
                _sqrtPrice(),
                SafeCast.toUint256(-int256(added.amount0())),
                SafeCast.toUint256(-int256(added.amount1())),
                liquidity
            );
        } else {
            emit LiquidityAdded(swapEth * 2, mohnBought, liquidity);
        }
        // forge-lint: disable-end(reentrancy-events)
        return abi.encode(
            SafeCast.toUint256(int256(fees.amount0())), SafeCast.toUint256(int256(fees.amount1()))
        );
    }

    function poolKey() external view returns (PoolKey memory) {
        return _key();
    }

    /// @notice The pool's ETH depth (for display and keeper chunk sizing).
    function poolEth() external view returns (uint256) {
        return _poolEth();
    }

    function _key() internal view override returns (PoolKey memory) {
        return MohnPool.key(address(mohn), address(this));
    }

    function _params(int256 liquidityDelta)
        private
        pure
        returns (IPoolManager.ModifyLiquidityParams memory)
    {
        return IPoolManager.ModifyLiquidityParams({
            tickLower: MohnPool.tickLower(),
            tickUpper: MohnPool.tickUpper(),
            liquidityDelta: liquidityDelta,
            salt: bytes32(0)
        });
    }

    /// @dev The day's budget is fixed at its first addition: 1/7 of the POL bucket then.
    function _useDailyCap(uint256 ethIn) private {
        uint64 day = SafeCast.toUint64(block.timestamp / 1 days);
        if (addDay < day) {
            addDay = day;
            addedInDay = 0;
            // A view read of our own router; no state changes through it.
            addBudget = (router.polBalance() * ADD_DAILY_BPS) / 10_000;
        }
        uint256 used = addedInDay;
        uint256 cap = addBudget;
        if (used + ethIn > cap) revert DailyCapExceeded(cap > used ? cap - used : 0);
        addedInDay = used + ethIn;
    }
}
