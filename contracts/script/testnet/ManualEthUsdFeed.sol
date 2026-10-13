// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice TESTNET ONLY. Robinhood Chain testnet has no Chainlink ETH/USD feed
///         (docs/ZINCIR_DOGRULAMA.md), so testnet deployments use this owner-updated feed with the
///         same interface (8 decimals). Never deploy it on mainnet: Deploy.s.sol refuses to.
contract ManualEthUsdFeed {
    address public immutable owner;
    int256 private _answer;
    uint256 private _updatedAt;

    event AnswerUpdated(int256 answer, uint256 updatedAt);

    error NotOwner();

    constructor(address owner_, int256 answer_) {
        owner = owner_;
        _set(answer_);
    }

    /// @notice The keeper refreshes the price at least every 24 hours (staleness limit 26 h).
    function set(int256 answer_) external {
        if (msg.sender != owner) revert NotOwner();
        _set(answer_);
    }

    function decimals() external pure returns (uint8) {
        return 8;
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256 answer, uint256 startedAt, uint256 updatedAt, uint80)
    {
        return (1, _answer, _updatedAt, _updatedAt, 1);
    }

    function _set(int256 answer_) private {
        _answer = answer_;
        _updatedAt = block.timestamp;
        emit AnswerUpdated(answer_, block.timestamp);
    }
}
