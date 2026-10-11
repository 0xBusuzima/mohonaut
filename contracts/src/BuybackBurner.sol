// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

import {PoolActor} from "./PoolActor.sol";
import {MohnPool} from "./lib/MohnPool.sol";

/// @title BuybackBurner
/// @notice Spends the buyback bucket on MOHN and burns 100 % of it (docs/02 S10, docs/03 S3.6).
///         Only the KEEPER may call, with its own slippage bound (`minMohnOut`, computed off-chain),
///         and at most 2 % of the pool's ETH per UTC day (sim/params.json
///         buyback_max_daily_frac_of_pool_eth). A stolen keeper key can at worst buy badly within
///         that cap; it has no other power. Nothing here prices a mint or a reward.
// Not locked: the ETH pulled for a buyback is paid into the pool in the same transaction and any
// unspent remainder goes straight back to the router's buyback bucket.
// aderyn-fp-next-line(contract-locks-ether)
contract BuybackBurner is PoolActor, AccessControl, ReentrancyGuardTransient {
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");
    uint256 public constant DAILY_BPS = 200;

    /// @notice The pool's hook (the LiquidityManager) is part of the pool key.
    address public immutable hooks;
    uint64 public day;
    uint256 public spentInDay;
    uint256 public totalEthSpent;
    uint256 public totalBurned;

    event BuybackExecuted(uint256 ethIn, uint256 mohnBurned);

    error ZeroValue();
    error DailyCapExceeded(uint256 remaining);
    error SlippageExceeded(uint256 mohnOut);

    constructor(address admin, address poolManager_, address mohn_, address router_, address hooks_)
        PoolActor(poolManager_, mohn_, router_)
    {
        if (admin == address(0) || hooks_ == address(0)) revert ZeroAddress();
        hooks = hooks_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Buys MOHN with `ethIn` from the buyback bucket and burns all of it.
    function executeBuyback(uint256 ethIn, uint256 minMohnOut)
        external
        nonReentrant
        onlyRole(KEEPER_ROLE)
    {
        if (ethIn == 0) revert ZeroValue();
        uint64 today = SafeCast.toUint64(block.timestamp / 1 days);
        uint256 used = day < today ? 0 : spentInDay;
        uint256 cap = (_poolEth() * DAILY_BPS) / 10_000;
        if (used + ethIn > cap) revert DailyCapExceeded(cap > used ? cap - used : 0);
        day = today;
        spentInDay = used + ethIn;

        // Router and PoolManager are trusted and this function is nonReentrant; the counters
        // below record the result of these calls.
        // aderyn-fp-next-line(reentrancy-state-change)
        router.pullBuyback(ethIn);
        // aderyn-fp-next-line(reentrancy-state-change)
        bytes memory result = poolManager.unlock(abi.encode(ethIn, minMohnOut));
        uint256 mohnOut = abi.decode(result, (uint256));
        uint256 unspent = address(this).balance; // only if the swap hit its price limit
        totalEthSpent += ethIn - unspent;
        totalBurned += mohnOut;
        // The only external calls are to the trusted router and Uniswap PoolManager, under
        // nonReentrant; the event needs their result.
        // forge-lint: disable-next-line(reentrancy-events)
        emit BuybackExecuted(ethIn - unspent, mohnOut);
        ERC20Burnable(address(mohn)).burn(mohnOut);
        if (unspent != 0) router.depositBuyback{value: unspent}();
    }

    /// @notice Uniswap v4 unlock callback: exact-input ETH -> MOHN swap, then settlement.
    function unlockCallback(bytes calldata data) external onlyPoolManager returns (bytes memory) {
        (uint256 ethIn, uint256 minMohnOut) = abi.decode(data, (uint256, uint256));
        BalanceDelta delta = poolManager.swap(
            _key(),
            IPoolManager.SwapParams({
                zeroForOne: true,
                amountSpecified: -SafeCast.toInt256(ethIn),
                sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
            }),
            ""
        );
        (, uint256 mohnOut) = _settle(delta);
        if (mohnOut < minMohnOut) revert SlippageExceeded(mohnOut);
        return abi.encode(mohnOut);
    }

    function _key() internal view override returns (PoolKey memory) {
        return MohnPool.key(address(mohn), hooks);
    }
}
