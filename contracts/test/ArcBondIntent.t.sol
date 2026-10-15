// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ArcBondVault} from "../src/ArcBondVault.sol";
import {ArcBondVaultFactory} from "../src/ArcBondVaultFactory.sol";
import {IArcBondVault} from "../src/interfaces/IArcBondVault.sol";
import {MockUSDC, ShortTransferUSDC} from "./mocks/MockUSDC.sol";

contract ArcBondIntentTest is Test {
    address internal constant USDC = 0x3600000000000000000000000000000000000000;

    ArcBondVaultFactory internal factory;
    ArcBondVault internal vault;
    address internal owner = makeAddr("owner");
    uint256 internal agentKey = 0xA11CE;
    address internal agent;
    address internal recipient = makeAddr("recipient");
    address internal relayer = makeAddr("relayer");
    bytes32 internal constant PAYMENT_A = keccak256("invoice-1");
    /// @dev viem hashTypedData for this struct, domain ArcBondVault/1, chain 5042002, verifying contract 0x1111…1111.
    bytes32 internal constant EXPECTED_VIEM_DIGEST = 0xc8857c007e3ed4b502c4eee3ca3cf294f9145ff8280a770d8d3d7fade66d2416;

    function setUp() public {
        agent = vm.addr(agentKey);
        vm.etch(USDC, address(new MockUSDC()).code);
        factory = new ArcBondVaultFactory();
        vm.prank(owner);
        vault = ArcBondVault(factory.createVault());
        MockUSDC(USDC).mint(owner, 1_000_000e6);
        vm.startPrank(owner);
        IERC20(USDC).approve(address(vault), 100e6);
        vault.deposit(100e6);
        vault.updatePolicy(20e6, 50e6, uint64(block.timestamp + 30 days));
        vault.setRecipient(recipient, true);
        vault.authorizeAgent(agent);
        vm.stopPrank();
    }

    function test_signedIntentPaysFromARelayer() public {
        IArcBondVault.PaymentIntent memory intent = _intent(1e6, PAYMENT_A, block.timestamp + 1 days);
        bytes memory signature = _sign(agentKey, intent);
        vm.prank(relayer);
        vault.executePaymentIntent(intent, signature);

        assertEq(IERC20(USDC).balanceOf(recipient), 1e6);
        assertEq(IERC20(USDC).balanceOf(address(vault)), 99e6);
        assertEq(vault.intentNonce(), 1);
        assertEq(vault.spentInPeriod(), 1e6);
        assertTrue(vault.usedPaymentIds(PAYMENT_A));
    }

    function test_directExecutePaymentStillRequiresTheAgent() public {
        vm.prank(agent);
        vault.executePayment(recipient, 1e6, PAYMENT_A);
        assertEq(vault.intentNonce(), 0);
        assertEq(IERC20(USDC).balanceOf(recipient), 1e6);
    }

    function test_wrongSignerIsRejected() public {
        uint256 other = 0xBEEF;
        IArcBondVault.PaymentIntent memory intent = _intent(1e6, PAYMENT_A, block.timestamp + 1 days);
        bytes memory signature = _sign(other, intent);
        vm.expectRevert(ArcBondVault.InvalidSignature.selector);
        vault.executePaymentIntent(intent, signature);
        assertEq(vault.intentNonce(), 0);
        assertFalse(vault.usedPaymentIds(PAYMENT_A));
    }

    function test_malformedSignatureIsRejected() public {
        IArcBondVault.PaymentIntent memory intent = _intent(1e6, PAYMENT_A, block.timestamp + 1 days);
        vm.expectRevert(ArcBondVault.InvalidSignature.selector);
        vault.executePaymentIntent(intent, new bytes(64));
    }

    function test_alteredAmountInvalidatesTheSignature() public {
        IArcBondVault.PaymentIntent memory intent = _intent(1e6, PAYMENT_A, block.timestamp + 1 days);
        bytes memory signature = _sign(agentKey, intent);
        intent.amount = 2e6;
        vm.expectRevert(ArcBondVault.InvalidSignature.selector);
        vault.executePaymentIntent(intent, signature);
    }

    function test_alteredRecipientInvalidatesTheSignature() public {
        IArcBondVault.PaymentIntent memory intent = _intent(1e6, PAYMENT_A, block.timestamp + 1 days);
        bytes memory signature = _sign(agentKey, intent);
        address other = makeAddr("other-recipient");
        vm.prank(owner);
        vault.setRecipient(other, true);
        intent.policyVersion = vault.policyVersion();
        intent.recipient = other;
        vm.expectRevert(ArcBondVault.InvalidSignature.selector);
        vault.executePaymentIntent(intent, signature);
    }

    function test_signatureCannotBeReplayedOnAnotherVault() public {
        IArcBondVault.PaymentIntent memory intent = _intent(1e6, PAYMENT_A, block.timestamp + 1 days);
        bytes memory signature = _sign(agentKey, intent);
        vm.startPrank(owner);
        ArcBondVault other = ArcBondVault(factory.createVault());
        other.authorizeAgent(agent);
        vm.stopPrank();
        vm.expectRevert(ArcBondVault.WrongVault.selector);
        other.executePaymentIntent(intent, signature);

        intent.vault = address(other);
        vm.expectRevert(ArcBondVault.InvalidSignature.selector);
        other.executePaymentIntent(intent, signature);
    }

    function test_chainIdIsPartOfTheDigest() public {
        IArcBondVault.PaymentIntent memory intent = _intent(1e6, PAYMENT_A, block.timestamp + 1 days);
        bytes memory signature = _sign(agentKey, intent);
        vm.chainId(block.chainid + 1);
        vm.expectRevert(ArcBondVault.InvalidSignature.selector);
        vault.executePaymentIntent(intent, signature);
        assertEq(vault.intentNonce(), 0);
    }

    function test_replayedNonceIsRejected() public {
        IArcBondVault.PaymentIntent memory intent = _intent(1e6, PAYMENT_A, block.timestamp + 1 days);
        bytes memory signature = _sign(agentKey, intent);
        vault.executePaymentIntent(intent, signature);
        vm.expectRevert(ArcBondVault.InvalidNonce.selector);
        vault.executePaymentIntent(intent, signature);
        assertEq(IERC20(USDC).balanceOf(recipient), 1e6);
    }

    function test_samePaymentIdCannotSettleTwiceAcrossNonce() public {
        IArcBondVault.PaymentIntent memory first = _intent(1e6, PAYMENT_A, block.timestamp + 1 days);
        vault.executePaymentIntent(first, _sign(agentKey, first));
        IArcBondVault.PaymentIntent memory second = _intent(1e6, PAYMENT_A, block.timestamp + 1 days);
        second.nonce = 1;
        bytes memory signature = _sign(agentKey, second);
        vm.expectRevert(ArcBondVault.PaymentIdUsed.selector);
        vault.executePaymentIntent(second, signature);
    }

    function test_paymentIdScopeIsPerVault() public {
        vm.prank(owner);
        ArcBondVault other = ArcBondVault(factory.createVault());
        vm.startPrank(owner);
        IERC20(USDC).approve(address(other), 10e6);
        other.deposit(10e6);
        other.updatePolicy(20e6, 50e6, uint64(block.timestamp + 30 days));
        other.setRecipient(recipient, true);
        other.authorizeAgent(agent);
        vm.stopPrank();

        IArcBondVault.PaymentIntent memory first = _intent(1e6, PAYMENT_A, block.timestamp + 1 days);
        vault.executePaymentIntent(first, _sign(agentKey, first));

        IArcBondVault.PaymentIntent memory second = IArcBondVault.PaymentIntent({
            vault: address(other),
            agent: agent,
            recipient: recipient,
            token: USDC,
            amount: 1e6,
            paymentId: PAYMENT_A,
            nonce: 0,
            deadline: block.timestamp + 1 days,
            policyVersion: other.policyVersion()
        });
        other.executePaymentIntent(second, _sign(agentKey, second));
        assertEq(IERC20(USDC).balanceOf(recipient), 2e6);
    }

    function test_deadlineBoundaryIsExclusive() public {
        IArcBondVault.PaymentIntent memory expired = _intent(1e6, PAYMENT_A, block.timestamp);
        bytes memory expiredSignature = _sign(agentKey, expired);
        vm.expectRevert(ArcBondVault.IntentExpired.selector);
        vault.executePaymentIntent(expired, expiredSignature);

        uint256 deadline = block.timestamp + 10;
        IArcBondVault.PaymentIntent memory intent = _intent(1e6, PAYMENT_A, deadline);
        bytes memory signature = _sign(agentKey, intent);
        vm.warp(deadline);
        vm.expectRevert(ArcBondVault.IntentExpired.selector);
        vault.executePaymentIntent(intent, signature);

        vm.warp(deadline - 1);
        vault.executePaymentIntent(intent, signature);
        assertEq(vault.intentNonce(), 1);
    }

    function test_policyChangeInvalidatesAnOutstandingIntent() public {
        IArcBondVault.PaymentIntent memory intent = _intent(1e6, PAYMENT_A, block.timestamp + 1 days);
        bytes memory signature = _sign(agentKey, intent);
        vm.prank(owner);
        vault.updatePolicy(20e6, 50e6, uint64(block.timestamp + 30 days));
        vm.expectRevert(ArcBondVault.PolicyVersionMismatch.selector);
        vault.executePaymentIntent(intent, signature);
        assertEq(vault.intentNonce(), 0);
    }

    function test_validSignatureCannotExceedThePerPaymentCap() public {
        IArcBondVault.PaymentIntent memory intent = _intent(21e6, PAYMENT_A, block.timestamp + 1 days);
        bytes memory signature = _sign(agentKey, intent);
        vm.expectRevert(ArcBondVault.AmountExceedsLimit.selector);
        vault.executePaymentIntent(intent, signature);
    }

    function test_validSignatureCannotExceedThePeriodCap() public {
        IArcBondVault.PaymentIntent memory first = _intent(20e6, PAYMENT_A, block.timestamp + 1 days);
        vault.executePaymentIntent(first, _sign(agentKey, first));
        IArcBondVault.PaymentIntent memory second = _intent(31e6, keccak256("invoice-2"), block.timestamp + 1 days);
        second.nonce = 1;
        vm.prank(owner);
        vault.updatePolicy(40e6, 50e6, uint64(block.timestamp + 30 days));
        second.policyVersion = vault.policyVersion();
        bytes memory signature = _sign(agentKey, second);
        vm.expectRevert(ArcBondVault.PeriodLimitExceeded.selector);
        vault.executePaymentIntent(second, signature);
        assertEq(vault.spentInPeriod(), 20e6);
        assertEq(vault.intentNonce(), 1);
    }

    function test_unapprovedRecipientIsRejectedAfterAValidSignature() public {
        address stranger = makeAddr("stranger");
        IArcBondVault.PaymentIntent memory intent = _intent(1e6, PAYMENT_A, block.timestamp + 1 days);
        intent.recipient = stranger;
        bytes memory signature = _sign(agentKey, intent);
        vm.expectRevert(ArcBondVault.RecipientNotApproved.selector);
        vault.executePaymentIntent(intent, signature);
    }

    function test_revokedAgentCannotExecuteAPreviouslySignedIntent() public {
        IArcBondVault.PaymentIntent memory intent = _intent(1e6, PAYMENT_A, block.timestamp + 1 days);
        bytes memory signature = _sign(agentKey, intent);
        vm.prank(owner);
        vault.revokeAgent();
        vm.expectRevert(ArcBondVault.UnauthorizedAgent.selector);
        vault.executePaymentIntent(intent, signature);
    }

    function test_pausedVaultRejectsAValidIntent() public {
        IArcBondVault.PaymentIntent memory intent = _intent(1e6, PAYMENT_A, block.timestamp + 1 days);
        bytes memory signature = _sign(agentKey, intent);
        vm.prank(owner);
        vault.pause();
        vm.expectRevert(ArcBondVault.VaultPaused.selector);
        vault.executePaymentIntent(intent, signature);
    }

    function test_agentAuthorizationExpiryIsCheckedAtExecution() public {
        IArcBondVault.PaymentIntent memory intent = _intent(1e6, PAYMENT_A, block.timestamp + 10 days);
        bytes memory signature = _sign(agentKey, intent);
        vm.warp(block.timestamp + 30 days);
        vm.expectRevert(ArcBondVault.AuthorizationExpired.selector);
        vault.executePaymentIntent(intent, signature);
    }

    function test_shortTransferDoesNotConsumeNonceOrPaymentId() public {
        IArcBondVault.PaymentIntent memory intent = _intent(1e6, PAYMENT_A, block.timestamp + 1 days);
        bytes memory signature = _sign(agentKey, intent);
        vm.etch(USDC, address(new ShortTransferUSDC()).code);
        ShortTransferUSDC(USDC).setSkimFrom(address(vault));
        vm.expectRevert(ArcBondVault.TransferAmountMismatch.selector);
        vault.executePaymentIntent(intent, signature);
        assertEq(vault.intentNonce(), 0);
        assertFalse(vault.usedPaymentIds(PAYMENT_A));
    }

    function test_futureNonceIsRejected() public {
        IArcBondVault.PaymentIntent memory intent = _intent(1e6, PAYMENT_A, block.timestamp + 1 days);
        intent.nonce = 1;
        bytes memory signature = _sign(agentKey, intent);
        vm.expectRevert(ArcBondVault.InvalidNonce.selector);
        vault.executePaymentIntent(intent, signature);
    }

    function test_alteredTokenIsRejected() public {
        IArcBondVault.PaymentIntent memory intent = _intent(1e6, PAYMENT_A, block.timestamp + 1 days);
        bytes memory signature = _sign(agentKey, intent);
        intent.token = address(1);
        vm.expectRevert(ArcBondVault.WrongToken.selector);
        vault.executePaymentIntent(intent, signature);
    }

    function test_substitutedAgentIsRejected() public {
        IArcBondVault.PaymentIntent memory intent = _intent(1e6, PAYMENT_A, block.timestamp + 1 days);
        bytes memory signature = _sign(agentKey, intent);
        uint256 otherKey = 0xB0B;
        address otherAgent = vm.addr(otherKey);
        vm.prank(owner);
        vault.authorizeAgent(otherAgent);
        intent.agent = otherAgent;
        intent.policyVersion = vault.policyVersion();
        vm.expectRevert(ArcBondVault.InvalidSignature.selector);
        vault.executePaymentIntent(intent, signature);
    }

    function test_schemaMismatchIsRejected() public {
        IArcBondVault.PaymentIntent memory intent = _intent(1e6, PAYMENT_A, block.timestamp + 1 days);
        bytes32 wrong = keccak256("PaymentIntent(address recipient,uint256 amount)");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(agentKey, wrong);
        vm.expectRevert(ArcBondVault.InvalidSignature.selector);
        vault.executePaymentIntent(intent, abi.encodePacked(r, s, v));
    }

    function test_emptySignatureIsRejected() public {
        IArcBondVault.PaymentIntent memory intent = _intent(1e6, PAYMENT_A, block.timestamp + 1 days);
        vm.expectRevert(ArcBondVault.InvalidSignature.selector);
        vault.executePaymentIntent(intent, "");
    }

    function test_unpauseDoesNotInvalidateAnIntent() public {
        IArcBondVault.PaymentIntent memory intent = _intent(1e6, PAYMENT_A, block.timestamp + 1 days);
        bytes memory signature = _sign(agentKey, intent);
        uint256 version = vault.policyVersion();
        vm.startPrank(owner);
        vault.pause();
        vault.unpause();
        vm.stopPrank();
        assertEq(vault.policyVersion(), version);
        vm.prank(relayer);
        vault.executePaymentIntent(intent, signature);
        assertEq(vault.intentNonce(), 1);
    }

    function test_digestChangesWhenAnyFieldChanges() public {
        IArcBondVault.PaymentIntent memory intent = _intent(1e6, PAYMENT_A, block.timestamp + 1 days);
        bytes32 original = vault.hashPaymentIntent(intent);
        intent.amount += 1;
        assertTrue(vault.hashPaymentIntent(intent) != original);
        intent.amount -= 1;
        intent.recipient = makeAddr("digest-recipient");
        assertTrue(vault.hashPaymentIntent(intent) != original);
        intent.recipient = recipient;
        intent.vault = address(1);
        assertTrue(vault.hashPaymentIntent(intent) != original);
        intent.vault = address(vault);
        intent.token = address(1);
        assertTrue(vault.hashPaymentIntent(intent) != original);
        intent.token = USDC;
        intent.agent = address(1);
        assertTrue(vault.hashPaymentIntent(intent) != original);
        intent.agent = agent;
        intent.paymentId = keccak256("other");
        assertTrue(vault.hashPaymentIntent(intent) != original);
        intent.paymentId = PAYMENT_A;
        intent.nonce += 1;
        assertTrue(vault.hashPaymentIntent(intent) != original);
        intent.nonce -= 1;
        intent.deadline += 1;
        assertTrue(vault.hashPaymentIntent(intent) != original);
        intent.deadline -= 1;
        intent.policyVersion += 1;
        assertTrue(vault.hashPaymentIntent(intent) != original);
    }

    function test_digestMatchesTheViemVector() public {
        address pinned = address(0x1111111111111111111111111111111111111111);
        vm.etch(pinned, address(new ArcBondVault()).code);
        IArcBondVault.PaymentIntent memory intent = IArcBondVault.PaymentIntent({
            vault: pinned,
            agent: address(0x2222222222222222222222222222222222222222),
            recipient: address(0x3333333333333333333333333333333333333333),
            token: USDC,
            amount: 500_000,
            paymentId: 0x4444444444444444444444444444444444444444444444444444444444444444,
            nonce: 0,
            deadline: 1_800_000_000,
            policyVersion: 3
        });
        vm.chainId(5042002);
        assertEq(ArcBondVault(pinned).hashPaymentIntent(intent), EXPECTED_VIEM_DIGEST);
    }

    function testFuzz_otherKeyCannotSpend(uint96 rawAmount, uint256 keySeed) public {
        uint256 amount = bound(uint256(rawAmount), 1, 10e6);
        uint256 key = bound(keySeed, 2, type(uint128).max);
        vm.assume(vm.addr(key) != agent);
        IArcBondVault.PaymentIntent memory intent = _intent(amount, keccak256(abi.encode(key, amount)), block.timestamp + 1 days);
        bytes memory signature = _sign(key, intent);
        vm.expectRevert(ArcBondVault.InvalidSignature.selector);
        vault.executePaymentIntent(intent, signature);
        assertEq(IERC20(USDC).balanceOf(address(vault)), 100e6);
    }

    function _intent(uint256 amount, bytes32 paymentId, uint256 deadline)
        internal
        view
        returns (IArcBondVault.PaymentIntent memory)
    {
        return IArcBondVault.PaymentIntent({
            vault: address(vault),
            agent: agent,
            recipient: recipient,
            token: USDC,
            amount: amount,
            paymentId: paymentId,
            nonce: vault.intentNonce(),
            deadline: deadline,
            policyVersion: vault.policyVersion()
        });
    }

    function _sign(uint256 key, IArcBondVault.PaymentIntent memory intent) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, ArcBondVault(intent.vault).hashPaymentIntent(intent));
        return abi.encodePacked(r, s, v);
    }
}
