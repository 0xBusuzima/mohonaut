// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title SiteMath
/// @notice Drill-site level tables (docs/02 S7). Generated from sim/vectors/outpost_costs.json
///         (capacity = 6 * 1.22^(L-1) L/h and upgrade cost = 150 * L^2.2 MOHN are irrational, so the
///         exact floored values are stored). Do not edit by hand: run tools/gen_sitemath.py.
library SiteMath {
    uint256 internal constant MAX_LEVEL = 30;

    error InvalidLevel(uint256 level);

    /// @notice Rig pads (slots) at `level`: 3 + level.
    function slots(uint256 level) internal pure returns (uint256) {
        _check(level);
        return 3 + level;
    }

    /// @notice Fuel-line capacity in litres per hour (WAD) at `level`.
    function fuelLineCapacity(uint256 level) internal pure returns (uint256) {
        _check(level);
        return _capacity(level);
    }

    /// @notice Base MOHN cost (WAD, before the price index) to upgrade from `level` to `level + 1`.
    function upgradeCost(uint256 level) internal pure returns (uint256) {
        // No loop here; the lint flags callers that iterate over levels (tests).
        // forge-lint: disable-next-line(require-revert-in-loop)
        if (level == 0 || level >= MAX_LEVEL) revert InvalidLevel(level);
        return _upgradeCost(level);
    }

    function _check(uint256 level) private pure {
        // forge-lint: disable-next-line(require-revert-in-loop)
        if (level == 0 || level > MAX_LEVEL) revert InvalidLevel(level);
    }

    function _capacity(uint256 level) private pure returns (uint256) {
        uint256[30] memory table = [
            uint256(6000000000000000000),
            7320000000000000000,
            8930400000000000000,
            10895088000000000000,
            13292007360000000000,
            16216248979200000000,
            19783823754624000000,
            24136264980641280000,
            29446243276382361600,
            35924416797186481152,
            43827788492567507005,
            53469901960932358546,
            65233280392337477426,
            79584602078651722460,
            97093214535955101402,
            118453721733865223710,
            144513540515315572927,
            176306519428684998970,
            215093953702995698744,
            262414623517654752468,
            320145840691538798011,
            390577925643677333573,
            476505069285286346960,
            581336184528049343291,
            709230145124220198815,
            865260777051548642555,
            1055618148002889343917,
            1287854140563524999578,
            1571182051487500499486,
            1916842102814750609373
        ];
        return table[level - 1];
    }

    function _upgradeCost(uint256 level) private pure returns (uint256) {
        uint256[29] memory table = [
            uint256(150000000000000000000),
            689219012998221004079,
            1681736768480948390055,
            3166818985854946222497,
            5173986230479555621462,
            7727233037968379705644,
            10846932737719957709185,
            14550879038499821590533,
            18854923723071620042421,
            23773397886916702278031,
            29319405931569530727372,
            35505039517572076465863,
            42341538486687443508272,
            49839415170329603157550,
            58008552556077408724206,
            66858283261142333885665,
            76397454078530942550874,
            86634479457147763077051,
            97577386344223255825635,
            109233852181564815862765,
            121611237401755788027890,
            134716613452336922701599,
            148556787144527936014800,
            163138321951759062517950,
            178467556754613608427763,
            194550622430806053533437,
            211393456613288256879245,
            229001816880687545710963,
            247381292597891231865981
        ];
        return table[level - 1];
    }
}
