// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

/// @notice Test-only trader: exact-input swaps on a v4 pool with native ETH as currency0.
contract PoolSwapper is IUnlockCallback {
    IPoolManager public immutable pm;

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

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(pm), "only pm");
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
}
