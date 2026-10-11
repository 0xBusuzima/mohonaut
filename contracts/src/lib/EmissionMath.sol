// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title EmissionMath
/// @notice Reserve-based hourly emission and its fixed 90/5/5 split (docs/02 §3.1, §3.3).
/// @dev Must match sim/vectors/emission_hourly.json to the wei. Every division rounds down;
///      the split remainder goes to the treasury so no wei is lost.
library EmissionMath {
    uint256 internal constant WAD = 1e18;

    /// @notice Hard cap of MOHN: 100,000,000 with 18 decimals.
    uint256 internal constant CAP = 100_000_000e18;

    /// @notice floor(1e18 * (1 - (1 - 0.0005)^(1/24))): the reserve share emitted per hour.
    uint256 internal constant DELTA_H_WAD = 20_838_326_282_491;

    uint256 internal constant BPS = 10_000;
    uint256 internal constant MINERS_BPS = 9_000;
    uint256 internal constant DEV_BPS = 500;

    /// @notice Emission of the hour that starts with `reserve` tokens in the reserve.
    function hourlyEmission(uint256 reserve) internal pure returns (uint256) {
        return (reserve * DELTA_H_WAD) / WAD;
    }

    /// @notice Splits an emission into miners / dev / treasury shares.
    function split(uint256 emission)
        internal
        pure
        returns (uint256 miners, uint256 dev, uint256 treasury)
    {
        miners = (emission * MINERS_BPS) / BPS;
        dev = (emission * DEV_BPS) / BPS;
        treasury = emission - miners - dev;
    }
}
