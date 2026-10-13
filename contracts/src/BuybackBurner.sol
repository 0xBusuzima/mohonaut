// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";

import {PoolActor} from "./PoolActor.sol";
import {ILiquidityManager} from "./interfaces/ILiquidityManager.sol";
import {MohnPool} from "./lib/MohnPool.sol";
import {PriceAnchor} from "./lib/PriceAnchor.sol";

/// @title BuybackBurner
/// @notice Spends the buyback bucket on MOHN and burns 100 % of it (docs/02 S10, docs/03 S3.6).
///         Only the KEEPER may call, with its own slippage bound (`minMohnOut`, computed off-chain).
///         Per UTC day it may spend at most `dailyBps` of the buyback bucket (measured at the
///         day's first buyback; 1/20 by default), and each swap stops at most 3 % past the hook's
///         time-weighted price anchor (docs/02 S10.1, v1.1). A stolen keeper key can neither raise
///         the cap with just-in-time liquidity nor push the price for a block and buy into it.
///         Nothing here prices a mint or a reward.
// Not locked: the ETH pulled for a buyback is paid into the pool in the same transaction and any
// unspent remainder goes straight back to the router's buyback bucket.
// aderyn-fp-next-line(contract-locks-ether)
contract BuybackBurner is PoolActor, AccessControl, ReentrancyGuardTransient {
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");
    uint16 public constant INITIAL_DAILY_BPS = 500; // 1/20 of the bucket
    uint64 public constant DAILY_BPS_PERIOD = 7 days;

    /// @notice The pool's hook (the LiquidityManager) is part of the pool key.
    address public immutable hooks;
    /// @notice Daily cap in bps of the buyback bucket: 5-25 %, Timelock only, once per 7 days.
    uint16 public dailyBps;
    uint64 public dailyBpsChangedAt;
    uint64 public day;
    uint256 public spentInDay;
    uint256 public dayBudget;
    uint256 public totalEthSpent;
    uint256 public totalBurned;

    event BuybackExecuted(uint256 ethIn, uint256 mohnBurned);
    event DailyBpsChanged(uint16 dailyBps);

    error ZeroValue();
    error DailyCapExceeded(uint256 remaining);
    error SlippageExceeded(uint256 mohnOut);
    error DailyBpsOutOfBounds();
    error RateLimited(uint64 nextChange);

    constructor(address admin, address poolManager_, address mohn_, address router_, address hooks_)
        PoolActor(poolManager_, mohn_, router_)
    {
        if (admin == address(0) || hooks_ == address(0)) revert ZeroAddress();
        hooks = hooks_;
        dailyBps = INITIAL_DAILY_BPS;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Timelock: new daily cap, 500-2,500 bps of the bucket, at most once per 7 days.
    function setDailyBps(uint16 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (bps < 500 || bps > 2500) revert DailyBpsOutOfBounds();
        uint64 last = dailyBpsChangedAt;
        // forge-lint: disable-next-line(block-timestamp)
        if (last != 0 && block.timestamp < last + DAILY_BPS_PERIOD) {
            revert RateLimited(last + DAILY_BPS_PERIOD);
        }
        // forge-lint: disable-next-line(unsafe-typecast)
        dailyBpsChangedAt = uint64(block.timestamp);
        dailyBps = bps;
        emit DailyBpsChanged(bps);
    }

    /// @notice Buys MOHN with `ethIn` from the buyback bucket and burns all of it.
    function executeBuyback(uint256 ethIn, uint256 minMohnOut)
        external
        nonReentrant
        onlyRole(KEEPER_ROLE)
    {
        if (ethIn == 0) revert ZeroValue();
        uint64 today = SafeCast.toUint64(block.timestamp / 1 days);
        if (day < today) {
            day = today;
            spentInDay = 0;
            // A view read of our own router; no state changes through it.
            // aderyn-fp-next-line(reentrancy-state-change)
            dayBudget = (router.buybackBalance() * dailyBps) / 10_000;
        }
        uint256 used = spentInDay;
        if (used + ethIn > dayBudget) {
            revert DailyCapExceeded(dayBudget > used ? dayBudget - used : 0);
        }
        // Stop at most 3 % past the anchor; reverts if the price is already past it. View reads
        // of the PoolManager and our own hook.
        // aderyn-fp-next-line(reentrancy-state-change)
        uint160 limit = PriceAnchor.buyLimit(_tick(), ILiquidityManager(hooks).anchorTick());
        spentInDay = used + ethIn;

        // Router and PoolManager are trusted and this function is nonReentrant; the counters
        // below record the result of these calls.
        // aderyn-fp-next-line(reentrancy-state-change)
        router.pullBuyback(ethIn);
        // aderyn-fp-next-line(reentrancy-state-change)
        bytes memory result = poolManager.unlock(abi.encode(ethIn, minMohnOut, limit));
        (uint256 ethPaid, uint256 mohnOut) = abi.decode(result, (uint256, uint256));
        totalEthSpent += ethPaid;
        totalBurned += mohnOut;
        // The only external calls are to the trusted router and Uniswap PoolManager, under
        // nonReentrant; the event needs their result.
        // forge-lint: disable-next-line(reentrancy-events)
        emit BuybackExecuted(ethPaid, mohnOut);
        ERC20Burnable(address(mohn)).burn(mohnOut);
        // Any ETH left here (unspent at a price limit, or sent by anyone) goes to the bucket.
        uint256 leftover = address(this).balance;
        if (leftover != 0) router.depositBuyback{value: leftover}();
    }

    /// @notice Uniswap v4 unlock callback: exact-input ETH -> MOHN swap, then settlement.
    function unlockCallback(bytes calldata data) external onlyPoolManager returns (bytes memory) {
        (uint256 ethIn, uint256 minMohnOut, uint160 limit) =
            abi.decode(data, (uint256, uint256, uint160));
        BalanceDelta delta = poolManager.swap(
            _key(),
            IPoolManager.SwapParams({
                zeroForOne: true,
                amountSpecified: -SafeCast.toInt256(ethIn),
                sqrtPriceLimitX96: limit
            }),
            ""
        );
        (, uint256 mohnOut) = _settle(delta);
        if (mohnOut < minMohnOut) revert SlippageExceeded(mohnOut);
        // The ETH actually paid into the pool (exact input, unless the price limit was hit).
        return abi.encode(SafeCast.toUint256(-int256(delta.amount0())), mohnOut);
    }

    function _key() internal view override returns (PoolKey memory) {
        return MohnPool.key(address(mohn), hooks);
    }
}
