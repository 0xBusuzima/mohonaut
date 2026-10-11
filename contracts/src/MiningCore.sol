// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {
    AccessControlUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {MiningAccounting} from "./MiningAccounting.sol";
import {SiteMath} from "./lib/SiteMath.sol";
import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";
import {IRevenueRouter} from "./interfaces/IRevenueRouter.sol";

/// @title MiningCore
/// @notice Player-facing core of Mohonaut. Phase 2.3 scope: registration (free Pilot Rig) and
///         diesel fuel bought with ETH (docs/02 §5, §11; docs/09 §3).
/// @dev Fuel model: each site has a tank (litres, WAD) and a burn rate (ℓ/h, WAD) from its active
///      rigs. Fuel burns only from genesis on and only while the site's DP is active, i.e. up to
///      the position's expiry hour boundary; the fractional-hour remainder stays in the tank.
///      Consumption rounds up and runtime rounds down (protocol-favourable).
///      Roles are minimal here; Phase 2.7 wires the Timelock, Guardian and parameter bounds.
contract MiningCore is
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardTransient,
    MiningAccounting
{
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    uint64 public constant PREFILL_WINDOW = 24 hours;
    uint64 public constant GENESIS_DURATION = 72 hours;
    /// @notice During pre-fill and genesis a tank may last at most until Market Open + this.
    uint64 public constant GENESIS_TANK_GRACE = 24 hours;
    /// @notice Outside genesis a tank holds at most `capacity × MAX_TANK_HOURS` litres.
    uint256 public constant MAX_TANK_HOURS = 720;
    /// @notice ETH/USD heartbeat on Robinhood Chain is 24 h; 2 h buffer (docs/ZINCIR_DOGRULAMA.md).
    uint256 public constant ORACLE_STALENESS = 26 hours;
    uint256 public constant SEQUENCER_GRACE = 1 hours;

    /// @notice The free starter rig every site receives on registration.
    uint128 public constant PILOT_RIG_DP = 10;
    uint256 public constant PILOT_RIG_BURN = 0.25e18; // ℓ/h

    struct Site {
        bool registered;
        uint8 level;
        address referrer;
        uint64 lastFuelSettle;
        uint128 dp; // active drill power
        uint256 burn; // active burn rate, ℓ/h (WAD)
        uint256 tank; // litres (WAD)
        uint256 fuelSpentWei;
    }

    /// @custom:storage-location erc7201:mohonaut.storage.MiningCore
    struct CoreStorage {
        address token;
        IRevenueRouter router;
        IAggregatorV3 ethUsdFeed;
        IAggregatorV3 sequencerFeed; // address(0): no uptime feed on this chain (checked 2026-10-10)
        uint64 genesisTime;
        uint256 fuelPriceUsdWad; // USD per litre, 18 decimals
        mapping(address account => Site) sites;
    }

    // keccak256(abi.encode(uint256(keccak256("mohonaut.storage.MiningCore")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant CORE_STORAGE_SLOT =
        0x23f0141ec1bbecd7265da6fbc91f7278ae21b7e83f5560ce12ee55220b9da600;

    event Registered(address indexed account, address indexed referrer);
    event FuelBought(address indexed account, uint256 ethIn, uint256 litres, uint64 expiryHour);

    error ZeroAddress();
    error PreFillNotOpen();
    error ZeroValue();
    error OracleInvalid();
    error OracleStale();
    error SequencerDown();
    error TankCapExceeded(uint256 maxLitres);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address admin,
        address token_,
        address router_,
        address ethUsdFeed_,
        address sequencerFeed_,
        uint64 genesisTime_,
        uint256 fuelPriceUsdWad_
    ) external initializer {
        if (
            admin == address(0) || token_ == address(0) || router_ == address(0)
                || ethUsdFeed_ == address(0) || fuelPriceUsdWad_ == 0
        ) revert ZeroAddress();
        __AccessControl_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
        _initAccounting(genesisTime_);

        CoreStorage storage c = _core();
        c.token = token_;
        c.router = IRevenueRouter(router_);
        c.ethUsdFeed = IAggregatorV3(ethUsdFeed_);
        c.sequencerFeed = IAggregatorV3(sequencerFeed_);
        c.genesisTime = genesisTime_;
        c.fuelPriceUsdWad = fuelPriceUsdWad_;
    }

    function _core() private pure returns (CoreStorage storage c) {
        assembly {
            c.slot := CORE_STORAGE_SLOT
        }
    }

    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}

    // ------------------------------------------------------------------ fuel

    /// @notice Buys diesel with ETH. The first purchase also registers the site and its free
    ///         Pilot Rig, so a new player needs exactly one transaction (docs/09 §3).
    /// @param referrer Set once, on registration only; ignored afterwards or if it is the caller.
    function buyFuel(address referrer) external payable nonReentrant {
        CoreStorage storage c = _core();
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp + PREFILL_WINDOW < c.genesisTime) revert PreFillNotOpen();
        if (msg.value == 0) revert ZeroValue();
        _requireCheckpointed();

        Site storage s = c.sites[msg.sender];
        if (!s.registered) _register(s, msg.sender, referrer);
        _settleFuel(c, s, msg.sender);

        uint256 litres = _litresFor(c, msg.value);
        uint256 newTank = s.tank + litres;
        uint256 maxTank = _maxTank(c, s);
        if (newTank > maxTank) revert TankCapExceeded(maxTank);
        s.tank = newTank;
        s.fuelSpentWei += msg.value;
        uint64 expiryHour = _refreshPosition(c, s, msg.sender);

        // The only earlier external calls are view reads of the price feeds (staticcall).
        // forge-lint: disable-next-line(reentrancy-events)
        emit FuelBought(msg.sender, msg.value, litres, expiryHour);
        // Interaction last (CEI). The router is fixed at initialization (later: Timelock only),
        // never user-supplied, and buyFuel is nonReentrant.
        // forge-lint: disable-next-line(arbitrary-send-eth)
        c.router.deposit{value: msg.value}();
    }

    function _register(Site storage s, address account, address referrer) private {
        s.registered = true;
        s.level = 1;
        if (referrer != account) s.referrer = referrer;
        s.dp = PILOT_RIG_DP;
        s.burn = PILOT_RIG_BURN;
        // forge-lint: disable-next-line(unsafe-typecast)
        s.lastFuelSettle = uint64(block.timestamp);
        // forge-lint: disable-next-line(reentrancy-events)
        emit Registered(account, s.referrer);
    }

    /// @dev Burns fuel for the time the site's DP was active since the last fuel settlement.
    function _settleFuel(CoreStorage storage c, Site storage s, address account) private {
        uint256 from = Math.max(s.lastFuelSettle, c.genesisTime);
        uint256 activeUntil = uint256(_expiryHourOf(account)) * HOUR;
        uint256 to = Math.min(block.timestamp, activeUntil);
        if (to > from && s.burn != 0) {
            uint256 burned = Math.mulDiv(s.burn, to - from, HOUR, Math.Rounding.Ceil);
            s.tank = burned >= s.tank ? 0 : s.tank - burned;
        }
        // forge-lint: disable-next-line(unsafe-typecast)
        s.lastFuelSettle = uint64(block.timestamp);
    }

    /// @dev Recomputes the fuel expiry hour and pushes DP + expiry into the accounting core.
    function _refreshPosition(CoreStorage storage c, Site storage s, address account)
        private
        returns (uint64 expiryHour)
    {
        if (s.burn != 0 && s.tank != 0 && s.dp != 0) {
            uint256 runFrom = Math.max(block.timestamp, c.genesisTime);
            uint256 runSeconds = Math.mulDiv(s.tank, HOUR, s.burn); // rounds down
            // forge-lint: disable-next-line(unsafe-typecast)
            expiryHour = uint64((runFrom + runSeconds) / HOUR);
        }
        _setPosition(account, s.dp, expiryHour);
    }

    /// @dev Maximum tank: during pre-fill/genesis the tank may only last until Market Open + 24 h
    ///      (docs/02 §11); afterwards `capacity(level) × MAX_TANK_HOURS`.
    function _maxTank(CoreStorage storage c, Site storage s) private view returns (uint256) {
        uint256 capacityTank = SiteMath.fuelLineCapacity(s.level) * MAX_TANK_HOURS;
        uint256 marketOpen = uint256(c.genesisTime) + GENESIS_DURATION;
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp >= marketOpen) return capacityTank;
        uint256 runFrom = Math.max(block.timestamp, c.genesisTime);
        uint256 genesisLimit = (s.burn * (marketOpen + GENESIS_TANK_GRACE - runFrom)) / HOUR;
        return Math.min(capacityTank, genesisLimit);
    }

    /// @dev litres = wei · (ETH/USD) / (USD per litre). Reverts on a bad, stale or unsafe price.
    function _litresFor(CoreStorage storage c, uint256 weiAmount) private view returns (uint256) {
        uint256 ethUsdWad = _ethUsdWad(c);
        return Math.mulDiv(weiAmount, ethUsdWad, c.fuelPriceUsdWad);
    }

    function _ethUsdWad(CoreStorage storage c) private view returns (uint256) {
        if (address(c.sequencerFeed) != address(0)) {
            // Only status and startedAt matter for an uptime feed.
            // forge-lint: disable-next-line(unused-return)
            (, int256 status, uint256 startedAt,,) = c.sequencerFeed.latestRoundData();
            // forge-lint: disable-next-line(block-timestamp)
            if (status != 0 || block.timestamp - startedAt <= SEQUENCER_GRACE) {
                revert SequencerDown();
            }
        }
        // roundId/answeredInRound checks are deprecated by Chainlink; staleness covers liveness.
        // forge-lint: disable-next-line(unused-return)
        (, int256 answer,, uint256 updatedAt,) = c.ethUsdFeed.latestRoundData();
        // forge-lint: disable-next-line(block-timestamp)
        if (answer <= 0 || updatedAt > block.timestamp) revert OracleInvalid();
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp - updatedAt > ORACLE_STALENESS) revert OracleStale();
        uint8 dec = c.ethUsdFeed.decimals();
        // forge-lint: disable-next-line(unsafe-typecast)
        uint256 price = uint256(answer);
        return dec <= 18 ? price * 10 ** (18 - dec) : price / 10 ** (dec - 18);
    }

    // ------------------------------------------------------------------ views

    function siteOf(address account) external view returns (Site memory) {
        return _core().sites[account];
    }

    /// @notice Litres currently in `account`'s tank, as if fuel were settled now.
    function tankOf(address account) external view returns (uint256) {
        CoreStorage storage c = _core();
        Site storage s = c.sites[account];
        uint256 from = Math.max(s.lastFuelSettle, c.genesisTime);
        uint256 activeUntil = uint256(_expiryHourOf(account)) * HOUR;
        uint256 to = Math.min(block.timestamp, activeUntil);
        if (to <= from || s.burn == 0) return s.tank;
        uint256 burned = Math.mulDiv(s.burn, to - from, HOUR, Math.Rounding.Ceil);
        return burned >= s.tank ? 0 : s.tank - burned;
    }

    /// @notice Litres that `weiAmount` buys at the current oracle price.
    function quoteLitres(uint256 weiAmount) external view returns (uint256) {
        return _litresFor(_core(), weiAmount);
    }

    function fuelPriceUsdWad() external view returns (uint256) {
        return _core().fuelPriceUsdWad;
    }

    function genesisTime() external view returns (uint64) {
        return _core().genesisTime;
    }

    function marketOpenTime() external view returns (uint64) {
        return _core().genesisTime + GENESIS_DURATION;
    }

    function token() external view returns (address) {
        return _core().token;
    }

    function router() external view returns (address) {
        return address(_core().router);
    }
}
