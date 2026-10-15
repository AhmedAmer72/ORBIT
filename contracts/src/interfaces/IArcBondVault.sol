// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IArcBondVault {
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

    function initialize(address owner_) external;

    function deposit(uint256 amount) external;

    function withdraw(uint256 amount) external;

    function updatePolicy(uint256 maxPerPayment, uint256 periodLimit, uint64 expiresAt) external;

    function setRecipient(address recipient, bool approved) external;

    function authorizeAgent(address agent) external;

    function revokeAgent() external;

    function executePayment(address recipient, uint256 amount, bytes32 paymentId) external;

    function executePaymentIntent(PaymentIntent calldata intent, bytes calldata signature) external;

    function hashPaymentIntent(PaymentIntent calldata intent) external view returns (bytes32);

    function intentNonce() external view returns (uint256);

    function policyVersion() external view returns (uint256);

    function pause() external;

    function unpause() external;

    function transferOwnership(address newOwner) external;

    function acceptOwnership() external;
}
