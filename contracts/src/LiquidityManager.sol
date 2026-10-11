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

import {PoolActor} from "./PoolActor.sol";
import {ILiquidityManager} from "./interfaces/ILiquidityManager.sol";
import {MohnPool} from "./lib/MohnPool.sol";

/// @title LiquidityManager
/// @notice Owns the protocol's full-range ETH/MOHN position (docs/02 S10-S11, docs/03 S3.7).
///         - openMarket: called once by MiningCore at Market Open; initializes the pool at the
///           formula price and adds the POL ETH plus the MOHN minted for it.
///         - addLiquidity: KEEPER, capped per day; swaps half of the ETH for MOHN and adds both.
///         - collectFees: anyone; MOHN fees are burned, ETH fees go to the buyback bucket.
///         There is NO function that removes liquidity (invariant L1): the position is locked forever.
///         This contract is also the pool's hook, with the beforeInitialize permission only, so
///         nobody else can initialize the pool at their own price before Market Open.
// Not locked: ETH arrives only to be paid into the pool in the same transaction; rounding dust is
// spent by the next addLiquidity (its budget is the whole balance).
// aderyn-fp-next-line(contract-locks-ether)
contract LiquidityManager is ILiquidityManager, PoolActor, AccessControl, ReentrancyGuardTransient {
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    /// @notice addLiquidity may use at most 4 % of the pool's ETH per UTC day (half of it is
    ///         swapped, so its price impact matches the 2 % buyback cap).
    uint256 public constant ADD_DAILY_BPS = 400;

    address public immutable core;
    bool public opened;
    uint64 public addDay;
    uint256 public addedInDay;
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
    function beforeInitialize(address sender, PoolKey calldata, uint160)
        external
        view
        onlyPoolManager
        returns (bytes4)
    {
        if (sender != address(this)) revert NotSelf();
        return IHooks.beforeInitialize.selector;
    }

    // ------------------------------------------------------------------ actions

    /// @notice Market Open: pulls `polEth` from the router, initializes the pool at `sqrtPriceX96`
    ///         and adds everything as full-range liquidity. MiningCore minted the MOHN beforehand.
    function openMarket(uint160 sqrtPriceX96, uint256 polEth) external nonReentrant {
        if (msg.sender != core) revert NotCore();
        if (opened) revert AlreadyOpen();
        opened = true;
        router.pullPol(polEth);
        // The initial tick and the (empty) unlock result are not needed.
        // forge-lint: disable-start(unused-return)
        // slither-disable-start unused-return
        poolManager.initialize(_key(), sqrtPriceX96);
        // slither-disable-end unused-return
        // forge-lint: disable-end(unused-return)
        // forge-lint: disable-start(unused-return)
        // slither-disable-start unused-return
        poolManager.unlock(abi.encode(Action.Open, uint256(0), uint256(0)));
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
        _useDailyCap(ethIn);
        router.pullPol(ethIn);
        // The callback emits LiquidityAdded; its (empty) result is not needed.
        // forge-lint: disable-start(unused-return)
        // slither-disable-start unused-return
        poolManager.unlock(abi.encode(Action.Add, ethIn / 2, minMohnOut));
        // slither-disable-end unused-return
        // forge-lint: disable-end(unused-return)
    }

    /// @notice Collects the position's fees: MOHN is burned, ETH goes to the buyback bucket.
    function collectFees() external nonReentrant {
        // The PoolManager is trusted and this function is nonReentrant; the counters below record
        // the result of the call.
        // aderyn-fp-next-line(reentrancy-state-change)
        bytes memory result = poolManager.unlock(abi.encode(Action.Collect, uint256(0), uint256(0)));
        (uint256 ethFee, uint256 mohnFee) = abi.decode(result, (uint256, uint256));
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
        (Action action, uint256 swapEth, uint256 minMohnOut) =
            abi.decode(data, (Action, uint256, uint256));
        if (action == Action.Collect) {
            // A zero liquidity change returns exactly the accrued fees as the caller delta.
            // forge-lint: disable-start(unused-return)
            // slither-disable-start unused-return
            (BalanceDelta fees,) = poolManager.modifyLiquidity(_key(), _params(0), "");
            // slither-disable-end unused-return
            // forge-lint: disable-end(unused-return)
            (uint256 ethFee, uint256 mohnFee) = _settle(fees);
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
                    sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
                }),
                ""
            );
            mohnBought = SafeCast.toUint256(int256(total.amount1()));
            if (mohnBought < minMohnOut) revert SlippageExceeded(mohnBought);
            ethBudget -= swapEth;
        }
        uint128 liquidity = MohnPool.liquidityFor(
            _sqrtPrice(), ethBudget, mohn.balanceOf(address(this)) + mohnBought
        );
        if (liquidity < 1) revert ZeroLiquidity();
        // The caller delta already includes any fees; the separate fee delta is not needed.
        // forge-lint: disable-start(unused-return)
        // slither-disable-start unused-return
        (BalanceDelta added,) =
            poolManager.modifyLiquidity(_key(), _params(SafeCast.toInt256(liquidity)), "");
        // slither-disable-end unused-return
        // forge-lint: disable-end(unused-return)
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
        return "";
    }

    function poolKey() external view returns (PoolKey memory) {
        return _key();
    }

    /// @notice The pool's ETH depth that the daily caps are based on.
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

    function _useDailyCap(uint256 ethIn) private {
        uint64 day = SafeCast.toUint64(block.timestamp / 1 days);
        uint256 used = addDay < day ? 0 : addedInDay;
        uint256 cap = (_poolEth() * ADD_DAILY_BPS) / 10_000;
        if (used + ethIn > cap) revert DailyCapExceeded(cap > used ? cap - used : 0);
        addDay = day;
        addedInDay = used + ethIn;
    }
}
