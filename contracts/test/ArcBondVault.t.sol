// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ArcBondVault} from "../src/ArcBondVault.sol";
import {ArcBondVaultFactory} from "../src/ArcBondVaultFactory.sol";
import {MockUSDC, MockUSDCWrongDecimals, ReenteringUSDC, ShortTransferUSDC} from "./mocks/MockUSDC.sol";

contract ArcBondVaultTest is Test {
    address internal constant USDC = 0x3600000000000000000000000000000000000000;

    ArcBondVaultFactory internal factory;
    ArcBondVault internal vault;

    address internal owner = makeAddr("owner");
    address internal agent = makeAddr("agent");
    address internal recipient = makeAddr("recipient");
    address internal stranger = makeAddr("stranger");

    bytes32 internal constant PAYMENT_A = keccak256("payment-a");
    bytes32 internal constant PAYMENT_B = keccak256("payment-b");

    function setUp() public {
        _etch(address(new MockUSDC()));
        factory = new ArcBondVaultFactory();
        vm.prank(owner);
        vault = ArcBondVault(factory.createVault());
        MockUSDC(USDC).mint(owner, 1_000_000e6);
    }

    function test_createVault_setsOwnerAndRegistry() public view {
        assertEq(vault.owner(), owner);
        assertTrue(factory.isVault(address(vault)));
        address[] memory list = factory.vaultsOf(owner);
        assertEq(list.length, 1);
        assertEq(list[0], address(vault));
        assertEq(factory.vaultCount(owner), 1);
        assertEq(factory.VERSION(), 2);
    }

    function test_implementation_cannotInitialize() public {
        ArcBondVault implementation = ArcBondVault(factory.implementation());
        vm.expectRevert(ArcBondVault.AlreadyInitialized.selector);
        implementation.initialize(owner);
    }

    function test_clone_secondInitializeReverts() public {
        vm.expectRevert(ArcBondVault.AlreadyInitialized.selector);
        vault.initialize(stranger);
    }

    function test_wrongDecimals_revertsOnImplementationDeploy() public {
        _etch(address(new MockUSDCWrongDecimals()));
        vm.expectRevert(ArcBondVault.InvalidTokenDecimals.selector);
        new ArcBondVault();
        _etch(address(new MockUSDC()));
    }

    function test_deposit_movesExactAmount() public {
        uint256 amount = 100e6;
        _approve(owner, amount);
        vm.prank(owner);
        vault.deposit(amount);
        assertEq(IERC20(USDC).balanceOf(address(vault)), amount);
        assertEq(IERC20(USDC).balanceOf(owner), 1_000_000e6 - amount);
    }

    function test_anyoneCanDeposit() public {
        MockUSDC(USDC).mint(stranger, 5e6);
        _approve(stranger, 5e6);
        vm.prank(stranger);
        vault.deposit(5e6);
        assertEq(IERC20(USDC).balanceOf(address(vault)), 5e6);
        assertEq(vault.owner(), owner);
    }

    function test_depositZeroReverts() public {
        vm.prank(owner);
        vm.expectRevert(ArcBondVault.ZeroAmount.selector);
        vault.deposit(0);
    }

    function test_authorizedPayment() public {
        _readyVault(100e6, 20e6, 50e6);
        vm.prank(agent);
        vault.executePayment(recipient, 5e6, PAYMENT_A);
        assertEq(IERC20(USDC).balanceOf(recipient), 5e6);
        assertEq(vault.spentInPeriod(), 5e6);
        assertTrue(vault.usedPaymentIds(PAYMENT_A));
    }

    function test_unauthorizedAgentReverts() public {
        _readyVault(100e6, 20e6, 50e6);
        vm.prank(stranger);
        vm.expectRevert(ArcBondVault.UnauthorizedAgent.selector);
        vault.executePayment(recipient, 1e6, PAYMENT_A);
    }

    function test_zeroAmountPaymentReverts() public {
        _readyVault(100e6, 20e6, 50e6);
        vm.prank(agent);
        vm.expectRevert(ArcBondVault.ZeroAmount.selector);
        vault.executePayment(recipient, 0, PAYMENT_A);
    }

    function test_amountExceedsPerPaymentLimit() public {
        _readyVault(100e6, 2e6, 50e6);
        vm.prank(agent);
        vm.expectRevert(ArcBondVault.AmountExceedsLimit.selector);
        vault.executePayment(recipient, 5e6, PAYMENT_A);
    }

    function test_zeroCapsRejectPayments() public {
        _readyVault(100e6, 0, 50e6);
        vm.prank(agent);
        vm.expectRevert(ArcBondVault.AmountExceedsLimit.selector);
        vault.executePayment(recipient, 1, PAYMENT_A);

        vm.prank(owner);
        vault.updatePolicy(10e6, 0, uint64(block.timestamp + 30 days));
        vm.prank(agent);
        vm.expectRevert(ArcBondVault.PeriodLimitExceeded.selector);
        vault.executePayment(recipient, 1, PAYMENT_B);
    }

    function test_periodLimitExceeded() public {
        _readyVault(100e6, 20e6, 6e6);
        vm.prank(agent);
        vault.executePayment(recipient, 5e6, PAYMENT_A);
        vm.prank(agent);
        vm.expectRevert(ArcBondVault.PeriodLimitExceeded.selector);
        vault.executePayment(recipient, 2e6, PAYMENT_B);
    }

    function test_periodBoundaryResetsSpend() public {
        _readyVault(100e6, 20e6, 6e6);
        vm.prank(agent);
        vault.executePayment(recipient, 5e6, PAYMENT_A);
        vm.warp(block.timestamp + 1 days);
        vm.prank(agent);
        vault.executePayment(recipient, 5e6, PAYMENT_B);
        assertEq(vault.spentInPeriod(), 5e6);
        assertEq(IERC20(USDC).balanceOf(recipient), 10e6);
    }

    function test_policyUpdateDoesNotResetSpend() public {
        _readyVault(100e6, 20e6, 20e6);
        vm.prank(agent);
        vault.executePayment(recipient, 10e6, PAYMENT_A);
        vm.prank(owner);
        vault.updatePolicy(20e6, 12e6, uint64(block.timestamp + 30 days));
        vm.prank(agent);
        vm.expectRevert(ArcBondVault.PeriodLimitExceeded.selector);
        vault.executePayment(recipient, 5e6, PAYMENT_B);
        assertEq(vault.spentInPeriod(), 10e6);
    }

    function test_unapprovedRecipientReverts() public {
        _readyVault(100e6, 20e6, 50e6);
        vm.prank(agent);
        vm.expectRevert(ArcBondVault.RecipientNotApproved.selector);
        vault.executePayment(stranger, 1e6, PAYMENT_A);
    }

    function test_emptyAllowlistRejectsPayment() public {
        _deposit(100e6);
        vm.startPrank(owner);
        vault.updatePolicy(20e6, 50e6, uint64(block.timestamp + 30 days));
        vault.authorizeAgent(agent);
        vm.stopPrank();
        vm.prank(agent);
        vm.expectRevert(ArcBondVault.RecipientNotApproved.selector);
        vault.executePayment(recipient, 1e6, PAYMENT_A);
    }

    function test_cannotApproveZeroOrSelf() public {
        vm.prank(owner);
        vm.expectRevert(ArcBondVault.InvalidRecipient.selector);
        vault.setRecipient(address(0), true);
        vm.prank(owner);
        vm.expectRevert(ArcBondVault.InvalidRecipient.selector);
        vault.setRecipient(address(vault), true);
    }

    function test_duplicatePaymentIdReverts() public {
        _readyVault(100e6, 20e6, 50e6);
        vm.prank(agent);
        vault.executePayment(recipient, 1e6, PAYMENT_A);
        vm.prank(agent);
        vm.expectRevert(ArcBondVault.PaymentIdUsed.selector);
        vault.executePayment(recipient, 1e6, PAYMENT_A);
    }

    function test_zeroPaymentIdReverts() public {
        _readyVault(100e6, 20e6, 50e6);
        vm.prank(agent);
        vm.expectRevert(ArcBondVault.ZeroPaymentId.selector);
        vault.executePayment(recipient, 1e6, bytes32(0));
    }

    function test_expiredAuthorizationReverts() public {
        _readyVault(100e6, 20e6, 50e6);
        vm.warp(block.timestamp + 31 days);
        vm.prank(agent);
        vm.expectRevert(ArcBondVault.AuthorizationExpired.selector);
        vault.executePayment(recipient, 1e6, PAYMENT_A);
    }

    function test_revokeDoesNotNeedAgentKey() public {
        _readyVault(100e6, 20e6, 50e6);
        vm.prank(owner);
        vault.revokeAgent();
        assertEq(vault.agent(), address(0));
        assertEq(vault.expiresAt(), 0);
        vm.prank(agent);
        vm.expectRevert(ArcBondVault.UnauthorizedAgent.selector);
        vault.executePayment(recipient, 1e6, PAYMENT_A);
        assertFalse(vault.usedPaymentIds(PAYMENT_A));
    }

    function test_pauseBlocksPaymentButAllowsWithdraw() public {
        _readyVault(100e6, 20e6, 50e6);
        vm.prank(owner);
        vault.pause();
        vm.prank(agent);
        vm.expectRevert(ArcBondVault.VaultPaused.selector);
        vault.executePayment(recipient, 1e6, PAYMENT_A);
        uint256 beforeOwner = IERC20(USDC).balanceOf(owner);
        vm.prank(owner);
        vault.withdraw(40e6);
        assertEq(IERC20(USDC).balanceOf(owner), beforeOwner + 40e6);
    }

    function test_agentCannotChangePolicyOrWithdraw() public {
        _readyVault(100e6, 20e6, 50e6);
        vm.startPrank(agent);
        vm.expectRevert(ArcBondVault.UnauthorizedOwner.selector);
        vault.updatePolicy(1, 1, 1);
        vm.expectRevert(ArcBondVault.UnauthorizedOwner.selector);
        vault.setRecipient(stranger, true);
        vm.expectRevert(ArcBondVault.UnauthorizedOwner.selector);
        vault.withdraw(1e6);
        vm.expectRevert(ArcBondVault.UnauthorizedOwner.selector);
        vault.pause();
        vm.expectRevert(ArcBondVault.UnauthorizedOwner.selector);
        vault.transferOwnership(stranger);
        vm.stopPrank();
    }

    function test_agentCannotWithdraw() public {
        _readyVault(100e6, 20e6, 50e6);
        vm.prank(agent);
        vm.expectRevert(ArcBondVault.UnauthorizedOwner.selector);
        vault.withdraw(1e6);
    }

    function test_shortTransferRevertsAndDoesNotConsumeId() public {
        _etch(address(new ShortTransferUSDC()));
        factory = new ArcBondVaultFactory();
        vm.prank(owner);
        vault = ArcBondVault(factory.createVault());
        ShortTransferUSDC(USDC).mint(owner, 1_000e6);
        ShortTransferUSDC(USDC).setSkimFrom(address(vault));
        _readyVault(100e6, 20e6, 50e6);
        vm.prank(agent);
        vm.expectRevert(ArcBondVault.TransferAmountMismatch.selector);
        vault.executePayment(recipient, 5e6, PAYMENT_A);
        assertFalse(vault.usedPaymentIds(PAYMENT_A));
        assertEq(vault.spentInPeriod(), 0);
    }

    function test_reentrancyCannotDoubleSpend() public {
        ReenteringUSDC token = new ReenteringUSDC();
        _etch(address(token));
        factory = new ArcBondVaultFactory();
        vm.prank(owner);
        vault = ArcBondVault(factory.createVault());
        ReenteringUSDC(USDC).mint(owner, 1_000e6);
        _readyVault(100e6, 20e6, 50e6);

        bytes memory data = abi.encodeWithSelector(ArcBondVault.executePayment.selector, recipient, 1e6, PAYMENT_B);
        ReenteringUSDC(USDC).arm(address(vault), data);

        vm.prank(agent);
        vault.executePayment(recipient, 5e6, PAYMENT_A);

        assertEq(IERC20(USDC).balanceOf(recipient), 5e6);
        assertFalse(vault.usedPaymentIds(PAYMENT_B));
    }

    function test_nativeValueToVaultReverts() public {
        vm.deal(stranger, 1 ether);
        vm.prank(stranger);
        (bool ok,) = address(vault).call{value: 1 ether}("");
        assertFalse(ok);
        assertEq(address(vault).balance, 0);
    }

    function test_depositWithMsgValueReverts() public {
        vm.deal(owner, 1 ether);
        _approve(owner, 1e6);
        vm.prank(owner);
        (bool ok,) = address(vault).call{value: 1}(abi.encodeWithSelector(ArcBondVault.deposit.selector, 1e6));
        assertFalse(ok);
        assertEq(IERC20(USDC).balanceOf(address(vault)), 0);
    }

    function test_ownerCannotBeAgent() public {
        vm.prank(owner);
        vm.expectRevert(ArcBondVault.InvalidAgent.selector);
        vault.authorizeAgent(owner);
        vm.prank(owner);
        vm.expectRevert(ArcBondVault.InvalidAgent.selector);
        vault.authorizeAgent(address(0));
    }

    function test_twoStepOwnership() public {
        _readyVault(100e6, 20e6, 50e6);
        vm.prank(owner);
        vault.transferOwnership(stranger);
        assertEq(vault.owner(), owner);
        assertEq(vault.pendingOwner(), stranger);
        vm.prank(stranger);
        vault.acceptOwnership();
        assertEq(vault.owner(), stranger);
        vm.prank(owner);
        vm.expectRevert(ArcBondVault.UnauthorizedOwner.selector);
        vault.withdraw(1e6);
        vm.prank(stranger);
        vault.withdraw(10e6);
        assertEq(IERC20(USDC).balanceOf(stranger), 10e6);
    }

    function test_newPaymentIdStillFacesOtherRules() public {
        _readyVault(100e6, 2e6, 50e6);
        vm.prank(agent);
        vault.executePayment(recipient, 1e6, PAYMENT_A);
        vm.prank(agent);
        vm.expectRevert(ArcBondVault.AmountExceedsLimit.selector);
        vault.executePayment(recipient, 3e6, PAYMENT_B);
    }

    function _etch(address source) internal {
        vm.etch(USDC, source.code);
    }

    function _approve(address from, uint256 amount) internal {
        vm.prank(from);
        IERC20(USDC).approve(address(vault), amount);
    }

    function _deposit(uint256 amount) internal {
        _approve(owner, amount);
        vm.prank(owner);
        vault.deposit(amount);
    }

    function _readyVault(uint256 depositAmount, uint256 maxPer, uint256 periodCap) internal {
        _deposit(depositAmount);
        vm.startPrank(owner);
        vault.updatePolicy(maxPer, periodCap, uint64(block.timestamp + 30 days));
        vault.setRecipient(recipient, true);
        vault.authorizeAgent(agent);
        vm.stopPrank();
    }
}
