// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

import {IRevenueRouter} from "./interfaces/IRevenueRouter.sol";

/// @title RevenueRouter
/// @notice Splits fuel revenue into three ETH buckets (docs/02 S10): buyback & burn, protocol-owned
///         liquidity and operations. Nothing is pushed: each bucket is pulled by its own role
///         (BuybackBurner, LiquidityManager, the ops Safe). Invariant R1: the ETH balance equals the
///         sum of the buckets.
/// @dev The split changes only through setSplit (DEFAULT_ADMIN_ROLE = the 96 h Timelock), within
///      buyback 30-60 %, POL 20-50 %, ops 10-35 %, at most once per 30 days (invariant P1).
// Not locked: every bucket is paid out by a pull function (Address.sendValue).
// aderyn-fp-next-line(contract-locks-ether)
contract RevenueRouter is IRevenueRouter, AccessControl, ReentrancyGuardTransient {
    bytes32 public constant DEPOSITOR_ROLE = keccak256("DEPOSITOR_ROLE"); // MiningCore
    bytes32 public constant FEE_DEPOSITOR_ROLE = keccak256("FEE_DEPOSITOR_ROLE"); // LiquidityManager
    bytes32 public constant BUYBACK_ROLE = keccak256("BUYBACK_ROLE"); // BuybackBurner
    bytes32 public constant POL_ROLE = keccak256("POL_ROLE"); // LiquidityManager
    bytes32 public constant OPS_ROLE = keccak256("OPS_ROLE"); // ops Safe
    /// @notice Admin of the bucket roles after lockBucketRoles. Nobody holds it, so the wiring of
    ///         MiningCore, LiquidityManager and BuybackBurner can never be changed afterwards.
    bytes32 public constant LOCKED_ROLE = keccak256("LOCKED_ROLE");

    uint16 public constant INITIAL_BUYBACK_BPS = 5500;
    uint16 public constant INITIAL_POL_BPS = 3000; // ops gets the remainder (15 %)
    uint64 public constant SPLIT_PERIOD = 30 days;

    uint16 public buybackBps;
    uint16 public polBps;
    uint256 public buybackBalance;
    uint256 public polBalance;
    uint256 public opsBalance;
    uint64 public splitChangedAt;
    bool public bucketRolesLocked;

    event Deposited(uint256 amount, uint256 toBuyback, uint256 toPol, uint256 toOps);
    event BuybackDeposited(uint256 amount);
    event Pulled(bytes32 indexed bucket, address indexed to, uint256 amount);
    event SplitChanged(uint16 buybackBps, uint16 polBps, uint16 opsBps);
    event BucketRolesLocked();

    error ZeroAddress();
    error InsufficientBucket(uint256 available);
    error SplitOutOfBounds();
    error RateLimited(uint64 nextChange);
    error AlreadyLocked();

    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        buybackBps = INITIAL_BUYBACK_BPS;
        polBps = INITIAL_POL_BPS;
    }

    /// @notice One-time, at deployment: freezes who may deposit fuel revenue and pull the buyback
    ///         and POL buckets. Afterwards not even the Timelock can redirect those buckets; only
    ///         the ops role (15 %) stays manageable.
    function lockBucketRoles() external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (bucketRolesLocked) revert AlreadyLocked();
        bucketRolesLocked = true;
        _setRoleAdmin(DEPOSITOR_ROLE, LOCKED_ROLE);
        _setRoleAdmin(FEE_DEPOSITOR_ROLE, LOCKED_ROLE);
        _setRoleAdmin(POL_ROLE, LOCKED_ROLE);
        _setRoleAdmin(BUYBACK_ROLE, LOCKED_ROLE);
        emit BucketRolesLocked();
    }

    /// @notice Timelock: new split for future deposits; existing buckets are not touched.
    function setSplit(uint16 buybackBps_, uint16 polBps_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 opsBps = 10_000 - uint256(buybackBps_) - polBps_; // reverts if above 100 %
        if (
            buybackBps_ < 3000 || buybackBps_ > 6000 || polBps_ < 2000 || polBps_ > 5000
                || opsBps < 1000 || opsBps > 3500
        ) revert SplitOutOfBounds();
        uint64 last = splitChangedAt;
        // forge-lint: disable-next-line(block-timestamp)
        if (last != 0 && block.timestamp < last + SPLIT_PERIOD) {
            revert RateLimited(last + SPLIT_PERIOD);
        }
        // forge-lint: disable-next-line(unsafe-typecast)
        splitChangedAt = uint64(block.timestamp);
        buybackBps = buybackBps_;
        polBps = polBps_;
        // forge-lint: disable-next-line(unsafe-typecast)
        emit SplitChanged(buybackBps_, polBps_, uint16(opsBps));
    }

    /// @inheritdoc IRevenueRouter
    function deposit() external payable onlyRole(DEPOSITOR_ROLE) {
        uint256 toBuyback = (msg.value * buybackBps) / 10_000;
        uint256 toPol = (msg.value * polBps) / 10_000;
        uint256 toOps = msg.value - toBuyback - toPol;
        buybackBalance += toBuyback;
        polBalance += toPol;
        opsBalance += toOps;
        emit Deposited(msg.value, toBuyback, toPol, toOps);
    }

    /// @inheritdoc IRevenueRouter
    function depositBuyback() external payable onlyRole(FEE_DEPOSITOR_ROLE) {
        buybackBalance += msg.value;
        emit BuybackDeposited(msg.value);
    }

    /// @inheritdoc IRevenueRouter
    function pullBuyback(uint256 amount) external nonReentrant onlyRole(BUYBACK_ROLE) {
        buybackBalance = _debit(buybackBalance, amount);
        _send(BUYBACK_ROLE, amount);
    }

    /// @inheritdoc IRevenueRouter
    function pullPol(uint256 amount) external nonReentrant onlyRole(POL_ROLE) {
        polBalance = _debit(polBalance, amount);
        _send(POL_ROLE, amount);
    }

    /// @notice The ops Safe pulls its bucket (docs/08 S3: servers, audit fund, bug bounty).
    function withdrawOps(uint256 amount) external nonReentrant onlyRole(OPS_ROLE) {
        opsBalance = _debit(opsBalance, amount);
        _send(OPS_ROLE, amount);
    }

    function _debit(uint256 balance, uint256 amount) private pure returns (uint256) {
        if (amount > balance) revert InsufficientBucket(balance);
        return balance - amount;
    }

    /// @dev Pays the role holder that called (pull), after the bucket was debited (CEI).
    function _send(bytes32 bucket, uint256 amount) private {
        emit Pulled(bucket, msg.sender, amount);
        Address.sendValue(payable(msg.sender), amount);
    }
}
