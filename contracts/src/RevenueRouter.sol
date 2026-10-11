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
/// @dev The split is fixed at deployment for now; Phase 2.7 adds bounded, rate-limited Timelock
///      setters (buyback 30-60 %, POL 20-50 %, ops 10-35 %).
// Not locked: every bucket is paid out by a pull function (Address.sendValue).
// aderyn-fp-next-line(contract-locks-ether)
contract RevenueRouter is IRevenueRouter, AccessControl, ReentrancyGuardTransient {
    bytes32 public constant DEPOSITOR_ROLE = keccak256("DEPOSITOR_ROLE"); // MiningCore
    bytes32 public constant FEE_DEPOSITOR_ROLE = keccak256("FEE_DEPOSITOR_ROLE"); // LiquidityManager
    bytes32 public constant BUYBACK_ROLE = keccak256("BUYBACK_ROLE"); // BuybackBurner
    bytes32 public constant POL_ROLE = keccak256("POL_ROLE"); // LiquidityManager
    bytes32 public constant OPS_ROLE = keccak256("OPS_ROLE"); // ops Safe

    uint16 public constant INITIAL_BUYBACK_BPS = 5500;
    uint16 public constant INITIAL_POL_BPS = 3000; // ops gets the remainder (15 %)

    uint16 public buybackBps;
    uint16 public polBps;
    uint256 public buybackBalance;
    uint256 public polBalance;
    uint256 public opsBalance;

    event Deposited(uint256 amount, uint256 toBuyback, uint256 toPol, uint256 toOps);
    event BuybackDeposited(uint256 amount);
    event Pulled(bytes32 indexed bucket, address indexed to, uint256 amount);

    error ZeroAddress();
    error InsufficientBucket(uint256 available);

    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        buybackBps = INITIAL_BUYBACK_BPS;
        polBps = INITIAL_POL_BPS;
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
