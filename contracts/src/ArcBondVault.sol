// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

import {IArcBondVault} from "./interfaces/IArcBondVault.sol";

/// @title ArcBondVault
/// @notice Isolated USDC vault that lets one authorized agent pay only inside owner policy.
/// @dev Clone-friendly: constructors do not run on EIP-1167 clones. An uninitialized
///      reentrancy status is not "entered". EIP-712 name and version are immutables in the
///      implementation bytecode; clones rebuild the domain separator for address(this).
///      The two EIP-712 fallback string slots are unused for this short name and sit with
///      the inherited layout. This source is for new deployments. Existing clones are not upgraded.
contract ArcBondVault is IArcBondVault, Pausable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    bytes32 private constant PAYMENT_INTENT_TYPEHASH = keccak256(
        "PaymentIntent(address vault,address agent,address recipient,address token,uint256 amount,bytes32 paymentId,uint256 nonce,uint256 deadline,uint256 policyVersion)"
    );

    /// @notice Official Arc USDC ERC-20 interface (6 decimals). Same address on testnet and mainnet.
    IERC20 public constant USDC = IERC20(0x3600000000000000000000000000000000000000);

    uint64 public constant PERIOD = 1 days;

    address public owner;
    address public pendingOwner;
    address public agent;
    uint64 public expiresAt;
    uint256 public maxPerPayment;
    uint256 public periodLimit;
    uint256 public spentInPeriod;
    uint64 public periodId;
    bool private _initialized;

    mapping(address => bool) public approvedRecipients;
    mapping(bytes32 => bool) public usedPaymentIds;
    uint256 public intentNonce;
    uint256 public policyVersion;

    event Deposited(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event PolicyUpdated(uint256 maxPerPayment, uint256 periodLimit, uint64 expiresAt);
    event RecipientUpdated(address indexed recipient, bool approved);
    event AgentAuthorized(address indexed agent);
    event AgentRevoked(address indexed agent);
    event PaymentExecuted(
        address indexed agent,
        address indexed recipient,
        uint256 amount,
        bytes32 indexed paymentId,
        uint64 periodId,
        uint256 spentInPeriod
    );
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event PolicyVersionChanged(uint256 policyVersion);
    event PaymentIntentExecuted(
        address indexed agent,
        address indexed recipient,
        address indexed submitter,
        uint256 amount,
        bytes32 paymentId,
        uint256 nonce,
        uint256 policyVersion
    );

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

    modifier onlyOwner() {
        if (msg.sender != owner) revert UnauthorizedOwner();
        _;
    }

    constructor() EIP712("ArcBondVault", "1") {
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

    function withdraw(uint256 amount) external nonReentrant onlyOwner {
        if (amount == 0) revert ZeroAmount();
        uint256 beforeBal = USDC.balanceOf(address(this));
        USDC.safeTransfer(msg.sender, amount);
        if (USDC.balanceOf(address(this)) != beforeBal - amount) revert TransferAmountMismatch();
        emit Withdrawn(msg.sender, amount);
    }

    function updatePolicy(uint256 maxPerPayment_, uint256 periodLimit_, uint64 expiresAt_) external onlyOwner {
        maxPerPayment = maxPerPayment_;
        periodLimit = periodLimit_;
        expiresAt = expiresAt_;
        emit PolicyUpdated(maxPerPayment_, periodLimit_, expiresAt_);
        _bumpPolicy();
    }

    function setRecipient(address recipient, bool approved) external onlyOwner {
        if (approved && (recipient == address(0) || recipient == address(this))) revert InvalidRecipient();
        approvedRecipients[recipient] = approved;
        emit RecipientUpdated(recipient, approved);
        _bumpPolicy();
    }

    function authorizeAgent(address agent_) external onlyOwner {
        if (agent_ == address(0) || agent_ == owner || agent_ == address(this)) revert InvalidAgent();
        agent = agent_;
        emit AgentAuthorized(agent_);
        _bumpPolicy();
    }

    function revokeAgent() external onlyOwner {
        address previous = agent;
        agent = address(0);
        expiresAt = 0;
        emit AgentRevoked(previous);
        _bumpPolicy();
    }

    /// @notice Agent-submitted payment. The transaction signature binds the calldata because msg.sender must be the agent.
    ///         This path does not accept an EIP-712 intent. Spending policy is the same as executePaymentIntent.
    function executePayment(address recipient, uint256 amount, bytes32 paymentId) external nonReentrant {
        if (paused()) revert VaultPaused();
        if (msg.sender == address(0) || msg.sender != agent) revert UnauthorizedAgent();
        if (block.timestamp >= expiresAt) revert AuthorizationExpired();
        if (amount == 0) revert ZeroAmount();
        if (amount > maxPerPayment) revert AmountExceedsLimit();
        if (!approvedRecipients[recipient]) revert RecipientNotApproved();
        if (paymentId == bytes32(0)) revert ZeroPaymentId();
        if (usedPaymentIds[paymentId]) revert PaymentIdUsed();

        _settle(msg.sender, recipient, amount, paymentId);
    }

    /// @notice Relayed payment. The agent signs the exact intent. The submitter does not have to be the agent.
    /// @dev deadline and expiresAt are exclusive: execution at that timestamp reverts. A valid signature does not bypass policy.
    function executePaymentIntent(PaymentIntent calldata intent, bytes calldata signature) external nonReentrant {
        if (paused()) revert VaultPaused();
        if (intent.vault != address(this)) revert WrongVault();
        if (intent.token != address(USDC)) revert WrongToken();
        if (intent.agent == address(0) || intent.agent != agent) revert UnauthorizedAgent();
        if (_recoverSigner(intent, signature) != intent.agent) revert InvalidSignature();
        if (block.timestamp >= expiresAt) revert AuthorizationExpired();
        if (block.timestamp >= intent.deadline) revert IntentExpired();
        if (intent.policyVersion != policyVersion) revert PolicyVersionMismatch();
        if (intent.nonce != intentNonce) revert InvalidNonce();
        if (intent.amount == 0) revert ZeroAmount();
        if (intent.amount > maxPerPayment) revert AmountExceedsLimit();
        if (!approvedRecipients[intent.recipient]) revert RecipientNotApproved();
        if (intent.paymentId == bytes32(0)) revert ZeroPaymentId();
        if (usedPaymentIds[intent.paymentId]) revert PaymentIdUsed();

        uint256 usedNonce = intentNonce;
        intentNonce = usedNonce + 1;
        _settle(intent.agent, intent.recipient, intent.amount, intent.paymentId);
        emit PaymentIntentExecuted(
            intent.agent, intent.recipient, msg.sender, intent.amount, intent.paymentId, usedNonce, intent.policyVersion
        );
    }

    function hashPaymentIntent(PaymentIntent calldata intent) external view returns (bytes32) {
        return _hashTypedDataV4(_hashIntent(intent));
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0) || newOwner == owner || newOwner == agent) revert InvalidOwner();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert UnauthorizedOwner();
        if (msg.sender == agent) revert InvalidOwner();
        address previous = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(previous, msg.sender);
    }

    function currentPeriodId() public view returns (uint64) {
        return uint64(block.timestamp / PERIOD);
    }

    function displayedSpentInPeriod() external view returns (uint256) {
        return currentPeriodId() == periodId ? spentInPeriod : 0;
    }

    function _settle(address payer, address recipient, uint256 amount, bytes32 paymentId) internal {
        _syncPeriod();
        if (spentInPeriod + amount > periodLimit) revert PeriodLimitExceeded();

        usedPaymentIds[paymentId] = true;
        spentInPeriod += amount;

        uint256 beforeBal = USDC.balanceOf(address(this));
        USDC.safeTransfer(recipient, amount);
        if (USDC.balanceOf(address(this)) != beforeBal - amount) revert TransferAmountMismatch();

        emit PaymentExecuted(payer, recipient, amount, paymentId, periodId, spentInPeriod);
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

    function _recoverSigner(PaymentIntent calldata intent, bytes calldata signature) internal view returns (address) {
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(_hashTypedDataV4(_hashIntent(intent)), signature);
        if (err != ECDSA.RecoverError.NoError) return address(0);
        return recovered;
    }

    function _bumpPolicy() internal {
        policyVersion += 1;
        emit PolicyVersionChanged(policyVersion);
    }

    function _syncPeriod() internal {
        uint64 current = currentPeriodId();
        if (current != periodId) {
            periodId = current;
            spentInPeriod = 0;
        }
    }
}
