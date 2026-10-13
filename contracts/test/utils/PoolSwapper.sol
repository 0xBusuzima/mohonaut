// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

/// @notice Test-only trader: exact-input swaps on a v4 pool with native ETH as currency0, and
///         (for manipulation tests) its own concentrated liquidity.
contract PoolSwapper is IUnlockCallback {
    IPoolManager public immutable pm;
    bytes32 private constant MODIFY = keccak256("modify");

    constructor(IPoolManager pm_) {
        pm = pm_;
    }

    receive() external payable {}

    /// @param ethForMohn true: pay `amountIn` ETH (held by this contract) for MOHN; false: pay
    ///        `amountIn` MOHN (held by this contract) for ETH.
    function swap(PoolKey memory key, bool ethForMohn, uint256 amountIn)
        external
        returns (uint256 out)
    {
        out = abi.decode(pm.unlock(abi.encode(key, ethForMohn, amountIn)), (uint256));
    }

    /// @notice Adds (delta > 0) or removes (delta < 0) liquidity in [lower, upper]; returns the
    ///         ETH and MOHN this contract received (positive) or paid (negative).
    function modify(PoolKey memory key, int24 lower, int24 upper, int256 delta)
        external
        returns (int256 eth, int256 mohn)
    {
        (eth, mohn) = abi.decode(
            pm.unlock(abi.encode(MODIFY, key, lower, upper, delta)), (int256, int256)
        );
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(pm), "only pm");
        if (data.length == 9 * 32 && bytes32(data[:32]) == MODIFY) return _modify(data);
        (PoolKey memory key, bool zeroForOne, uint256 amountIn) =
            abi.decode(data, (PoolKey, bool, uint256));
        BalanceDelta d = pm.swap(
            key,
            IPoolManager.SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: -int256(amountIn),
                sqrtPriceLimitX96: zeroForOne
                    ? TickMath.MIN_SQRT_PRICE + 1
                    : TickMath.MAX_SQRT_PRICE - 1
            }),
            ""
        );
        uint256 out;
        if (zeroForOne) {
            pm.settle{value: uint256(uint128(-d.amount0()))}();
            out = uint256(uint128(d.amount1()));
            pm.take(key.currency1, address(this), out);
        } else {
            pm.sync(key.currency1);
            IERC20(Currency.unwrap(key.currency1))
                .transfer(address(pm), uint256(uint128(-d.amount1())));
            pm.settle();
            out = uint256(uint128(d.amount0()));
            pm.take(key.currency0, address(this), out);
        }
        return abi.encode(out);
    }

    function _modify(bytes calldata data) private returns (bytes memory) {
        (, PoolKey memory key, int24 lower, int24 upper, int256 delta) =
            abi.decode(data, (bytes32, PoolKey, int24, int24, int256));
        (BalanceDelta d,) = pm.modifyLiquidity(
            key,
            IPoolManager.ModifyLiquidityParams({
                tickLower: lower, tickUpper: upper, liquidityDelta: delta, salt: 0
            }),
            ""
        );
        int128 a0 = d.amount0();
        int128 a1 = d.amount1();
        if (a0 < 0) pm.settle{value: uint256(uint128(-a0))}();
        else if (a0 > 0) pm.take(key.currency0, address(this), uint256(uint128(a0)));
        if (a1 < 0) {
            pm.sync(key.currency1);
            IERC20(Currency.unwrap(key.currency1)).transfer(address(pm), uint256(uint128(-a1)));
            pm.settle();
        } else if (a1 > 0) {
            pm.take(key.currency1, address(this), uint256(uint128(a1)));
        }
        return abi.encode(int256(a0), int256(a1));
    }
}
