// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ArcBondWorkspace} from "../src/ArcBondWorkspace.sol";
import {ArcBondWorkspaceFactory} from "../src/ArcBondWorkspaceFactory.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract ArcBondWorkspaceTest is Test {
    address internal constant USDC = 0x3600000000000000000000000000000000000000;

    ArcBondWorkspaceFactory internal factory;
    ArcBondWorkspace internal workspace;

    address internal owner = makeAddr("owner");
    uint256 internal agentKey;
    address internal agent;
    uint256 internal otherKey;
    address internal otherAgent;
    address internal provider = makeAddr("provider");
    address internal stranger = makeAddr("stranger");

    bytes32 internal constant SESSION = keccak256("session-1");

    function setUp() public {
        vm.etch(USDC, address(new MockUSDC()).code);
        (agent, agentKey) = makeAddrAndKey("agent");
        (otherAgent, otherKey) = makeAddrAndKey("other");
        factory = new ArcBondWorkspaceFactory();
        vm.prank(owner);
        workspace = ArcBondWorkspace(factory.createWorkspace());
        MockUSDC(USDC).mint(owner, 1_000_000e6);
        _fund(100e6);
        vm.startPrank(owner);
        workspace.setWorkspacePeriodLimit(10e6);
        workspace.setRecipient(provider, true);
        workspace.authorizeAgent(agent, 2e6, 6e6, uint64(block.timestamp + 2 days));
        workspace.authorizeAgent(otherAgent, 2e6, 6e6, uint64(block.timestamp + 2 days));
        vm.stopPrank();
    }

    function test_factory_registersWorkspace() public view {
        assertEq(factory.VERSION(), 1);
        assertEq(workspace.VERSION(), 1);
        assertTrue(factory.isWorkspace(address(workspace)));
        assertEq(factory.workspacesOf(owner)[0], address(workspace));
        assertEq(workspace.owner(), owner);
    }

    function test_implementation_cannotInitialize() public {
        ArcBondWorkspace implementation = ArcBondWorkspace(factory.implementation());
        vm.expectRevert(ArcBondWorkspace.AlreadyInitialized.selector);
        implementation.initialize(owner);
    }

    function test_sharedCap_blocksSecondAgent() public {
        uint64 expiry = uint64(block.timestamp + 2 days);
        vm.startPrank(owner);
        workspace.authorizeAgent(agent, 10e6, 10e6, expiry);
        workspace.authorizeAgent(otherAgent, 10e6, 10e6, expiry);
        vm.stopPrank();
        vm.prank(agent);
        workspace.executePayment(provider, 6e6, keccak256("a"));
        vm.prank(otherAgent);
        vm.expectRevert(ArcBondWorkspace.PeriodLimitExceeded.selector);
        workspace.executePayment(provider, 5e6, keccak256("b"));
        assertEq(IERC20(USDC).balanceOf(provider), 6e6);
        assertEq(workspace.spentInPeriod(), 6e6);
    }

    function test_perAgentCap_isIndependentOfSharedRoom() public {
        vm.prank(owner);
        workspace.setWorkspacePeriodLimit(20e6);
        vm.prank(agent);
        workspace.executePayment(provider, 2e6, keccak256("a1"));
        vm.prank(agent);
        workspace.executePayment(provider, 2e6, keccak256("a2"));
        vm.prank(agent);
        workspace.executePayment(provider, 2e6, keccak256("a3"));
        vm.prank(agent);
        vm.expectRevert(ArcBondWorkspace.PeriodLimitExceeded.selector);
        workspace.executePayment(provider, 1e6, keccak256("a4"));
        vm.prank(otherAgent);
        workspace.executePayment(provider, 2e6, keccak256("b1"));
        assertEq(workspace.spentInPeriod(), 8e6);
    }

    function test_reservation_blocksImmediatePaymentOfSameFunds() public {
        uint64 expiry = uint64(block.timestamp + 2 days);
        vm.startPrank(owner);
        workspace.authorizeAgent(agent, 10e6, 10e6, expiry);
        workspace.authorizeAgent(otherAgent, 10e6, 10e6, expiry);
        workspace.openSession(SESSION, agent, provider, 6e6, uint64(block.timestamp + 1 days), keccak256("price"));
        vm.stopPrank();
        vm.prank(otherAgent);
        vm.expectRevert(ArcBondWorkspace.PeriodLimitExceeded.selector);
        workspace.executePayment(provider, 5e6, keccak256("race"));
        assertEq(workspace.availableBalance(), 94e6);
        assertEq(workspace.reserved(), 6e6);
    }

    function test_withdraw_cannotTakeReservedFunds() public {
        vm.prank(owner);
        workspace.openSession(SESSION, agent, provider, 6e6, uint64(block.timestamp + 1 days), keccak256("price"));
        vm.prank(owner);
        vm.expectRevert(ArcBondWorkspace.FundsReserved.selector);
        workspace.withdraw(95e6);
        vm.prank(owner);
        workspace.withdraw(94e6);
        assertEq(workspace.availableBalance(), 0);
        assertEq(IERC20(USDC).balanceOf(address(workspace)), 6e6);
    }

    function test_voucher_paysIncrementalOnly() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        vm.prank(owner);
        workspace.openSession(SESSION, agent, provider, 4e6, deadline, keccak256("price"));
        uint256 version = workspace.policyVersion();

        _settle(1, 1e6, deadline, version);
        assertEq(IERC20(USDC).balanceOf(provider), 1e6);

        _expectSettle(ArcBondWorkspace.ZeroAmount.selector, 2, 1e6, deadline, version);

        _settle(3, 3e6, deadline, version);
        assertEq(IERC20(USDC).balanceOf(provider), 3e6);
        assertEq(workspace.reserved(), 1e6);

        _expectSettle(ArcBondWorkspace.StaleVoucher.selector, 3, 4e6, deadline, version);
    }

    function test_voucher_rejectsWrongProviderAndStaleSequence() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        vm.prank(owner);
        workspace.openSession(SESSION, agent, provider, 4e6, deadline, keccak256("price"));
        ArcBondWorkspace.UsageVoucher memory voucher = _voucher(1, 1e6, deadline, workspace.policyVersion());
        voucher.provider = stranger;
        bytes memory signature = _signVoucher(agentKey, voucher);
        vm.expectRevert(ArcBondWorkspace.InvalidSession.selector);
        workspace.settleSession(voucher, signature);
    }

    function test_revoke_andPolicyChange_blockSettlement() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        vm.prank(owner);
        workspace.openSession(SESSION, agent, provider, 4e6, deadline, keccak256("price"));
        uint256 version = workspace.policyVersion();
        vm.prank(owner);
        workspace.revokeAgent(agent);
        _expectSettle(ArcBondWorkspace.PolicyVersionMismatch.selector, 1, 1e6, deadline, version);

        vm.prank(owner);
        workspace.closeSession(SESSION);
        assertEq(workspace.reserved(), 0);
        assertEq(workspace.availableBalance(), 100e6);
    }

    function test_expiredSession_andOverBudget_revert() public {
        uint64 deadline = uint64(block.timestamp + 1 hours);
        vm.prank(owner);
        workspace.openSession(SESSION, agent, provider, 2e6, deadline, keccak256("price"));
        vm.warp(deadline);
        _expectSettle(ArcBondWorkspace.SessionExpired.selector, 1, 1e6, deadline, workspace.policyVersion());

        vm.warp(deadline - 1 hours);
        _expectSettle(ArcBondWorkspace.BudgetExceeded.selector, 1, 3e6, deadline, workspace.policyVersion());
    }

    function test_pause_blocksSettlement_andAllowsWithdrawOfFreeBalance() public {
        vm.prank(owner);
        workspace.pause();
        vm.prank(agent);
        vm.expectRevert(ArcBondWorkspace.VaultPaused.selector);
        workspace.executePayment(provider, 1e6, keccak256("paused"));
        vm.prank(owner);
        workspace.withdraw(1e6);
        assertEq(IERC20(USDC).balanceOf(owner), 1_000_000e6 - 99e6);
    }

    function test_intent_usesAgentNonce_andRejectsWrongSigner() public {
        ArcBondWorkspace.PaymentIntent memory intent = ArcBondWorkspace.PaymentIntent({
            vault: address(workspace),
            agent: agent,
            recipient: provider,
            token: USDC,
            amount: 1e6,
            paymentId: keccak256("intent"),
            nonce: 0,
            deadline: block.timestamp + 1 hours,
            policyVersion: workspace.policyVersion()
        });
        bytes memory bad = _signIntent(otherKey, intent);
        vm.expectRevert(ArcBondWorkspace.InvalidSignature.selector);
        workspace.executePaymentIntent(intent, bad);

        workspace.executePaymentIntent(intent, _signIntent(agentKey, intent));
        assertEq(IERC20(USDC).balanceOf(provider), 1e6);
        (, , , , , , , uint256 nonce) = workspace.agents(agent);
        assertEq(nonce, 1);
    }

    function test_replayedPaymentId_reverts() public {
        vm.prank(agent);
        workspace.executePayment(provider, 1e6, keccak256("once"));
        vm.prank(agent);
        vm.expectRevert(ArcBondWorkspace.PaymentIdUsed.selector);
        workspace.executePayment(provider, 1e6, keccak256("once"));
    }

    function test_ownerCannotBeAgent_andUnapprovedRecipientReverts() public {
        vm.prank(owner);
        vm.expectRevert(ArcBondWorkspace.InvalidAgent.selector);
        workspace.authorizeAgent(owner, 1e6, 1e6, uint64(block.timestamp + 1 days));
        vm.prank(agent);
        vm.expectRevert(ArcBondWorkspace.RecipientNotApproved.selector);
        workspace.executePayment(stranger, 1e6, keccak256("nope"));
    }

    function _fund(uint256 amount) internal {
        vm.startPrank(owner);
        IERC20(USDC).approve(address(workspace), amount);
        workspace.deposit(amount);
        vm.stopPrank();
    }

    function _voucher(uint256 sequence, uint256 cumulative, uint64 deadline, uint256 version)
        internal
        view
        returns (ArcBondWorkspace.UsageVoucher memory)
    {
        return ArcBondWorkspace.UsageVoucher({
            workspace: address(workspace),
            sessionId: SESSION,
            agent: agent,
            provider: provider,
            cumulativeAmount: cumulative,
            sequence: sequence,
            deadline: deadline,
            sessionVersion: version
        });
    }

    function _settle(uint256 sequence, uint256 cumulative, uint64 deadline, uint256 version) internal {
        ArcBondWorkspace.UsageVoucher memory voucher = _voucher(sequence, cumulative, deadline, version);
        workspace.settleSession(voucher, _signVoucher(agentKey, voucher));
    }

    function _expectSettle(bytes4 selector, uint256 sequence, uint256 cumulative, uint64 deadline, uint256 version) internal {
        ArcBondWorkspace.UsageVoucher memory voucher = _voucher(sequence, cumulative, deadline, version);
        bytes memory signature = _signVoucher(agentKey, voucher);
        vm.expectRevert(selector);
        workspace.settleSession(voucher, signature);
    }

    function _signVoucher(uint256 key, ArcBondWorkspace.UsageVoucher memory voucher) internal view returns (bytes memory) {
        bytes32 digest = workspace.hashUsageVoucher(voucher);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _signIntent(uint256 key, ArcBondWorkspace.PaymentIntent memory intent) internal view returns (bytes memory) {
        bytes32 digest = workspace.hashPaymentIntent(intent);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }
}
