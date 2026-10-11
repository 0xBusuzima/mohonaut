// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {
    AccessControlUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";

import {MiningAccounting} from "./MiningAccounting.sol";
import {SiteMath} from "./lib/SiteMath.sol";
import {VrgdaMath} from "./lib/VrgdaMath.sol";
import {MarketOpenMath} from "./lib/MarketOpenMath.sol";
import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";
import {IMohnToken} from "./interfaces/IMohnToken.sol";
import {ILiquidityManager} from "./interfaces/ILiquidityManager.sol";
import {IRevenueRouter} from "./interfaces/IRevenueRouter.sol";

/// @title MiningCore
/// @notice Player-facing core of Mohonaut: registration (free Pilot Rig), diesel fuel bought with
///         ETH (docs/02 S5, S11; docs/09 S3), rigs and drill sites bought with MOHN
///         (docs/02 S6-S7), the refinery and referral credit (docs/02 S8-S9), the dev and
///         treasury withdrawals (docs/02 S3.3), and Market Open (docs/02 S11).
/// @dev Fuel model: each site has a tank (litres, WAD) and a burn rate (L/h, WAD) from its active
///      rigs. Fuel burns only from genesis on and only while the site's DP is active, i.e. up to
///      the position's expiry hour boundary; the fractional-hour remainder stays in the tank.
///      Consumption rounds up and runtime rounds down (protocol-favourable).
///      Capex model: rigs are priced in MOHN per DP unit by a LinearVRGDA (VrgdaMath); site
///      upgrades cost 150 * L^2.2 * idx with idx = clamp(p / p0, 0.25, 4). Payment order: scrap
///      credit, then unrefined credit, then (opt-in) wallet tokens; every MOHN spent is 80 % burned
///      forever and 20 % returned to the reserve. The catalog only grows: existing machine types
///      never change (invariant M2).
///      Every mint goes through the hourly mint breaker (docs/02 S2, invariant B1): if the
///      MOHN minted in the last 60-65 minutes would exceed 150K, the breaker trips instead of
///      minting and all mint paths stop until the admin (Phase 2.7: the Timelock) resets it.
///      Roles (docs/03 S3.8): DEFAULT_ADMIN_ROLE and CATALOG_ROLE = the 96 h Timelock (bounded,
///      rate-limited parameters, catalog, breaker reset, unpause); UPGRADER_ROLE = the 7-day
///      Timelock; GUARDIAN_ROLE = the Guardian Safe, which can only pause for at most 72 hours.
// False positive: buyFuel forwards every wei to the router in the same call, so the core never
// holds ETH (proved by invariant_routerReceivesAllFuelEth).
// aderyn-fp-next-line(contract-locks-ether)
contract MiningCore is
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardTransient,
    MiningAccounting
{
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    /// @notice Adds machine generations. Phase 2.7 hands it to the Timelock.
    bytes32 public constant CATALOG_ROLE = keccak256("CATALOG_ROLE");
    /// @notice Pauses player actions for at most 72 hours; cannot unpause (invariant P2).
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    uint64 public constant PREFILL_WINDOW = 24 hours;
    uint64 public constant GENESIS_DURATION = 72 hours;
    /// @notice During pre-fill and genesis a tank may last at most until Market Open + this.
    uint64 public constant GENESIS_TANK_GRACE = 24 hours;
    /// @notice Outside genesis a tank holds at most `capacity x maxTankHours` litres.
    uint16 public constant INITIAL_MAX_TANK_HOURS = 720;
    /// @notice ETH/USD heartbeat on Robinhood Chain is 24 h; 2 h buffer (docs/ZINCIR_DOGRULAMA.md).
    uint32 public constant INITIAL_ORACLE_STALENESS = 26 hours;
    uint256 public constant SEQUENCER_GRACE = 1 hours;

    /// @notice The free starter rig every site receives on registration (catalog type 0).
    uint256 public constant PILOT_RIG_TYPE = 0;
    uint32 public constant PILOT_RIG_DP = 10;
    uint128 public constant PILOT_RIG_BURN = 0.25e18; // L/h

    /// @notice VRGDA start price, MOHN per DP unit (fixed at deploy, docs/02 S6.2).
    uint256 public constant P0 = 10e18;
    uint256 public constant INITIAL_K = 0.15e18;
    uint256 public constant INITIAL_R = 2000e18; // DP units per day (WAD)
    uint256 public constant MAX_UNITS_PER_TX = 10_000;
    /// @notice Scrapping a rig credits 20 % of its DP at the current unit price (docs/02 S6.4).
    uint256 public constant SCRAP_CREDIT_BPS = 2000;
    uint256 public constant IDX_MIN = 0.25e18;
    uint256 public constant IDX_MAX = 4e18;

    /// @notice New generations: at most 8 types each, 45 days apart, efficiency at most +15 % over
    ///         the best so far, and only once the World Depth reaches the generation's stratum.
    uint256 public constant MAX_TYPES_PER_GENERATION = 8;
    uint256 public constant GENERATION_INTERVAL = 45 days;
    uint256 public constant MAX_EFFICIENCY_GAIN_BPS = 11_500;
    uint256 public constant MAX_PREMIUM_BPS = 10_000;
    /// @notice World Depth: one metre per 1,000 MOHN emitted (docs/02 S3.4).
    uint256 public constant MOHN_PER_METRE = 1000e18;

    /// @notice Referral: 3 % of the invitee accrual, paid from the treasury share, once the invitee
    ///         has bought at least 0.003 ETH of fuel and while the referrer still has fuel
    ///         (docs/02 S9).
    uint256 public constant REFERRAL_BPS = 300;
    uint256 public constant REFERRAL_MIN_FUEL_WEI = 0.003 ether;
    /// @notice Refinery defaults (docs/02 S8); Phase 2.7 adds bounded Timelock setters.
    uint16 public constant INITIAL_FAST_REFINE_FEE_BPS = 800;
    uint64 public constant INITIAL_REFINE_DELAY = 72 hours;
    /// @notice Dev and treasury withdrawals: queued only, at most 100K per request and per UTC day.
    uint256 public constant SHARE_DAILY_LIMIT = 100_000e18;
    /// @notice Hourly mint breaker: 150K over a 60-65 minute window of 5-minute buckets.
    uint256 public constant MINT_BREAKER_LIMIT = 150_000e18;
    uint256 public constant MINT_BUCKET = 5 minutes;
    uint256 public constant MINT_BUCKETS = 13;

    /// @notice Guardian pause length, the minimum gap between two Guardian pauses, and the longest
    ///         pause the Timelock may set (docs/04 S5.2: no permanent lock-up).
    uint64 public constant GUARDIAN_PAUSE = 72 hours;
    uint64 public constant GUARDIAN_COOLDOWN = 7 days;
    uint64 public constant MAX_TIMELOCK_PAUSE = 30 days;
    /// @notice Site upgrade cost scale (docs/02 S12 "site cost base"), 1x at deployment.
    uint16 public constant INITIAL_SITE_COST_SCALE_BPS = 10_000;

    /// @notice Parameters the Timelock may change, each within coded bounds and a rate limit
    ///         (docs/02 S12, invariant P1). Everything else is immutable.
    enum Param {
        FuelPrice, // USD per litre (WAD): 0.03-0.50, +-25 % per 7 days
        VrgdaR, // DP units per day (WAD): 1,000-100,000, +-25 % per 30 days, re-anchored
        VrgdaK, // daily price decay (WAD): 0.05-0.35, +-25 % per 30 days, re-anchored
        FastRefineFee, // bps: 0-1,200, once per 7 days
        RefineDelay, // seconds: 24-168 hours, once per 7 days
        MaxTankHours, // hours: 168-2,160, once per 7 days
        OracleStaleness, // seconds: 25-30 hours, once per 7 days
        SiteCostScale // bps: 5,000-20,000, +-25 % per 30 days
    }

    struct Site {
        bool registered;
        uint8 level;
        address referrer;
        uint64 lastFuelSettle;
        uint128 dp; // active drill power
        uint256 burn; // active burn rate, L/h (WAD)
        uint256 tank; // litres (WAD)
        uint256 fuelSpentWei;
        uint32 rigs; // rigs owned (each takes a pad)
        uint256 scrapCredit; // MOHN-denominated, non-transferable, spendable on capex only
    }

    /// @dev `generation` is assigned by the contract when a type is added.
    struct MachineType {
        uint32 dp;
        uint16 premiumBps;
        uint8 minLevel;
        uint8 generation;
        uint128 burn; // L/h (WAD)
    }

    struct Rigs {
        uint32 owned;
        uint32 active;
    }

    struct RefineRequest {
        uint128 amount; // 0 once finalized
        uint64 readyAt;
    }

    struct ShareWithdrawals {
        uint64 day;
        uint192 inDay;
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
        int256 vrgdaLnAnchor; // ln of the price at the anchor (ln(P0) before any change), WAD
        int256 vrgdaDecay; // ln(1 - k), WAD, negative
        uint256 vrgdaR; // DP units per day (WAD)
        uint256 vrgdaSold; // DP units sold
        MachineType[] catalog;
        uint8 generations;
        uint64 lastGenerationTime;
        uint256 bestEfficiency; // DP per L/h, WAD
        mapping(address account => mapping(uint256 typeId => Rigs)) rigs;
        address devRecipient;
        address treasuryRecipient;
        uint16 fastRefineFeeBps;
        uint64 refineDelay;
        bool mintBreakerTripped;
        uint256 refineQueued; // MOHN waiting in refine queues
        ShareWithdrawals devWithdrawals;
        ShareWithdrawals treasuryWithdrawals;
        uint256[13] mintBuckets; // (bucket index << 192) | MOHN minted in that 5-minute bucket
        mapping(address account => RefineRequest[]) refineQueue;
        uint256 genesisFuelUsd; // USD (WAD) of fuel bought before Market Open
        address liquidityManager;
        bool marketOpened;
        uint64 vrgdaAnchorTime; // genesis before any change of r or k
        uint256 vrgdaAnchorSold;
        uint256 vrgdaK; // WAD
        uint16 maxTankHours;
        uint32 oracleStaleness;
        uint16 siteCostScaleBps;
        uint64 pausedUntil;
        uint64 lastGuardianPause;
        mapping(uint256 key => uint64 timestamp) changedAt; // rate limits (Param index, or 100+)
    }

    // keccak256(abi.encode(uint256(keccak256("mohonaut.storage.MiningCore")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant CORE_STORAGE_SLOT =
        0x23f0141ec1bbecd7265da6fbc91f7278ae21b7e83f5560ce12ee55220b9da600;

    event Registered(address indexed account, address indexed referrer);
    event FuelBought(address indexed account, uint256 ethIn, uint256 litres, uint64 expiryHour);
    event MachineTypeAdded(
        uint256 indexed typeId,
        uint8 indexed generation,
        uint32 dp,
        uint128 burn,
        uint16 premiumBps,
        uint8 minLevel
    );
    event MachinesBought(address indexed account, uint256 indexed typeId, uint32 qty, uint256 cost);
    event MachinesScrapped(
        address indexed account, uint256 indexed typeId, uint32 qty, uint256 credit
    );
    event ActiveRigsSet(address indexed account, uint256 indexed typeId, uint32 active);
    event SiteUpgraded(address indexed account, uint8 level, uint256 cost);
    event Paid(
        address indexed account, uint256 fromCredit, uint256 fromUnrefined, uint256 fromWallet
    );
    event Refined(address indexed account, uint256 amount, uint256 minted, uint256 fee);
    event RefineQueued(address indexed account, uint256 indexed id, uint256 amount, uint64 readyAt);
    event RefineFinalized(address indexed account, uint256 indexed id, uint256 amount);
    event MintBreakerTripped(uint256 windowTotal);
    event MintBreakerReset();
    event LiquidityManagerWired(address indexed liquidityManager);
    event ParamChanged(Param indexed param, uint256 oldValue, uint256 newValue);
    event VrgdaReanchored(int256 lnAnchor, uint64 anchorTime, uint256 anchorSold);
    event RecipientsChanged(address devRecipient, address treasuryRecipient);
    event SequencerFeedChanged(address feed);
    event Paused(address indexed by, uint64 until);
    event Unpaused();
    event MarketOpened(
        uint256 p0Usd, uint256 ethUsd, uint256 polEth, uint256 mohnLp, uint160 sqrtPriceX96
    );

    error ZeroAddress();
    error PreFillNotOpen();
    error ZeroValue();
    error OracleInvalid();
    error OracleStale();
    error SequencerDown();
    error TankCapExceeded(uint256 maxLitres);
    error NotRegistered();
    error UnknownMachine(uint256 typeId);
    error TooManyUnits(uint256 units);
    error LevelTooLow(uint8 required);
    error NoFreePad();
    error FuelLineFull(uint256 burn, uint256 capacity);
    error CostAboveMax(uint256 cost);
    error InsufficientCredit(uint256 shortfall);
    error NotOwned();
    error BadGeneration();
    error BadMachine(uint256 index);
    error StratumNotReached(uint256 generation);
    error GenerationTooSoon();
    error RefineClosed();
    error UnknownRequest();
    error AlreadyFinalized();
    error NotReady(uint64 readyAt);
    error NotRecipient();
    error ShareLimitExceeded(uint256 remainingToday);
    error MintPaused();
    error MarketNotOpenYet();
    error MarketAlreadyOpen();
    error AlreadyWired();
    error ParamOutOfBounds(uint256 min, uint256 max);
    error ParamStepTooLarge(uint256 min, uint256 max);
    error RateLimited(uint64 nextChange);
    error ProtocolPaused(uint64 until);
    error PauseCooldown(uint64 next);
    error PauseTooLong(uint64 max);

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
        uint256 fuelPriceUsdWad_,
        address devRecipient_,
        address treasuryRecipient_
    ) external initializer {
        if (
            admin == address(0) || token_ == address(0) || router_ == address(0)
                || ethUsdFeed_ == address(0) || fuelPriceUsdWad_ == 0 || devRecipient_ == address(0)
                || treasuryRecipient_ == address(0)
        ) revert ZeroAddress();
        __AccessControl_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
        _grantRole(CATALOG_ROLE, admin);
        _initAccounting(genesisTime_, (genesisTime_ + GENESIS_DURATION) / HOUR);

        CoreStorage storage c = _core();
        c.token = token_;
        c.router = IRevenueRouter(router_);
        c.ethUsdFeed = IAggregatorV3(ethUsdFeed_);
        c.sequencerFeed = IAggregatorV3(sequencerFeed_);
        c.genesisTime = genesisTime_;
        c.fuelPriceUsdWad = fuelPriceUsdWad_;

        // forge-lint: disable-next-line(unsafe-typecast)
        c.vrgdaLnAnchor = FixedPointMathLib.lnWad(int256(P0));
        // forge-lint: disable-next-line(unsafe-typecast)
        c.vrgdaDecay = FixedPointMathLib.lnWad(int256(1e18 - INITIAL_K));
        c.vrgdaK = INITIAL_K;
        c.vrgdaR = INITIAL_R;
        c.vrgdaAnchorTime = genesisTime_;
        c.maxTankHours = INITIAL_MAX_TANK_HOURS;
        c.oracleStaleness = INITIAL_ORACLE_STALENESS;
        c.siteCostScaleBps = INITIAL_SITE_COST_SCALE_BPS;

        // Gen-1 catalog (docs/02 S6.1). Type 0 is the free Pilot Rig and is never sold.
        _addMachine(c, MachineType(PILOT_RIG_DP, 0, 1, 1, PILOT_RIG_BURN));
        _addMachine(c, MachineType(50, 0, 1, 1, 1e18)); // Rotary Rig
        _addMachine(c, MachineType(150, 800, 3, 1, 2.5e18)); // Top Drive
        _addMachine(c, MachineType(420, 1700, 6, 1, 6e18)); // Diamond Core Drill
        _addMachine(c, MachineType(1000, 2700, 10, 1, 12.5e18)); // Turbodrill
        _addMachine(c, MachineType(2700, 4000, 15, 1, 30e18)); // Plasma Bore
        c.generations = 1;
        c.lastGenerationTime = genesisTime_;
        c.bestEfficiency = 90e18; // Plasma Bore: 2,700 DP / 30 L/h

        c.devRecipient = devRecipient_;
        c.treasuryRecipient = treasuryRecipient_;
        c.fastRefineFeeBps = INITIAL_FAST_REFINE_FEE_BPS;
        c.refineDelay = INITIAL_REFINE_DELAY;
    }

    function _core() private pure returns (CoreStorage storage c) {
        assembly {
            c.slot := CORE_STORAGE_SLOT
        }
    }

    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}

    // ------------------------------------------------------------------ fuel

    /// @notice Buys diesel with ETH. The first purchase also registers the site and its free
    ///         Pilot Rig, so a new player needs exactly one transaction (docs/09 S3).
    /// @param referrer Set once, on registration only; ignored afterwards or if it is the caller.
    function buyFuel(address referrer) external payable nonReentrant whenNotPaused {
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
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < uint256(c.genesisTime) + GENESIS_DURATION) {
            c.genesisFuelUsd += Math.mulDiv(litres, c.fuelPriceUsdWad, 1e18);
        }
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
        s.rigs = 1;
        _core().rigs[account][PILOT_RIG_TYPE] = Rigs(1, 1);
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
    ///      (docs/02 S11); afterwards `capacity(level) x MAX_TANK_HOURS`.
    function _maxTank(CoreStorage storage c, Site storage s) private view returns (uint256) {
        uint256 capacityTank = SiteMath.fuelLineCapacity(s.level) * c.maxTankHours;
        uint256 marketOpen = uint256(c.genesisTime) + GENESIS_DURATION;
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp >= marketOpen) return capacityTank;
        uint256 runFrom = Math.max(block.timestamp, c.genesisTime);
        uint256 genesisLimit = (s.burn * (marketOpen + GENESIS_TANK_GRACE - runFrom)) / HOUR;
        return Math.min(capacityTank, genesisLimit);
    }

    /// @dev litres = wei * (ETH/USD) / (USD per litre). Reverts on a bad, stale or unsafe price.
    function _litresFor(CoreStorage storage c, uint256 weiAmount) private view returns (uint256) {
        uint256 ethUsdWad = _ethUsdWad(c);
        return Math.mulDiv(weiAmount, ethUsdWad, c.fuelPriceUsdWad);
    }

    function _ethUsdWad(CoreStorage storage c) private view returns (uint256) {
        if (address(c.sequencerFeed) != address(0)) {
            // Only status and startedAt matter for an uptime feed.
            // slither-disable-start unused-return
            // forge-lint: disable-next-line(unused-return)
            (, int256 status, uint256 startedAt,,) = c.sequencerFeed.latestRoundData();
            // slither-disable-end unused-return
            // forge-lint: disable-next-line(block-timestamp)
            if (status != 0 || block.timestamp - startedAt <= SEQUENCER_GRACE) {
                revert SequencerDown();
            }
        }
        // roundId/answeredInRound checks are deprecated by Chainlink; staleness covers liveness.
        // slither-disable-start unused-return
        // forge-lint: disable-next-line(unused-return)
        (, int256 answer,, uint256 updatedAt,) = c.ethUsdFeed.latestRoundData();
        // slither-disable-end unused-return
        // forge-lint: disable-next-line(block-timestamp)
        if (answer <= 0 || updatedAt > block.timestamp) revert OracleInvalid();
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp - updatedAt > c.oracleStaleness) revert OracleStale();
        uint8 dec = c.ethUsdFeed.decimals();
        // forge-lint: disable-next-line(unsafe-typecast)
        uint256 price = uint256(answer);
        return dec <= 18 ? price * 10 ** (18 - dec) : price / 10 ** (dec - 18);
    }

    // ------------------------------------------------------------------ rigs and site

    /// @notice Buys `qty` rigs of `typeId` at the VRGDA price and switches them on.
    /// @param maxCost Slippage guard on the total MOHN cost (before scrap credit).
    /// @param payFromWallet If the credits fall short, burn the rest from the caller's wallet
    ///        (needs an allowance or permit for this contract).
    function buyMachines(uint256 typeId, uint32 qty, uint256 maxCost, bool payFromWallet)
        external
        nonReentrant
        whenNotPaused
    {
        _requireCheckpointed();
        CoreStorage storage c = _core();
        Site storage s = _siteOf(c, msg.sender);
        if (typeId == PILOT_RIG_TYPE || typeId >= c.catalog.length) revert UnknownMachine(typeId);
        if (qty == 0) revert ZeroValue();
        MachineType memory m = c.catalog[typeId];
        uint256 units = uint256(m.dp) * qty;
        if (units > MAX_UNITS_PER_TX) revert TooManyUnits(units);
        if (s.level < m.minLevel) revert LevelTooLow(m.minLevel);
        if (uint256(s.rigs) + qty > SiteMath.slots(s.level)) revert NoFreePad();
        uint256 newBurn = s.burn + uint256(m.burn) * qty;
        _requireCapacity(newBurn, s.level);

        _settleFuel(c, s, msg.sender);
        _settle(msg.sender);
        uint256 cost = _machineCost(c, units, m.premiumBps);
        if (cost > maxCost) revert CostAboveMax(cost);

        c.vrgdaSold += units;
        Rigs storage r = c.rigs[msg.sender][typeId];
        r.owned += qty;
        r.active += qty;
        s.rigs += qty;
        // forge-lint: disable-next-line(unsafe-typecast)
        s.dp += uint128(units); // units <= MAX_UNITS_PER_TX
        s.burn = newBurn;
        uint256 fromWallet = _pay(s, msg.sender, cost, payFromWallet);
        _refreshPosition(c, s, msg.sender);
        // Only internal library calls precede (SiteMath, VrgdaMath, Math); the lint reads them as
        // external. The one real external call (wallet burn) comes after this event.
        // forge-lint: disable-next-line(reentrancy-events)
        emit MachinesBought(msg.sender, typeId, qty, cost);
        _burnFromWallet(c, msg.sender, fromWallet);
    }

    /// @notice Switches rigs of `typeId` on or off so that exactly `active` of them run.
    function setActiveRigs(uint256 typeId, uint32 active) external nonReentrant whenNotPaused {
        _requireCheckpointed();
        CoreStorage storage c = _core();
        Site storage s = _siteOf(c, msg.sender);
        if (typeId >= c.catalog.length) revert UnknownMachine(typeId);
        Rigs storage r = c.rigs[msg.sender][typeId];
        if (active > r.owned) revert NotOwned();
        MachineType memory m = c.catalog[typeId];

        _settleFuel(c, s, msg.sender);
        if (active > r.active) {
            uint32 on = active - r.active;
            uint256 newBurn = s.burn + uint256(m.burn) * on;
            _requireCapacity(newBurn, s.level);
            s.burn = newBurn;
            s.dp += uint128(m.dp) * on;
        } else {
            uint32 off = r.active - active;
            s.burn -= uint256(m.burn) * off;
            s.dp -= uint128(m.dp) * off;
        }
        r.active = active;
        _refreshPosition(c, s, msg.sender);
        // No external call in this function: only internal library calls (SiteMath, Math).
        // forge-lint: disable-next-line(reentrancy-events)
        emit ActiveRigsSet(msg.sender, typeId, active);
    }

    /// @notice Dismantles `qty` rigs of `typeId` (idle ones first) for a scrap credit of 20 % of
    ///         their DP at the current unit price. The free Pilot Rig earns no credit.
    function scrapMachines(uint256 typeId, uint32 qty) external nonReentrant whenNotPaused {
        _requireCheckpointed();
        CoreStorage storage c = _core();
        Site storage s = _siteOf(c, msg.sender);
        if (typeId >= c.catalog.length) revert UnknownMachine(typeId);
        Rigs storage r = c.rigs[msg.sender][typeId];
        if (qty == 0 || qty > r.owned) revert NotOwned();
        MachineType memory m = c.catalog[typeId];

        _settleFuel(c, s, msg.sender);
        uint32 owned = r.owned - qty;
        uint32 off = r.active > owned ? r.active - owned : 0;
        r.owned = owned;
        r.active -= off;
        s.rigs -= qty;
        s.burn -= uint256(m.burn) * off;
        s.dp -= uint128(m.dp) * off;

        uint256 credit = 0;
        if (typeId != PILOT_RIG_TYPE) {
            credit = (uint256(m.dp) * qty * _unitPrice(c) * SCRAP_CREDIT_BPS) / 10_000;
            s.scrapCredit += credit;
        }
        _refreshPosition(c, s, msg.sender);
        // No external call in this function: only internal library calls (VrgdaMath, Math).
        // forge-lint: disable-next-line(reentrancy-events)
        emit MachinesScrapped(msg.sender, typeId, qty, credit);
    }

    /// @notice Upgrades the caller's drill site by one level (more pads, larger fuel line).
    function upgradeSite(uint256 maxCost, bool payFromWallet) external nonReentrant whenNotPaused {
        _requireCheckpointed();
        CoreStorage storage c = _core();
        Site storage s = _siteOf(c, msg.sender);
        _settle(msg.sender);
        uint256 cost = _siteUpgradeCost(c, s.level);
        if (cost > maxCost) revert CostAboveMax(cost);
        uint8 level = s.level + 1;
        s.level = level;
        uint256 fromWallet = _pay(s, msg.sender, cost, payFromWallet);
        // Only internal library calls precede (SiteMath, VrgdaMath, Math); the lint reads them as
        // external. The one real external call (wallet burn) comes after this event.
        // forge-lint: disable-next-line(reentrancy-events)
        emit SiteUpgraded(msg.sender, level, cost);
        _burnFromWallet(c, msg.sender, fromWallet);
    }

    /// @notice Adds the next machine generation. Existing types never change (invariant M2).
    /// @dev The `generation` field of each entry is ignored and assigned here.
    function addMachineGeneration(MachineType[] calldata types) external onlyRole(CATALOG_ROLE) {
        uint256 count = types.length;
        if (count == 0 || count > MAX_TYPES_PER_GENERATION) revert BadGeneration();
        CoreStorage storage c = _core();
        uint8 generation = c.generations + 1;
        if (emitted() < _stratumThreshold(generation)) revert StratumNotReached(generation);
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < c.lastGenerationTime + GENERATION_INTERVAL) {
            revert GenerationTooSoon();
        }
        uint256 maxEfficiency = (c.bestEfficiency * MAX_EFFICIENCY_GAIN_BPS) / 10_000;
        uint256 best = c.bestEfficiency;
        // Validation inside the loop is intended: the whole generation is accepted or rejected
        // atomically, and the loop is bounded by MAX_TYPES_PER_GENERATION.
        for (uint256 i = 0; i < count; ++i) {
            MachineType calldata t = types[i];
            if (
                t.dp == 0 || t.dp > MAX_UNITS_PER_TX || t.burn == 0 || t.minLevel == 0
                    || t.minLevel > SiteMath.MAX_LEVEL || t.premiumBps > MAX_PREMIUM_BPS
            ) {
                // forge-lint: disable-next-line(require-revert-in-loop)
                revert BadMachine(i);
            }
            uint256 efficiency = (uint256(t.dp) * 1e36) / t.burn;
            // forge-lint: disable-next-line(require-revert-in-loop)
            if (efficiency > maxEfficiency) revert BadMachine(i);
            if (efficiency > best) best = efficiency;
            _addMachine(c, MachineType(t.dp, t.premiumBps, t.minLevel, generation, t.burn));
        }
        c.bestEfficiency = best;
        c.generations = generation;
        // forge-lint: disable-next-line(unsafe-typecast)
        c.lastGenerationTime = uint64(block.timestamp);
    }

    function _addMachine(CoreStorage storage c, MachineType memory m) private {
        uint256 typeId = c.catalog.length;
        c.catalog.push(m);
        // `push` is a storage operation, not an external call.
        // forge-lint: disable-start(reentrancy-events)
        emit MachineTypeAdded(typeId, m.generation, m.dp, m.burn, m.premiumBps, m.minLevel);
        // forge-lint: disable-end(reentrancy-events)
    }

    function _siteOf(CoreStorage storage c, address account) private view returns (Site storage s) {
        s = c.sites[account];
        if (!s.registered) revert NotRegistered();
    }

    function _requireCapacity(uint256 burn, uint8 level) private pure {
        uint256 capacity = SiteMath.fuelLineCapacity(level);
        if (burn > capacity) revert FuelLineFull(burn, capacity);
    }

    /// @dev Pays `cost`: scrap credit, then unrefined credit, then (opt-in) wallet tokens, which
    ///      the caller burns after all state changes. Caller must have settled the account.
    function _pay(Site storage s, address account, uint256 cost, bool payFromWallet)
        private
        returns (uint256 fromWallet)
    {
        uint256 fromCredit = Math.min(s.scrapCredit, cost);
        s.scrapCredit -= fromCredit;
        uint256 rest = cost - fromCredit;
        uint256 fromUnrefined = _spendUnrefined(account, rest);
        fromWallet = rest - fromUnrefined;
        if (fromWallet != 0 && !payFromWallet) revert InsufficientCredit(fromWallet);
        _settleSpend(rest);
        // forge-lint: disable-next-line(reentrancy-events)
        emit Paid(account, fromCredit, fromUnrefined, fromWallet);
    }

    /// @dev Interaction last. The token is our own immutable MohnToken (no hooks), set at
    ///      initialization and never user-supplied.
    function _burnFromWallet(CoreStorage storage c, address account, uint256 amount) private {
        if (amount != 0) IMohnToken(c.token).burnFrom(account, amount);
    }

    function _unitPrice(CoreStorage storage c) private view returns (uint256) {
        (uint256 elapsed, uint256 sold) = _sinceAnchor(c);
        return VrgdaMath.unitPrice(elapsed, sold, c.vrgdaLnAnchor, c.vrgdaDecay, c.vrgdaR);
    }

    function _sinceAnchor(CoreStorage storage c)
        private
        view
        returns (uint256 elapsed, uint256 sold)
    {
        // forge-lint: disable-next-line(block-timestamp)
        elapsed = block.timestamp > c.vrgdaAnchorTime ? block.timestamp - c.vrgdaAnchorTime : 0;
        sold = c.vrgdaSold - c.vrgdaAnchorSold;
    }

    /// @dev VRGDA batch cost of `units` DP with the tier premium. Rounds up.
    function _machineCost(CoreStorage storage c, uint256 units, uint16 premiumBps)
        private
        view
        returns (uint256)
    {
        uint256 batch = VrgdaMath.batchCost(_unitPrice(c), units, c.vrgdaDecay, c.vrgdaR);
        return FixedPointMathLib.mulDivUp(batch, 10_000 + premiumBps, 10_000);
    }

    /// @dev 150 * L^2.2 * idx with idx = clamp(p / P0, IDX_MIN, IDX_MAX). Rounds up. Reverts with
    ///      SiteMath.InvalidLevel at the top level.
    function _siteUpgradeCost(CoreStorage storage c, uint8 level) private view returns (uint256) {
        uint256 idx = Math.min(Math.max((_unitPrice(c) * 1e18) / P0, IDX_MIN), IDX_MAX);
        uint256 scaled = FixedPointMathLib.mulDivUp(SiteMath.upgradeCost(level), idx, 1e18);
        return FixedPointMathLib.mulDivUp(scaled, c.siteCostScaleBps, 10_000);
    }

    /// @dev Emission needed before `generation` (>= 2) may be added: the World Depth of its
    ///      stratum (docs/02 S3.4). Generations past VIII reuse The Core's threshold.
    function _stratumThreshold(uint256 generation) private pure returns (uint256) {
        uint32[7] memory metres = [uint32(2000), 6000, 12_262, 20_000, 35_000, 60_000, 85_000];
        return uint256(metres[Math.min(generation, 8) - 2]) * MOHN_PER_METRE;
    }

    // ------------------------------------------------------------------ refinery

    /// @notice Turns `amount` of unrefined credit into MOHN. Fast: now, minus the fast fee (half
    ///         burned forever, half back to the reserve). Standard: free, after the refine delay.
    ///         Closed during genesis (docs/02 S11).
    /// @dev If the mint breaker trips on a fast refine, nothing is refined and the call returns.
    function refine(uint256 amount, bool fast) external nonReentrant whenNotPaused {
        _requireCheckpointed();
        CoreStorage storage c = _core();
        _requireRefineOpen(c);
        if (amount == 0) revert ZeroValue();
        _settle(msg.sender);
        if (!fast) {
            _withdrawUnrefined(msg.sender, amount);
            _enqueue(c, msg.sender, amount);
            return;
        }
        uint256 fee = FixedPointMathLib.mulDivUp(amount, c.fastRefineFeeBps, 10_000);
        uint256 minted = amount - fee;
        if (!_admitMint(c, minted)) return;
        _withdrawUnrefined(msg.sender, amount);
        uint256 toReserve = fee / 2;
        _burnAndRecycle(fee - toReserve, toReserve);
        // forge-lint: disable-next-line(reentrancy-events)
        emit Refined(msg.sender, amount, minted, fee);
        IMohnToken(c.token).mint(msg.sender, minted);
    }

    /// @notice Mints a matured queued refine to its owner. Anyone (e.g. the keeper) may call.
    /// @dev If the mint breaker trips, the request stays queued and the call returns.
    function finalizeRefine(address account, uint256 id) external nonReentrant whenNotPaused {
        _requireCheckpointed();
        CoreStorage storage c = _core();
        RefineRequest[] storage queue = c.refineQueue[account];
        if (id >= queue.length) revert UnknownRequest();
        RefineRequest storage r = queue[id];
        uint256 amount = r.amount;
        if (amount == 0) revert AlreadyFinalized();
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < r.readyAt) revert NotReady(r.readyAt);
        if (!_admitMint(c, amount)) return;
        r.amount = 0;
        c.refineQueued -= amount;
        // forge-lint: disable-next-line(reentrancy-events)
        emit RefineFinalized(account, id, amount);
        IMohnToken(c.token).mint(account, amount);
    }

    /// @notice Queues `amount` of the dev share for the dev recipient (standard queue only).
    function withdrawDevShare(uint256 amount) external nonReentrant whenNotPaused {
        CoreStorage storage c = _core();
        if (msg.sender != c.devRecipient) revert NotRecipient();
        _withdrawShare(c, c.devWithdrawals, true, amount);
    }

    /// @notice Queues `amount` of the treasury share for the treasury recipient (standard queue).
    function withdrawTreasuryShare(uint256 amount) external nonReentrant whenNotPaused {
        CoreStorage storage c = _core();
        if (msg.sender != c.treasuryRecipient) revert NotRecipient();
        _withdrawShare(c, c.treasuryWithdrawals, false, amount);
    }

    /// @notice Re-opens the mint paths after the breaker tripped. Phase 2.7: Timelock only.
    function resetMintBreaker() external onlyRole(DEFAULT_ADMIN_ROLE) {
        CoreStorage storage c = _core();
        c.mintBreakerTripped = false;
        delete c.mintBuckets;
        // `delete` is a storage operation, not an external call.
        // forge-lint: disable-next-line(reentrancy-events)
        emit MintBreakerReset();
    }

    function _withdrawShare(
        CoreStorage storage c,
        ShareWithdrawals storage w,
        bool dev,
        uint256 amount
    ) private {
        _requireCheckpointed();
        _requireRefineOpen(c);
        if (amount == 0) revert ZeroValue();
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 day = uint64(block.timestamp / 1 days);
        uint256 inDay = w.day < day ? 0 : w.inDay; // days only move forward
        if (inDay + amount > SHARE_DAILY_LIMIT) {
            revert ShareLimitExceeded(SHARE_DAILY_LIMIT - inDay);
        }
        w.day = day;
        w.inDay = SafeCast.toUint192(inDay + amount); // <= SHARE_DAILY_LIMIT
        _takeShare(dev, amount);
        _enqueue(c, msg.sender, amount);
    }

    function _requireRefineOpen(CoreStorage storage c) private view {
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < uint256(c.genesisTime) + GENESIS_DURATION) revert RefineClosed();
    }

    function _enqueue(CoreStorage storage c, address account, uint256 amount) private {
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 readyAt = uint64(block.timestamp) + c.refineDelay;
        RefineRequest[] storage queue = c.refineQueue[account];
        queue.push(RefineRequest(SafeCast.toUint128(amount), readyAt)); // amount <= CAP
        c.refineQueued += amount;
        // forge-lint: disable-next-line(reentrancy-events)
        emit RefineQueued(account, queue.length - 1, amount, readyAt);
    }

    /// @dev Hourly mint breaker (B1). Records `amount` in the current 5-minute bucket and returns
    ///      true; or, if the last 13 buckets plus `amount` would exceed the limit, trips the breaker
    ///      and returns false without recording (the caller then changes nothing else, so the trip
    ///      persists). Reverts while tripped.
    function _admitMint(CoreStorage storage c, uint256 amount) private returns (bool) {
        if (c.mintBreakerTripped) revert MintPaused();
        // Not randomness: `bucket % MINT_BUCKETS` indexes a ring buffer of time buckets.
        // slither-disable-start weak-prng
        uint256 bucket = block.timestamp / MINT_BUCKET;
        uint256 total = amount;
        uint256 current = 0;
        // Bucket indices come from block.timestamp by design: the breaker is a time window.
        // forge-lint: disable-next-line(block-timestamp)
        for (uint256 i = 0; i < MINT_BUCKETS && i <= bucket; ++i) {
            uint256 packed = c.mintBuckets[(bucket - i) % MINT_BUCKETS];
            // forge-lint: disable-next-line(block-timestamp)
            if (packed >> 192 != bucket - i) continue; // stale slot from an older window
            // Intended truncation: the low 192 bits hold the bucket amount.
            // forge-lint: disable-next-line(unsafe-typecast)
            uint256 minted = uint192(packed);
            total += minted;
            if (i == 0) current = minted;
        }
        if (total > MINT_BREAKER_LIMIT) {
            c.mintBreakerTripped = true;
            // Only storage reads precede this event; there is no external call.
            // forge-lint: disable-next-line(reentrancy-events)
            emit MintBreakerTripped(total);
            return false;
        }
        c.mintBuckets[bucket % MINT_BUCKETS] = (bucket << 192) | (current + amount);
        // slither-disable-end weak-prng
        return true;
    }

    /// @dev MiningAccounting hook: pays the referrer 3 % of `earned` from the treasury share.
    function _onAccrued(address account, uint256 earned) internal override {
        Site storage s = _core().sites[account];
        address referrer = s.referrer;
        if (referrer == address(0) || s.fuelSpentWei < REFERRAL_MIN_FUEL_WEI) return;
        if (_expiryHourOf(referrer) <= currentHour()) return; // the referrer has no fuel
        _creditReferral(referrer, account, (earned * REFERRAL_BPS) / 10_000);
    }

    // ------------------------------------------------------------------ market open

    /// @notice One-time wiring of the LiquidityManager (deployed after this proxy, because the
    ///         LiquidityManager needs this address and a mined hook address).
    function wireLiquidityManager(address liquidityManager_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        CoreStorage storage c = _core();
        if (c.liquidityManager != address(0)) revert AlreadyWired();
        if (liquidityManager_ == address(0)) revert ZeroAddress();
        c.liquidityManager = liquidityManager_;
        // No external call precedes this event in this function.
        // forge-lint: disable-next-line(reentrancy-events)
        emit LiquidityManagerWired(liquidityManager_);
    }

    /// @notice Opens the market once genesis is over (docs/02 S11). Anyone may call, once.
    ///         P0 = genesis fuel USD / genesis miner accrual; the MOHN paired with the POL ETH is
    ///         minted from the reserve (at most 1M) and the pool opens at P0 via Chainlink ETH/USD.
    ///         No AMM price is read anywhere in this calculation.
    /// @dev If the mint breaker trips, the market stays closed and the call returns.
    function openMarket() external nonReentrant whenNotPaused {
        _requireCheckpointed();
        CoreStorage storage c = _core();
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < uint256(c.genesisTime) + GENESIS_DURATION) revert MarketNotOpenYet();
        if (c.marketOpened) revert MarketAlreadyOpen();
        if (c.liquidityManager == address(0)) revert ZeroAddress();
        uint256 p0 = MarketOpenMath.openingPrice(c.genesisFuelUsd, genesisMinerAccrual());
        uint256 ethUsd = _ethUsdWad(c);
        // A view read of our own router (staticcall); no state can change through it.
        // aderyn-fp-next-line(reentrancy-state-change)
        uint256 polEth = c.router.polBalance();
        uint256 lp = MarketOpenMath.lpAmount(polEth, ethUsd, p0);
        uint160 sqrtPriceX96 = MarketOpenMath.sqrtPriceX96(ethUsd, p0);
        if (!_admitMint(c, lp)) return;
        c.marketOpened = true;
        _mintFromReserve(lp);
        // forge-lint: disable-next-line(reentrancy-events)
        emit MarketOpened(p0, ethUsd, polEth, lp, sqrtPriceX96);
        IMohnToken(c.token).mint(c.liquidityManager, lp);
        ILiquidityManager(c.liquidityManager).openMarket(sqrtPriceX96, polEth);
    }

    // ------------------------------------------------------------------ governance

    /// @dev Player actions stop while paused; accounting (poke) and views keep working.
    modifier whenNotPaused() {
        uint64 until = _core().pausedUntil;
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < until) revert ProtocolPaused(until);
        _;
    }

    /// @notice Changes one parameter within its coded bounds and rate limit (invariant P1).
    ///         Changing VRGDA r or k re-anchors the curve so the price does not jump.
    function setParam(Param param, uint256 value) external onlyRole(DEFAULT_ADMIN_ROLE) {
        CoreStorage storage c = _core();
        (uint256 min, uint256 max, uint256 stepBps, uint64 period) = paramBounds(param);
        if (value < min || value > max) revert ParamOutOfBounds(min, max);
        _rateLimit(c, uint256(param), period);
        uint256 old = paramValue(param);
        if (stepBps != 0) {
            uint256 lo = (old * (10_000 - stepBps)) / 10_000;
            uint256 hi = (old * (10_000 + stepBps)) / 10_000;
            if (value < lo || value > hi) revert ParamStepTooLarge(lo, hi);
        }
        if (param == Param.VrgdaR || param == Param.VrgdaK) _reanchorVrgda(c);
        _storeParam(c, param, value);
        // forge-lint: disable-next-line(reentrancy-events)
        emit ParamChanged(param, old, value);
    }

    // The governance functions below make no external calls; the lint reads library calls and
    // storage helpers as external.
    // forge-lint: disable-start(reentrancy-events)

    /// @notice Guardian: pauses player actions for GUARDIAN_PAUSE; ends by itself. At most one
    ///         Guardian pause per GUARDIAN_COOLDOWN, so a lost Guardian key cannot lock players out.
    function pause() external onlyRole(GUARDIAN_ROLE) {
        CoreStorage storage c = _core();
        uint64 last = c.lastGuardianPause;
        // forge-lint: disable-next-line(block-timestamp)
        if (last != 0 && block.timestamp < last + GUARDIAN_COOLDOWN) {
            revert PauseCooldown(last + GUARDIAN_COOLDOWN);
        }
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 nowTs = uint64(block.timestamp);
        c.lastGuardianPause = nowTs;
        uint64 until = nowTs + GUARDIAN_PAUSE;
        if (until > c.pausedUntil) c.pausedUntil = until;
        emit Paused(msg.sender, c.pausedUntil);
    }

    /// @notice Timelock: extends a pause up to MAX_TIMELOCK_PAUSE from now.
    function extendPause(uint64 until) external onlyRole(DEFAULT_ADMIN_ROLE) {
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 max = uint64(block.timestamp) + MAX_TIMELOCK_PAUSE;
        if (until > max) revert PauseTooLong(max);
        _core().pausedUntil = until;
        emit Paused(msg.sender, until);
    }

    /// @notice Timelock: ends a pause now.
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _core().pausedUntil = 0;
        emit Unpaused();
    }

    /// @notice Timelock: new dev and treasury recipients (non-zero, at most once per 30 days).
    function setRecipients(address dev, address treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (dev == address(0) || treasury == address(0)) revert ZeroAddress();
        CoreStorage storage c = _core();
        _rateLimit(c, 100, 30 days);
        c.devRecipient = dev;
        c.treasuryRecipient = treasury;
        emit RecipientsChanged(dev, treasury);
    }

    /// @notice Timelock: connects (or disconnects, with address(0)) a sequencer uptime feed, should
    ///         Chainlink publish one for this chain (docs/02 S5.1). At most once per 30 days.
    function setSequencerFeed(address feed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        CoreStorage storage c = _core();
        _rateLimit(c, 101, 30 days);
        c.sequencerFeed = IAggregatorV3(feed);
        emit SequencerFeedChanged(feed);
    }

    // forge-lint: disable-end(reentrancy-events)

    /// @notice Coded bounds of each parameter: [min, max], largest step per change (bps of the
    ///         current value; 0 = any value within the bounds) and the minimum time between changes.
    function paramBounds(Param param)
        public
        pure
        returns (uint256 min, uint256 max, uint256 stepBps, uint64 period)
    {
        if (param == Param.FuelPrice) return (0.03e18, 0.5e18, 2500, 7 days);
        if (param == Param.VrgdaR) return (1000e18, 100_000e18, 2500, 30 days);
        if (param == Param.VrgdaK) return (0.05e18, 0.35e18, 2500, 30 days);
        if (param == Param.FastRefineFee) return (0, 1200, 0, 7 days);
        if (param == Param.RefineDelay) return (24 hours, 168 hours, 0, 7 days);
        if (param == Param.MaxTankHours) return (168, 2160, 0, 7 days);
        if (param == Param.OracleStaleness) return (25 hours, 30 hours, 0, 7 days);
        return (5000, 20_000, 2500, 30 days); // SiteCostScale
    }

    /// @notice Current value of a parameter, in the units of paramBounds.
    function paramValue(Param param) public view returns (uint256) {
        CoreStorage storage c = _core();
        if (param == Param.FuelPrice) return c.fuelPriceUsdWad;
        if (param == Param.VrgdaR) return c.vrgdaR;
        if (param == Param.VrgdaK) return c.vrgdaK;
        if (param == Param.FastRefineFee) return c.fastRefineFeeBps;
        if (param == Param.RefineDelay) return c.refineDelay;
        if (param == Param.MaxTankHours) return c.maxTankHours;
        if (param == Param.OracleStaleness) return c.oracleStaleness;
        return c.siteCostScaleBps;
    }

    /// @dev Values are within paramBounds here, so every narrowing cast below is safe.
    function _storeParam(CoreStorage storage c, Param param, uint256 value) private {
        if (param == Param.FuelPrice) {
            c.fuelPriceUsdWad = value;
        } else if (param == Param.VrgdaR) {
            c.vrgdaR = value;
        } else if (param == Param.VrgdaK) {
            c.vrgdaK = value;
            // forge-lint: disable-next-line(unsafe-typecast)
            c.vrgdaDecay = FixedPointMathLib.lnWad(int256(1e18 - value));
        } else if (param == Param.FastRefineFee) {
            c.fastRefineFeeBps = SafeCast.toUint16(value);
        } else if (param == Param.RefineDelay) {
            c.refineDelay = SafeCast.toUint64(value);
        } else if (param == Param.MaxTankHours) {
            c.maxTankHours = SafeCast.toUint16(value);
        } else if (param == Param.OracleStaleness) {
            c.oracleStaleness = SafeCast.toUint32(value);
        } else {
            c.siteCostScaleBps = SafeCast.toUint16(value);
        }
    }

    /// @dev Reverts if `key` changed less than `period` ago, then records the change.
    function _rateLimit(CoreStorage storage c, uint256 key, uint64 period) private {
        uint64 last = c.changedAt[key];
        // forge-lint: disable-next-line(block-timestamp)
        if (last != 0 && block.timestamp < last + period) revert RateLimited(last + period);
        // forge-lint: disable-next-line(unsafe-typecast)
        c.changedAt[key] = uint64(block.timestamp);
    }

    /// @dev Restarts the VRGDA curve at the current price, time and sales (docs/02 S12).
    function _reanchorVrgda(CoreStorage storage c) private {
        (uint256 elapsed, uint256 sold) = _sinceAnchor(c);
        c.vrgdaLnAnchor = VrgdaMath.lnPrice(elapsed, sold, c.vrgdaLnAnchor, c.vrgdaDecay, c.vrgdaR);
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > c.vrgdaAnchorTime) {
            // forge-lint: disable-next-line(unsafe-typecast)
            c.vrgdaAnchorTime = uint64(block.timestamp);
        }
        c.vrgdaAnchorSold = c.vrgdaSold;
        // No external call here (VrgdaMath is an internal library).
        // forge-lint: disable-next-line(reentrancy-events)
        emit VrgdaReanchored(c.vrgdaLnAnchor, c.vrgdaAnchorTime, c.vrgdaAnchorSold);
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

    function machineType(uint256 typeId) external view returns (MachineType memory) {
        return _core().catalog[typeId];
    }

    function machineTypeCount() external view returns (uint256) {
        return _core().catalog.length;
    }

    function generations() external view returns (uint8) {
        return _core().generations;
    }

    function rigsOf(address account, uint256 typeId) external view returns (Rigs memory) {
        return _core().rigs[account][typeId];
    }

    /// @notice Current VRGDA price of the next DP unit (MOHN wei).
    function unitPrice() external view returns (uint256) {
        return _unitPrice(_core());
    }

    function vrgdaSold() external view returns (uint256) {
        return _core().vrgdaSold;
    }

    /// @notice MOHN cost of `qty` rigs of `typeId` right now (before scrap credit).
    function quoteMachines(uint256 typeId, uint32 qty) external view returns (uint256) {
        CoreStorage storage c = _core();
        MachineType memory m = c.catalog[typeId];
        return _machineCost(c, uint256(m.dp) * qty, m.premiumBps);
    }

    /// @notice MOHN cost of upgrading a site from `level` to `level + 1` right now.
    function quoteSiteUpgrade(uint8 level) external view returns (uint256) {
        return _siteUpgradeCost(_core(), level);
    }

    function refineRequest(address account, uint256 id)
        external
        view
        returns (RefineRequest memory)
    {
        return _core().refineQueue[account][id];
    }

    function refineRequestCount(address account) external view returns (uint256) {
        return _core().refineQueue[account].length;
    }

    function refineQueued() external view returns (uint256) {
        return _core().refineQueued;
    }

    function genesisFuelUsd() external view returns (uint256) {
        return _core().genesisFuelUsd;
    }

    function liquidityManager() external view returns (address) {
        return _core().liquidityManager;
    }

    function marketOpened() external view returns (bool) {
        return _core().marketOpened;
    }

    function pausedUntil() external view returns (uint64) {
        return _core().pausedUntil;
    }

    function maxTankHours() external view returns (uint256) {
        return _core().maxTankHours;
    }

    function mintBreakerTripped() external view returns (bool) {
        return _core().mintBreakerTripped;
    }

    function devRecipient() external view returns (address) {
        return _core().devRecipient;
    }

    function treasuryRecipient() external view returns (address) {
        return _core().treasuryRecipient;
    }

    function token() external view returns (address) {
        return _core().token;
    }

    function router() external view returns (address) {
        return address(_core().router);
    }
}
