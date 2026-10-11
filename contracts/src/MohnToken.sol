// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Capped} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @title MohnToken
/// @notice The Mohonaut token (MOHN). Fair-mined: zero premine, every token is minted by MiningCore.
/// @dev Immutable by design (docs/02 §2, docs/03 §3.2):
///      - hard cap of 100,000,000 MOHN;
///      - a single minter fixed at deployment, with no setter;
///      - an immutable per-UTC-day mint cap (500,000 MOHN) as the last line of defence for an
///        unaudited launch: even an accounting bug cannot mint more than 0.5% of CAP per day;
///      - no owner, no pause, no blacklist, no transfer tax, not upgradeable.
contract MohnToken is ERC20, ERC20Burnable, ERC20Capped, ERC20Permit {
    /// @notice Maximum total supply.
    uint256 public constant MAX_SUPPLY = 100_000_000e18;

    /// @notice Maximum amount that may be minted within one UTC day.
    uint256 public constant DAILY_MINT_CAP = 500_000e18;

    /// @notice The only address allowed to mint (the MiningCore proxy).
    address public immutable minter;

    /// @dev UTC day index (timestamp / 1 days) of the last mint, and the amount minted that day.
    uint64 private _mintDay;
    uint192 private _mintedInDay;

    error ZeroMinter();
    error NotMinter();
    error DailyMintCapExceeded(uint256 mintedToday, uint256 requested);

    constructor(address minter_)
        ERC20("Mohonaut", "MOHN")
        ERC20Capped(MAX_SUPPLY)
        ERC20Permit("Mohonaut")
    {
        if (minter_ == address(0)) revert ZeroMinter();
        minter = minter_;
    }

    /// @notice Mints `amount` to `to`. Only callable by the minter, within both caps.
    function mint(address to, uint256 amount) external {
        if (msg.sender != minter) revert NotMinter();

        // Day index fits uint64 for ~5e16 years; UTC-day granularity makes the cap immune to
        // the few seconds of timestamp drift a sequencer could introduce.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 today = uint64(block.timestamp / 1 days);
        // `today` never precedes `_mintDay`, so `>` means "a new UTC day started".
        // forge-lint: disable-next-line(block-timestamp)
        uint256 alreadyMinted = today > _mintDay ? 0 : _mintedInDay;
        if (alreadyMinted + amount > DAILY_MINT_CAP) {
            revert DailyMintCapExceeded(alreadyMinted, amount);
        }
        _mintDay = today;
        // Bounded by DAILY_MINT_CAP (checked above), far below 2^192.
        // forge-lint: disable-next-line(unsafe-typecast)
        _mintedInDay = uint192(alreadyMinted + amount);

        _mint(to, amount); // ERC20Capped enforces totalSupply <= MAX_SUPPLY
    }

    /// @notice Amount minted so far in the current UTC day.
    function mintedToday() external view returns (uint256) {
        // forge-lint: disable-next-line(unsafe-typecast,block-timestamp)
        return uint64(block.timestamp / 1 days) > _mintDay ? 0 : _mintedInDay;
    }

    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Capped)
    {
        super._update(from, to, value);
    }
}
