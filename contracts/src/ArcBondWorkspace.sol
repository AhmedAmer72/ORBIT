// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/// @title ArcBondWorkspace
/// @notice One USDC accounting authority for several agents, a shared UTC-day cap, and metered sessions.
/// @dev Clone-friendly. Existing ArcBondVault clones are not modified. A workspace name is not stored here.
///      Session reservations lock USDC and count against the current period caps. Settlement of a voucher
///      pays only the increase over the amount already settled for that session.
contract ArcBondWorkspace is Pausable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    bytes32 private constant PAYMENT_INTENT_TYPEHASH = keccak256(
        "PaymentIntent(address vault,address agent,address recipient,address token,uint256 amount,bytes32 paymentId,uint256 nonce,uint256 deadline,uint256 policyVersion)"
    );
    bytes32 private constant USAGE_VOUCHER_TYPEHASH = keccak256(
        "UsageVoucher(address workspace,bytes32 sessionId,address agent,address provider,uint256 cumulativeAmount,uint256 sequence,uint256 deadline,uint256 sessionVersion)"
    );

    /// @notice Generation of this workspace implementation. Not a vault factory version.
    uint256 public constant VERSION = 1;

    IERC20 public constant USDC = IERC20(0x3600000000000000000000000000000000000000);
    uint64 public constant PERIOD = 1 days;

    struct PaymentIntent {
        address vault;
        address agent;
        address recipient;
        address token;
        uint256 amount;
        bytes32 paymentId;
        uint256 nonce;
        uint256 deadline;
        uint256 policyVersion;
    }

    struct UsageVoucher {
        address workspace;
        bytes32 sessionId;
        address agent;
        address provider;
        uint256 cumulativeAmount;
        uint256 sequence;
        uint256 deadline;
        uint256 sessionVersion;
    }

    struct AgentConfig {
        bool active;
        uint64 expiresAt;
        uint64 periodId;
        uint256 maxPerPayment;
        uint256 periodLimit;
        uint256 spentInPeriod;
        uint256 reservedInPeriod;
        uint256 nonce;
    }

    struct Session {
        address agent;
        address provider;
        uint256 budget;
        uint256 settled;
        uint64 deadline;
        uint64 reservedPeriodId;
        uint256 sessionVersion;
        uint256 lastSequence;
        bool open;
        bytes32 pricingId;
    }

    address public owner;
    address public pendingOwner;
    uint256 public workspacePeriodLimit;
    uint256 public spentInPeriod;
    uint256 public reservedInPeriod;
    uint64 public periodId;
    /// @notice USDC locked by open sessions. This does not reset when the UTC day changes.
    uint256 public reserved;
    uint256 public policyVersion;
    bool private _initialized;

    mapping(address => AgentConfig) public agents;
    mapping(address => bool) public approvedRecipients;
    mapping(bytes32 => bool) public usedPaymentIds;
    mapping(bytes32 => Session) public sessions;

    event Deposited(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event WorkspacePolicyUpdated(uint256 workspacePeriodLimit);
    event AgentAuthorized(address indexed agent, uint256 maxPerPayment, uint256 periodLimit, uint64 expiresAt);
    event AgentRevoked(address indexed agent);
    event RecipientUpdated(address indexed recipient, bool approved);
    event PolicyVersionChanged(uint256 policyVersion);
    event PaymentExecuted(
        address indexed agent,
        address indexed recipient,
        uint256 amount,
        bytes32 indexed paymentId,
        uint64 periodId,
        uint256 spentInPeriod
    );
    event PaymentIntentExecuted(
        address indexed agent,
        address indexed recipient,
        address indexed submitter,
        uint256 amount,
        bytes32 paymentId,
        uint256 nonce,
        uint256 policyVersion
    );
    event SessionOpened(
        bytes32 indexed sessionId,
        address indexed agent,
        address indexed provider,
        uint256 budget,
        uint64 deadline,
        uint256 sessionVersion,
        bytes32 pricingId
    );
    event SessionSettled(
        bytes32 indexed sessionId, address indexed provider, uint256 incrementalAmount, uint256 cumulativeSettled, uint256 sequence
    );
    event SessionClosed(bytes32 indexed sessionId, uint256 released);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error AlreadyInitialized();
    error UnauthorizedOwner();
    error UnauthorizedAgent();
    error AuthorizationExpired();
    error AmountExceedsLimit();
    error PeriodLimitExceeded();
    error RecipientNotApproved();
    error PaymentIdUsed();
    error VaultPaused();
    error TransferAmountMismatch();
    error InvalidTokenDecimals();
    error InvalidOwner();
    error InvalidAgent();
    error InvalidRecipient();
    error ZeroAmount();
    error ZeroPaymentId();
    error InvalidSignature();
    error IntentExpired();
    error WrongVault();
    error WrongToken();
    error PolicyVersionMismatch();
    error InvalidNonce();
    error InsufficientAvailable();
    error SessionExists();
    error SessionClosedErr();
    error SessionExpired();
    error InvalidSession();
    error StaleVoucher();
    error BudgetExceeded();
    error FundsReserved();

    modifier onlyOwner() {
        if (msg.sender != owner) revert UnauthorizedOwner();
        _;
    }

    constructor() EIP712("ArcBondWorkspace", "1") {
        if (IERC20Metadata(address(USDC)).decimals() != 6) revert InvalidTokenDecimals();
        _initialized = true;
    }

    function initialize(address owner_) external {
        if (_initialized) revert AlreadyInitialized();
        if (owner_ == address(0)) revert InvalidOwner();
        _initialized = true;
        owner = owner_;
        emit OwnershipTransferred(address(0), owner_);
    }

    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 beforeBal = USDC.balanceOf(address(this));
        USDC.safeTransferFrom(msg.sender, address(this), amount);
        if (USDC.balanceOf(address(this)) != beforeBal + amount) revert TransferAmountMismatch();
        emit Deposited(msg.sender, amount);
    }

    /// @notice Withdraws USDC that is not locked by an open session. Pause does not block this.
    function withdraw(uint256 amount) external nonReentrant onlyOwner {
        if (amount == 0) revert ZeroAmount();
        if (amount > availableBalance()) revert FundsReserved();
        uint256 beforeBal = USDC.balanceOf(address(this));
        USDC.safeTransfer(msg.sender, amount);
        if (USDC.balanceOf(address(this)) != beforeBal - amount) revert TransferAmountMismatch();
        emit Withdrawn(msg.sender, amount);
    }

    function setWorkspacePeriodLimit(uint256 limit) external onlyOwner {
        workspacePeriodLimit = limit;
        emit WorkspacePolicyUpdated(limit);
        _bumpPolicy();
    }

    function setRecipient(address recipient, bool approved) external onlyOwner {
        if (approved && (recipient == address(0) || recipient == address(this))) revert InvalidRecipient();
        approvedRecipients[recipient] = approved;
        emit RecipientUpdated(recipient, approved);
        _bumpPolicy();
    }

    function authorizeAgent(address agent, uint256 maxPerPayment, uint256 periodLimit, uint64 expiresAt) external onlyOwner {
        if (agent == address(0) || agent == owner || agent == address(this)) revert InvalidAgent();
        if (expiresAt != 0 && expiresAt <= block.timestamp) revert AuthorizationExpired();
        _syncAgent(agent);
        AgentConfig storage cfg = agents[agent];
        cfg.active = true;
        cfg.maxPerPayment = maxPerPayment;
        cfg.periodLimit = periodLimit;
        cfg.expiresAt = expiresAt;
        emit AgentAuthorized(agent, maxPerPayment, periodLimit, expiresAt);
        _bumpPolicy();
    }

    function revokeAgent(address agent) external onlyOwner {
        if (!agents[agent].active) revert UnauthorizedAgent();
        agents[agent].active = false;
        agents[agent].expiresAt = 0;
        emit AgentRevoked(agent);
        _bumpPolicy();
    }

    function executePayment(address recipient, uint256 amount, bytes32 paymentId) external nonReentrant {
        _pay(msg.sender, recipient, amount, paymentId);
    }

    function executePaymentIntent(PaymentIntent calldata intent, bytes calldata signature) external nonReentrant {
        if (intent.vault != address(this)) revert WrongVault();
        if (intent.token != address(USDC)) revert WrongToken();
        address signer = _recoverIntentSigner(intent, signature);
        if (signer == address(0) || signer != intent.agent) revert InvalidSignature();
        AgentConfig storage cfg = agents[intent.agent];
        if (!cfg.active) revert UnauthorizedAgent();
        if (block.timestamp >= intent.deadline) revert IntentExpired();
        if (intent.policyVersion != policyVersion) revert PolicyVersionMismatch();
        if (intent.nonce != cfg.nonce) revert InvalidNonce();
        uint256 used = cfg.nonce;
        cfg.nonce = used + 1;
        _pay(intent.agent, intent.recipient, intent.amount, intent.paymentId);
        emit PaymentIntentExecuted(
            intent.agent, intent.recipient, msg.sender, intent.amount, intent.paymentId, used, intent.policyVersion
        );
    }

    /// @notice Owner locks `budget` of USDC and of the current period caps for one provider.
    function openSession(bytes32 sessionId, address agent, address provider, uint256 budget, uint64 deadline, bytes32 pricingId)
        external
        onlyOwner
    {
        if (paused()) revert VaultPaused();
        if (sessionId == bytes32(0) || sessions[sessionId].agent != address(0)) revert SessionExists();
        if (budget == 0) revert ZeroAmount();
        if (deadline <= block.timestamp) revert SessionExpired();
        AgentConfig storage cfg = agents[agent];
        _syncWorkspace();
        _syncAgent(agent);
        if (!cfg.active) revert UnauthorizedAgent();
        if (block.timestamp >= cfg.expiresAt) revert AuthorizationExpired();
        if (deadline > cfg.expiresAt) revert AuthorizationExpired();
        if (!approvedRecipients[provider]) revert RecipientNotApproved();
        if (budget > availableBalance()) revert InsufficientAvailable();
        if (spentInPeriod + reservedInPeriod + budget > workspacePeriodLimit) revert PeriodLimitExceeded();
        if (cfg.spentInPeriod + cfg.reservedInPeriod + budget > cfg.periodLimit) revert PeriodLimitExceeded();

        reserved += budget;
        reservedInPeriod += budget;
        cfg.reservedInPeriod += budget;

        sessions[sessionId] = Session({
            agent: agent,
            provider: provider,
            budget: budget,
            settled: 0,
            deadline: deadline,
            reservedPeriodId: periodId,
            sessionVersion: policyVersion,
            lastSequence: 0,
            open: true,
            pricingId: pricingId
        });
        emit SessionOpened(sessionId, agent, provider, budget, deadline, policyVersion, pricingId);
    }

    /// @notice Pays only `cumulativeAmount - settled`. A repeated cumulative amount does not pay again.
    function settleSession(UsageVoucher calldata voucher, bytes calldata signature) external nonReentrant {
        if (paused()) revert VaultPaused();
        if (voucher.workspace != address(this)) revert WrongVault();
        Session storage session = sessions[voucher.sessionId];
        if (!session.open) revert SessionClosedErr();
        if (voucher.agent != session.agent || voucher.provider != session.provider) revert InvalidSession();
        if (voucher.sessionVersion != session.sessionVersion || voucher.sessionVersion != policyVersion) revert PolicyVersionMismatch();
        if (block.timestamp >= session.deadline || block.timestamp >= voucher.deadline) revert SessionExpired();
        if (_recoverVoucherSigner(voucher, signature) != session.agent) revert InvalidSignature();
        AgentConfig storage cfg = agents[session.agent];
        _syncWorkspace();
        _syncAgent(session.agent);
        if (!cfg.active || block.timestamp >= cfg.expiresAt) revert UnauthorizedAgent();
        if (voucher.sequence <= session.lastSequence) revert StaleVoucher();
        if (voucher.cumulativeAmount < session.settled || voucher.cumulativeAmount > session.budget) revert BudgetExceeded();
        uint256 incremental = voucher.cumulativeAmount - session.settled;
        if (incremental == 0) revert ZeroAmount();
        if (incremental > cfg.maxPerPayment) revert AmountExceedsLimit();

        _consumeReservation(session, cfg, incremental);
        session.settled += incremental;
        session.lastSequence = voucher.sequence;

        uint256 beforeBal = USDC.balanceOf(address(this));
        USDC.safeTransfer(session.provider, incremental);
        if (USDC.balanceOf(address(this)) != beforeBal - incremental) revert TransferAmountMismatch();

        emit SessionSettled(voucher.sessionId, session.provider, incremental, session.settled, voucher.sequence);
        emit PaymentExecuted(session.agent, session.provider, incremental, voucher.sessionId, periodId, spentInPeriod);
    }

    /// @notice Releases the unsettled reservation. Outstanding vouchers can no longer settle.
    function closeSession(bytes32 sessionId) external nonReentrant onlyOwner {
        Session storage session = sessions[sessionId];
        if (!session.open) revert SessionClosedErr();
        uint256 remaining = session.budget - session.settled;
        AgentConfig storage cfg = agents[session.agent];
        _syncWorkspace();
        _syncAgent(session.agent);
        if (remaining > 0) {
            if (session.reservedPeriodId == periodId) {
                reservedInPeriod -= remaining;
                cfg.reservedInPeriod -= remaining;
            }
            reserved -= remaining;
        }
        session.open = false;
        emit SessionClosed(sessionId, remaining);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0) || newOwner == owner) revert InvalidOwner();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert UnauthorizedOwner();
        address previous = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(previous, msg.sender);
    }

    function availableBalance() public view returns (uint256) {
        uint256 bal = USDC.balanceOf(address(this));
        if (bal < reserved) return 0;
        return bal - reserved;
    }

    function currentPeriodId() public view returns (uint64) {
        return uint64(block.timestamp / PERIOD);
    }

    function hashPaymentIntent(PaymentIntent calldata intent) external view returns (bytes32) {
        return _hashTypedDataV4(_hashIntent(intent));
    }

    function hashUsageVoucher(UsageVoucher calldata voucher) external view returns (bytes32) {
        return _hashTypedDataV4(_hashVoucher(voucher));
    }

    function _pay(address agent, address recipient, uint256 amount, bytes32 paymentId) internal {
        if (paused()) revert VaultPaused();
        AgentConfig storage cfg = agents[agent];
        _syncWorkspace();
        _syncAgent(agent);
        if (!cfg.active) revert UnauthorizedAgent();
        if (block.timestamp >= cfg.expiresAt) revert AuthorizationExpired();
        if (amount == 0) revert ZeroAmount();
        if (amount > cfg.maxPerPayment) revert AmountExceedsLimit();
        if (!approvedRecipients[recipient]) revert RecipientNotApproved();
        if (paymentId == bytes32(0)) revert ZeroPaymentId();
        if (usedPaymentIds[paymentId]) revert PaymentIdUsed();
        if (amount > availableBalance()) revert InsufficientAvailable();
        if (spentInPeriod + reservedInPeriod + amount > workspacePeriodLimit) revert PeriodLimitExceeded();
        if (cfg.spentInPeriod + cfg.reservedInPeriod + amount > cfg.periodLimit) revert PeriodLimitExceeded();

        usedPaymentIds[paymentId] = true;
        spentInPeriod += amount;
        cfg.spentInPeriod += amount;

        uint256 beforeBal = USDC.balanceOf(address(this));
        USDC.safeTransfer(recipient, amount);
        if (USDC.balanceOf(address(this)) != beforeBal - amount) revert TransferAmountMismatch();
        emit PaymentExecuted(agent, recipient, amount, paymentId, periodId, spentInPeriod);
    }

    function _consumeReservation(Session storage session, AgentConfig storage cfg, uint256 amount) internal {
        if (session.reservedPeriodId == periodId) {
            reservedInPeriod -= amount;
            cfg.reservedInPeriod -= amount;
        } else if (spentInPeriod + amount > workspacePeriodLimit || cfg.spentInPeriod + amount > cfg.periodLimit) {
            revert PeriodLimitExceeded();
        }
        reserved -= amount;
        spentInPeriod += amount;
        cfg.spentInPeriod += amount;
    }

    function _hashIntent(PaymentIntent calldata intent) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                PAYMENT_INTENT_TYPEHASH,
                intent.vault,
                intent.agent,
                intent.recipient,
                intent.token,
                intent.amount,
                intent.paymentId,
                intent.nonce,
                intent.deadline,
                intent.policyVersion
            )
        );
    }

    function _hashVoucher(UsageVoucher calldata voucher) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                USAGE_VOUCHER_TYPEHASH,
                voucher.workspace,
                voucher.sessionId,
                voucher.agent,
                voucher.provider,
                voucher.cumulativeAmount,
                voucher.sequence,
                voucher.deadline,
                voucher.sessionVersion
            )
        );
    }

    function _recoverIntentSigner(PaymentIntent calldata intent, bytes calldata signature) internal view returns (address) {
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(_hashTypedDataV4(_hashIntent(intent)), signature);
        if (err != ECDSA.RecoverError.NoError) return address(0);
        return recovered;
    }

    function _recoverVoucherSigner(UsageVoucher calldata voucher, bytes calldata signature) internal view returns (address) {
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(_hashTypedDataV4(_hashVoucher(voucher)), signature);
        if (err != ECDSA.RecoverError.NoError) return address(0);
        return recovered;
    }

    function _bumpPolicy() internal {
        policyVersion += 1;
        emit PolicyVersionChanged(policyVersion);
    }

    function _syncWorkspace() internal {
        uint64 current = currentPeriodId();
        if (current != periodId) {
            periodId = current;
            spentInPeriod = 0;
            reservedInPeriod = 0;
        }
    }

    function _syncAgent(address agent) internal {
        AgentConfig storage cfg = agents[agent];
        uint64 current = currentPeriodId();
        if (cfg.periodId != current) {
            cfg.periodId = current;
            cfg.spentInPeriod = 0;
            cfg.reservedInPeriod = 0;
        }
    }
}
