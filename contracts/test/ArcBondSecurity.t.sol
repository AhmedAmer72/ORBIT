// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ArcBondVault} from "../src/ArcBondVault.sol";
import {ArcBondVaultFactory} from "../src/ArcBondVaultFactory.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// @notice Fuzz and invariant coverage for the authorization rules unit tests already pin down.
contract ArcBondSecurityTest is Test {
    address internal constant USDC = 0x3600000000000000000000000000000000000000;

    ArcBondVault internal vault;
    address internal owner = makeAddr("owner");
    address internal agent = makeAddr("agent");
    address internal recipient = makeAddr("recipient");

    function setUp() public {
        vm.etch(USDC, address(new MockUSDC()).code);
        ArcBondVaultFactory factory = new ArcBondVaultFactory();
        vm.prank(owner);
        vault = ArcBondVault(factory.createVault());
        MockUSDC(USDC).mint(owner, 1_000_000e6);
        _ready(100e6, 20e6, 50e6);
    }

    function testFuzz_strangerCannotPay(address caller, uint96 rawAmount, bytes32 id) public {
        vm.assume(caller != agent);
        vm.assume(id != bytes32(0));
        uint256 amount = bound(uint256(rawAmount), 1, 10e6);
        uint256 beforeBal = IERC20(USDC).balanceOf(address(vault));
        vm.prank(caller);
        vm.expectRevert(ArcBondVault.UnauthorizedAgent.selector);
        vault.executePayment(recipient, amount, id);
        assertEq(IERC20(USDC).balanceOf(address(vault)), beforeBal);
        assertFalse(vault.usedPaymentIds(id));
    }

    function testFuzz_overPerPaymentLimitDoesNotSettle(uint96 extra) public {
        uint256 amount = vault.maxPerPayment() + 1 + bound(uint256(extra), 0, 1_000e6);
        bytes32 id = keccak256("fuzz-over-max");
        uint256 beforeBal = IERC20(USDC).balanceOf(address(vault));
        vm.prank(agent);
        vm.expectRevert(ArcBondVault.AmountExceedsLimit.selector);
        vault.executePayment(recipient, amount, id);
        assertEq(IERC20(USDC).balanceOf(address(vault)), beforeBal);
        assertEq(vault.spentInPeriod(), 0);
        assertFalse(vault.usedPaymentIds(id));
    }

    function testFuzz_unapprovedRecipientDoesNotConsumeId(address to, bytes32 id) public {
        // The vault already holds the deposit. Its balance is not a payment to itself.
        vm.assume(to != recipient && to != address(vault));
        vm.assume(id != bytes32(0));
        vm.prank(agent);
        vm.expectRevert(ArcBondVault.RecipientNotApproved.selector);
        vault.executePayment(to, 1e6, id);
        assertFalse(vault.usedPaymentIds(id));
        assertEq(IERC20(USDC).balanceOf(to), 0);
    }

    function testFuzz_replayPaysOnce(uint96 rawAmount) public {
        uint256 amount = bound(uint256(rawAmount), 1, 5e6);
        bytes32 id = keccak256("fuzz-replay");
        vm.prank(agent);
        vault.executePayment(recipient, amount, id);
        uint256 afterFirst = IERC20(USDC).balanceOf(recipient);
        vm.prank(agent);
        vm.expectRevert(ArcBondVault.PaymentIdUsed.selector);
        vault.executePayment(recipient, amount, id);
        assertEq(IERC20(USDC).balanceOf(recipient), afterFirst);
        assertEq(vault.spentInPeriod(), amount);
    }

    function testFuzz_periodCapBlocksTheSecondPayment(uint96 firstRaw, uint96 secondRaw) public {
        uint256 cap = 10e6;
        vm.prank(owner);
        vault.updatePolicy(type(uint256).max, cap, uint64(block.timestamp + 7 days));
        uint256 first = bound(uint256(firstRaw), 1, cap);
        uint256 second = bound(uint256(secondRaw), cap - first + 1, cap);
        vm.prank(agent);
        vault.executePayment(recipient, first, keccak256("fuzz-cap-a"));
        vm.prank(agent);
        vm.expectRevert(ArcBondVault.PeriodLimitExceeded.selector);
        vault.executePayment(recipient, second, keccak256("fuzz-cap-b"));
        assertEq(vault.spentInPeriod(), first);
        assertEq(IERC20(USDC).balanceOf(recipient), first);
    }

    function testFuzz_strangerCannotChangePolicy(address caller, uint96 maxPer) public {
        vm.assume(caller != owner);
        vm.prank(caller);
        vm.expectRevert(ArcBondVault.UnauthorizedOwner.selector);
        vault.updatePolicy(maxPer, maxPer, uint64(block.timestamp + 1 days));
        assertEq(vault.maxPerPayment(), 20e6);
    }

    function test_periodAdditionOverflowRevertsBeforeSettlement() public {
        vm.prank(owner);
        vault.updatePolicy(type(uint256).max, type(uint256).max, uint64(block.timestamp + 1 days));
        vm.prank(agent);
        vault.executePayment(recipient, 1, keccak256("one-base-unit"));
        vm.prank(agent);
        vm.expectRevert();
        vault.executePayment(recipient, type(uint256).max, keccak256("overflow"));
        assertEq(IERC20(USDC).balanceOf(recipient), 1);
        assertFalse(vault.usedPaymentIds(keccak256("overflow")));
        assertEq(vault.spentInPeriod(), 1);
    }

    function _ready(uint256 depositAmount, uint256 maxPer, uint256 periodCap) internal {
        vm.startPrank(owner);
        IERC20(USDC).approve(address(vault), depositAmount);
        vault.deposit(depositAmount);
        vault.updatePolicy(maxPer, periodCap, uint64(block.timestamp + 30 days));
        vault.setRecipient(recipient, true);
        vault.authorizeAgent(agent);
        vm.stopPrank();
    }
}

/// @notice Random deposits and payments must keep the token balance equal to recorded accounting.
contract ArcBondInvariantTest is Test {
    address internal constant USDC = 0x3600000000000000000000000000000000000000;

    ArcBondVault internal vault;
    address internal owner = makeAddr("inv-owner");
    address internal agent = makeAddr("inv-agent");
    address internal recipient = makeAddr("inv-recipient");
    uint256 public accounted;
    uint256 internal nextId;

    function setUp() public {
        vm.etch(USDC, address(new MockUSDC()).code);
        ArcBondVaultFactory factory = new ArcBondVaultFactory();
        vm.prank(owner);
        vault = ArcBondVault(factory.createVault());
        MockUSDC(USDC).mint(owner, 500e6);
        vm.startPrank(owner);
        IERC20(USDC).approve(address(vault), 200e6);
        vault.deposit(200e6);
        vault.updatePolicy(1_000_000e6, 1_000_000e6, uint64(block.timestamp + 365 days));
        vault.setRecipient(recipient, true);
        vault.authorizeAgent(agent);
        vm.stopPrank();
        accounted = 200e6;

        targetContract(address(this));
        bytes4[] memory selectors = new bytes4[](2);
        selectors[0] = this.pay.selector;
        selectors[1] = this.depositMore.selector;
        targetSelector(FuzzSelector({ addr: address(this), selectors: selectors }));
    }

    function pay(uint96 rawAmount) public {
        uint256 amount = bound(uint256(rawAmount), 1, 5e6);
        bytes32 id = keccak256(abi.encode("pay", nextId, amount));
        nextId++;
        vm.prank(agent);
        try vault.executePayment(recipient, amount, id) {
            accounted -= amount;
        } catch {}
    }

    function depositMore(uint96 rawAmount) public {
        uint256 amount = bound(uint256(rawAmount), 1, 10e6);
        MockUSDC(USDC).mint(owner, amount);
        vm.startPrank(owner);
        IERC20(USDC).approve(address(vault), amount);
        vault.deposit(amount);
        vm.stopPrank();
        accounted += amount;
    }

    /// forge-config: default.invariant.runs = 32
    /// forge-config: default.invariant.depth = 20
    function invariant_balanceMatchesSuccessfulTransfers() public view {
        assertEq(IERC20(USDC).balanceOf(address(vault)), accounted);
    }

    /// forge-config: default.invariant.runs = 32
    /// forge-config: default.invariant.depth = 20
    function invariant_displayedSpendDoesNotExceedCap() public view {
        assertLe(vault.displayedSpentInPeriod(), vault.periodLimit());
    }
}
