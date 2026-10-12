// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {SqrtPriceMath} from "@uniswap/v4-core/src/libraries/SqrtPriceMath.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

import {IRevenueRouter} from "./interfaces/IRevenueRouter.sol";
import {MohnPool} from "./lib/MohnPool.sol";

/// @title PoolActor
/// @notice Shared plumbing for the contracts that trade on the ETH/MOHN Uniswap v4 pool directly
///         through the PoolManager (no routers, no position NFTs): settlement of balance deltas
///         and reading the pool's ETH depth for daily caps.
// Not locked: the derived contracts pay ETH out to the PoolManager (settle) and the router;
// ETH dust left by full-range rounding is used by the next liquidity addition.
// forge-lint: disable-next-line(locked-ether)
abstract contract PoolActor is IUnlockCallback {
    using SafeERC20 for IERC20;
    using StateLibrary for IPoolManager;

    IPoolManager public immutable poolManager;
    IERC20 public immutable mohn;
    IRevenueRouter public immutable router;

    error ZeroAddress();
    error NotPoolManager();
    error UnexpectedEth();
    error MarketNotOpen();

    constructor(address poolManager_, address mohn_, address router_) {
        if (poolManager_ == address(0) || mohn_ == address(0) || router_ == address(0)) {
            revert ZeroAddress();
        }
        poolManager = IPoolManager(poolManager_);
        mohn = IERC20(mohn_);
        router = IRevenueRouter(router_);
    }

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    /// @dev ETH arrives only from the router (pulled buckets) and the PoolManager (taken deltas).
    receive() external payable {
        if (msg.sender != address(poolManager) && msg.sender != address(router)) {
            revert UnexpectedEth();
        }
    }

    function _key() internal view virtual returns (PoolKey memory);

    /// @dev Pays what the contract owes and takes what it is owed. Call inside unlockCallback.
    /// @return ethTaken ETH received (positive amount0), 0 if ETH was paid.
    /// @return mohnTaken MOHN received (positive amount1), 0 if MOHN was paid.
    function _settle(BalanceDelta delta) internal returns (uint256 ethTaken, uint256 mohnTaken) {
        PoolKey memory key = _key();
        int128 eth = delta.amount0();
        int128 mohnDelta = delta.amount1();
        if (eth < 0) {
            // The paid amount equals msg.value.
            // slither-disable-next-line unused-return
            poolManager.settle{value: SafeCast.toUint256(-int256(eth))}();
        } else if (eth > 0) {
            ethTaken = SafeCast.toUint256(int256(eth));
            poolManager.take(key.currency0, address(this), ethTaken);
        }
        if (mohnDelta < 0) {
            poolManager.sync(key.currency1);
            mohn.safeTransfer(address(poolManager), SafeCast.toUint256(-int256(mohnDelta)));
            // The paid amount equals the transfer above.
            // forge-lint: disable-start(unused-return)
            // slither-disable-start unused-return
            poolManager.settle();
            // slither-disable-end unused-return
            // forge-lint: disable-end(unused-return)
        } else if (mohnDelta > 0) {
            mohnTaken = SafeCast.toUint256(int256(mohnDelta));
            poolManager.take(key.currency1, address(this), mohnTaken);
        }
    }

    /// @dev Current pool price; reverts if the pool was never initialized (market not open).
    function _sqrtPrice() internal view returns (uint160 sqrtPriceX96) {
        // slither-disable-next-line unused-return
        (sqrtPriceX96,,,) = poolManager.getSlot0(_poolId());
        if (sqrtPriceX96 == 0) revert MarketNotOpen();
    }

    /// @dev Current pool tick; reverts if the pool was never initialized.
    function _tick() internal view returns (int24 tick) {
        uint160 sqrtPriceX96;
        // slither-disable-next-line unused-return
        (sqrtPriceX96, tick,,) = poolManager.getSlot0(_poolId());
        if (sqrtPriceX96 == 0) revert MarketNotOpen();
    }

    /// @dev ETH held by the in-range liquidity, valued as a full-range position. For display and
    ///      keeper sizing only; never prices a mint or a reward and no longer sizes a cap (v1.1).
    function _poolEth() internal view returns (uint256) {
        uint160 sqrtP = _sqrtPrice();
        uint128 liquidity = poolManager.getLiquidity(_poolId());
        uint160 sqrtMax = TickMath.getSqrtPriceAtTick(MohnPool.tickUpper());
        return SqrtPriceMath.getAmount0Delta(sqrtP, sqrtMax, liquidity, false);
    }

    function _poolId() internal view returns (PoolId) {
        return _key().toId();
    }
}
