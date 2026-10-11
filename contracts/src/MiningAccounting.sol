// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {EmissionMath} from "./lib/EmissionMath.sol";

/// @title MiningAccounting
/// @notice Emission and reward accounting core of MiningCore (docs/02 S3-S4, docs/03 S3.4).
/// @dev Model:
///      - Each UTC hour h emits E_h = floor(R_h * delta_h), fixed at the start of the hour and spread
///        evenly over its seconds, but only while some Drill Power (DP) is active. Unmined time
///        stays in the reserve R.
///      - Emission is split 90/5/5 (miners/dev/treasury). The miners' share is distributed pro rata
///        to active DP through a single accumulator `acc` (scaled by PREC).
///      - Every position has one fuel expiry hour. Its DP leaves the active total exactly at that
///        hour boundary via the `dpEndingAt` schedule; `accAtHour` snapshots the accumulator at
///        every boundary so expired positions settle to the exact boundary value.
///      - All divisions round down (protocol-favourable). Dust stays in the reserve.
///      Uses ERC-7201 namespaced storage so it can sit behind a UUPS proxy.
abstract contract MiningAccounting {
    /// @notice Accumulator precision (per DP unit).
    uint256 public constant PREC = 1e36;
    uint64 internal constant HOUR = 1 hours;
    /// @notice Maximum hour boundaries processed per checkpoint call (bounded gas).
    uint256 public constant MAX_HOURS_PER_POKE = 168;
    /// @notice Share of every MOHN spend that returns to the reserve; the rest is burned forever
    ///         (docs/02 S6.3, immutable).
    uint256 public constant RESERVE_SHARE_BPS = 2000;

    struct Position {
        uint128 dp; // drill power counted while active
        uint64 expiryHour; // first hour index in which this DP no longer counts
        uint256 debt; // accumulator value already accounted for
        uint256 unrefined; // credited, not yet refined/spent MOHN
    }

    /// @custom:storage-location erc7201:mohonaut.storage.MiningAccounting
    struct AccountingStorage {
        uint256 acc;
        uint256 activeDp;
        uint256 reserve;
        uint256 hourEmission;
        uint256 minersDistributed;
        uint256 devPending;
        uint256 treasuryPending;
        uint64 lastUpdate;
        uint64 currentHour;
        mapping(uint64 hour => uint256 dp) dpEndingAt;
        mapping(uint64 hour => uint256 acc) accAtHour;
        mapping(address account => Position) positions;
        uint256 emitted; // cumulative emission, recycled reserve included (World Depth source)
        uint256 burnedForever; // 80 % of every MOHN spend
        uint256 unrefinedSpent; // miners' credit spent in game without being minted
        uint256 unrefinedRefined; // miners' credit sent to the refinery (fast or queued)
        uint256 referralPaid; // referral credit moved from the treasury share to referrers
        uint64 snapshotHour; // Market Open hour: the miners' genesis accrual is recorded there
        uint256 minersAtSnapshot; // minersDistributed at the snapshot hour boundary
    }

    // keccak256(abi.encode(uint256(keccak256("mohonaut.storage.MiningAccounting")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant ACCOUNTING_STORAGE_SLOT =
        0xffbd18af881f3cb72d134f7e3a89e907f9a94d70a5ca7c94762e1b3a26acba00;

    event HourClosed(
        uint64 indexed hour, uint256 acc, uint256 activeDp, uint256 reserve, uint256 hourEmission
    );
    event Accrued(address indexed account, uint256 amount);
    event PositionUpdated(address indexed account, uint256 dp, uint64 expiryHour);
    event SpendSettled(uint256 burned, uint256 toReserve);
    event ReferralCredited(address indexed referrer, address indexed invitee, uint256 amount);

    error GenesisNotHourAligned();
    error CheckpointBehind();
    error InsufficientUnrefined(uint256 available);
    error InsufficientShare(uint256 available);

    function _accounting() private pure returns (AccountingStorage storage s) {
        assembly {
            s.slot := ACCOUNTING_STORAGE_SLOT
        }
    }

    // ------------------------------------------------------------------ init

    /// @dev `genesisTime` must be an exact hour boundary. Nothing is emitted before it.
    ///      `snapshotHour`: the hour boundary at which minersDistributed is recorded (Market Open).
    function _initAccounting(uint64 genesisTime, uint64 snapshotHour) internal {
        if (genesisTime % HOUR != 0) revert GenesisNotHourAligned();
        AccountingStorage storage s = _accounting();
        s.snapshotHour = snapshotHour;
        s.reserve = EmissionMath.CAP;
        s.hourEmission = EmissionMath.hourlyEmission(EmissionMath.CAP);
        s.currentHour = genesisTime / HOUR;
        s.lastUpdate = genesisTime;
    }

    // ------------------------------------------------------------------ checkpoint

    /// @notice Advances global accounting by at most MAX_HOURS_PER_POKE hour boundaries. Anyone may call.
    /// @return caughtUp True when accounting has reached the current block timestamp.
    function poke() external returns (bool caughtUp) {
        return _checkpoint();
    }

    function _checkpoint() internal returns (bool caughtUp) {
        AccountingStorage storage s = _accounting();
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 nowTs = uint64(block.timestamp); // fits uint64 until year 5.8e11
        uint64 last = s.lastUpdate;
        if (nowTs <= last) return true; // before genesis, or already up to date

        uint256 acc = s.acc;
        uint256 active = s.activeDp;
        uint256 res = s.reserve;
        uint256 emission = s.hourEmission;
        uint64 hour = s.currentHour;
        uint256 minersSum = 0;
        uint256 devSum = 0;
        uint256 treasurySum = 0;

        uint256 boundaries = 0;
        while (last < nowTs && boundaries < MAX_HOURS_PER_POKE) {
            uint64 hourEnd = (hour + 1) * HOUR;
            uint64 segEnd = nowTs < hourEnd ? nowTs : hourEnd;
            if (active != 0) {
                uint256 amount = (emission * (segEnd - last)) / HOUR;
                (uint256 miners, uint256 dev, uint256 treasury) = EmissionMath.split(amount);
                acc += (miners * PREC) / active;
                minersSum += miners;
                devSum += dev;
                treasurySum += treasury;
                res -= amount;
            }
            last = segEnd;
            if (segEnd >= hourEnd) {
                // segEnd <= hourEnd always: this means "boundary reached"
                ++hour;
                ++boundaries;
                s.accAtHour[hour] = acc;
                if (hour == s.snapshotHour) s.minersAtSnapshot = s.minersDistributed + minersSum;
                active -= s.dpEndingAt[hour];
                emission = EmissionMath.hourlyEmission(res);
                // forge-lint: disable-next-line(reentrancy-events)
                emit HourClosed(hour, acc, active, res, emission);
            }
        }

        s.acc = acc;
        s.activeDp = active;
        s.reserve = res;
        s.hourEmission = emission;
        s.currentHour = hour;
        s.lastUpdate = last;
        s.minersDistributed += minersSum;
        s.devPending += devSum;
        s.treasuryPending += treasurySum;
        // split() gives the treasury the remainder, so the three sums add up to the full emission.
        s.emitted += minersSum + devSum + treasurySum;
        return last >= nowTs;
    }

    /// @dev State-changing account actions require fully caught-up accounting; otherwise a new
    ///      position could earn emission from before it existed. After >168 idle hours, call poke().
    function _requireCheckpointed() internal {
        if (!_checkpoint()) revert CheckpointBehind();
    }

    // ------------------------------------------------------------------ positions

    /// @dev Credits everything `account` earned up to now (or up to its expiry boundary).
    ///      Caller must have checkpointed.
    function _settle(address account) internal {
        AccountingStorage storage s = _accounting();
        Position storage p = s.positions[account];
        uint256 endAcc = p.expiryHour > s.currentHour ? s.acc : s.accAtHour[p.expiryHour];
        if (endAcc > p.debt) {
            uint256 earned = (uint256(p.dp) * (endAcc - p.debt)) / PREC;
            if (earned != 0) {
                p.unrefined += earned;
                // forge-lint: disable-next-line(reentrancy-events)
                emit Accrued(account, earned);
                _onAccrued(account, earned);
            }
        }
        p.debt = endAcc;
    }

    /// @dev Replaces `account`'s active DP and fuel expiry hour. Caller must have checkpointed.
    ///      A position whose expiry hour is not after the current hour is inactive.
    function _setPosition(address account, uint128 dp, uint64 expiryHour) internal {
        AccountingStorage storage s = _accounting();
        _settle(account);
        Position storage p = s.positions[account];
        uint64 hour = s.currentHour;

        if (p.expiryHour > hour && p.dp != 0) {
            s.dpEndingAt[p.expiryHour] -= p.dp;
            s.activeDp -= p.dp;
        }
        if (expiryHour > hour && dp != 0) {
            s.dpEndingAt[expiryHour] += dp;
            s.activeDp += dp;
        }
        p.dp = dp;
        p.expiryHour = expiryHour;
        p.debt = s.acc;
        // forge-lint: disable-next-line(reentrancy-events)
        emit PositionUpdated(account, dp, expiryHour);
    }

    /// @dev Spends up to `amount` of `account`'s settled unrefined credit. Caller must have settled.
    /// @return used The part of `amount` covered by the credit.
    function _spendUnrefined(address account, uint256 amount) internal returns (uint256 used) {
        AccountingStorage storage s = _accounting();
        Position storage p = s.positions[account];
        used = amount < p.unrefined ? amount : p.unrefined;
        if (used != 0) {
            p.unrefined -= used;
            s.unrefinedSpent += used;
        }
    }

    /// @dev Books a MOHN spend (unrefined credit or burned wallet tokens): RESERVE_SHARE_BPS back
    ///      to the reserve (rounded down), the rest burned forever (docs/02 S6.3, invariant S1).
    function _settleSpend(uint256 spent) internal {
        if (spent < 1) return; // nothing spent (the cost was covered by scrap credit)
        uint256 toReserve = (spent * RESERVE_SHARE_BPS) / 10_000;
        _burnAndRecycle(spent - toReserve, toReserve);
    }

    /// @dev Books MOHN that leaves circulation: `burned` forever, `toReserve` back to the reserve.
    function _burnAndRecycle(uint256 burned, uint256 toReserve) internal {
        AccountingStorage storage s = _accounting();
        s.reserve += toReserve;
        s.burnedForever += burned;
        // forge-lint: disable-next-line(reentrancy-events)
        emit SpendSettled(burned, toReserve);
    }

    /// @dev Hook for every accrual credited in `_settle` (MiningCore pays referral credit here).
    function _onAccrued(address account, uint256 earned) internal virtual;

    /// @dev Moves `amount` of `account`'s settled unrefined credit to the refinery.
    function _withdrawUnrefined(address account, uint256 amount) internal {
        AccountingStorage storage s = _accounting();
        Position storage p = s.positions[account];
        if (amount > p.unrefined) revert InsufficientUnrefined(p.unrefined);
        p.unrefined -= amount;
        s.unrefinedRefined += amount;
    }

    /// @dev Pays referral credit out of the treasury share (never new emission). Pays at most what
    ///      the treasury share holds; the rest of the credit is simply not paid (docs/02 S9).
    function _creditReferral(address referrer, address invitee, uint256 amount) internal {
        AccountingStorage storage s = _accounting();
        uint256 credit = amount < s.treasuryPending ? amount : s.treasuryPending;
        if (credit == 0) return;
        s.treasuryPending -= credit;
        s.referralPaid += credit;
        s.positions[referrer].unrefined += credit;
        // forge-lint: disable-next-line(reentrancy-events)
        emit ReferralCredited(referrer, invitee, credit);
    }

    /// @dev Books MOHN minted straight from the reserve (the Market Open liquidity).
    function _mintFromReserve(uint256 amount) internal {
        _accounting().reserve -= amount;
    }

    /// @dev Takes `amount` from the dev (`dev == true`) or treasury share for a queued withdrawal.
    function _takeShare(bool dev, uint256 amount) internal {
        AccountingStorage storage s = _accounting();
        uint256 available = dev ? s.devPending : s.treasuryPending;
        if (amount > available) revert InsufficientShare(available);
        if (dev) s.devPending = available - amount;
        else s.treasuryPending = available - amount;
    }

    function _expiryHourOf(address account) internal view returns (uint64) {
        return _accounting().positions[account].expiryHour;
    }

    // ------------------------------------------------------------------ views

    /// @notice MOHN earned by `account` and not yet refined, as of the current block.
    /// @dev Simulates the pending checkpoint without writing state (unbounded loop: view only).
    function pendingOf(address account) public view returns (uint256) {
        AccountingStorage storage s = _accounting();
        Position storage p = s.positions[account];
        uint256 endAcc;
        if (p.expiryHour > s.currentHour) {
            (uint256 accNow, uint256 accAtExpiry, bool expired) = _simulate(p.expiryHour);
            endAcc = expired ? accAtExpiry : accNow;
        } else {
            endAcc = s.accAtHour[p.expiryHour];
        }
        uint256 pending = p.unrefined;
        if (endAcc > p.debt) pending += (uint256(p.dp) * (endAcc - p.debt)) / PREC;
        return pending;
    }

    /// @dev Replays the checkpoint loop up to now. Returns the live accumulator and, if the
    ///      boundary `watchHour` is crossed, the accumulator snapshot at that boundary.
    function _simulate(uint64 watchHour)
        private
        view
        returns (uint256 acc, uint256 accAtWatch, bool watchCrossed)
    {
        AccountingStorage storage s = _accounting();
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 nowTs = uint64(block.timestamp);
        uint64 last = s.lastUpdate;
        acc = s.acc;
        uint256 active = s.activeDp;
        uint256 res = s.reserve;
        uint256 emission = s.hourEmission;
        uint64 hour = s.currentHour;
        while (last < nowTs) {
            uint64 hourEnd = (hour + 1) * HOUR;
            uint64 segEnd = nowTs < hourEnd ? nowTs : hourEnd;
            if (active != 0) {
                uint256 amount = (emission * (segEnd - last)) / HOUR;
                uint256 miners = EmissionMath.minersShare(amount);
                acc += (miners * PREC) / active;
                res -= amount;
            }
            last = segEnd;
            if (segEnd >= hourEnd) {
                // segEnd <= hourEnd always: this means "boundary reached"
                ++hour;
                if (hour == watchHour) {
                    accAtWatch = acc;
                    watchCrossed = true;
                }
                active -= s.dpEndingAt[hour];
                emission = EmissionMath.hourlyEmission(res);
            }
        }
    }

    function positionOf(address account) external view returns (Position memory) {
        return _accounting().positions[account];
    }

    function reserve() external view returns (uint256) {
        return _accounting().reserve;
    }

    function hourEmission() external view returns (uint256) {
        return _accounting().hourEmission;
    }

    function activeDp() external view returns (uint256) {
        return _accounting().activeDp;
    }

    function currentHour() public view returns (uint64) {
        return _accounting().currentHour;
    }

    function lastUpdate() external view returns (uint64) {
        return _accounting().lastUpdate;
    }

    function minersDistributed() external view returns (uint256) {
        return _accounting().minersDistributed;
    }

    function devPending() external view returns (uint256) {
        return _accounting().devPending;
    }

    function treasuryPending() external view returns (uint256) {
        return _accounting().treasuryPending;
    }

    /// @notice Cumulative emission (recycled reserve included); World Depth = emitted / 1,000 MOHN.
    function emitted() public view returns (uint256) {
        return _accounting().emitted;
    }

    function burnedForever() external view returns (uint256) {
        return _accounting().burnedForever;
    }

    function unrefinedSpent() external view returns (uint256) {
        return _accounting().unrefinedSpent;
    }

    function unrefinedRefined() external view returns (uint256) {
        return _accounting().unrefinedRefined;
    }

    function referralPaid() external view returns (uint256) {
        return _accounting().referralPaid;
    }

    /// @notice MOHN credited to miners during genesis (recorded at the Market Open boundary).
    function genesisMinerAccrual() public view returns (uint256) {
        return _accounting().minersAtSnapshot;
    }

    function accAtHour(uint64 hour) external view returns (uint256) {
        return _accounting().accAtHour[hour];
    }

    function dpEndingAt(uint64 hour) external view returns (uint256) {
        return _accounting().dpEndingAt[hour];
    }
}
