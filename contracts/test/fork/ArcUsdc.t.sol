// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {ArcBondVault} from "../../src/ArcBondVault.sol";
import {ArcBondVaultFactory} from "../../src/ArcBondVaultFactory.sol";

/// @dev Requires `forge test --match-contract ArcUsdcForkTest --fork-url https://rpc.testnet.arc.io`.
///      Skips when no fork is active. Transfer and blocklist cases need Arc Foundry; vanilla
///      Foundry hits StackUnderflow on the USDC `isBlocklisted` precompile.
contract ArcUsdcForkTest is Test {
    IERC20 internal constant USDC = IERC20(0x3600000000000000000000000000000000000000);
    address internal constant BLOCKLISTED = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
    uint256 internal constant NATIVE_TO_ERC20 = 1e12;

    function setUp() public {
        try vm.activeFork() returns (uint256) {}
        catch {
            vm.skip(true);
        }
    }

    function test_usdcDecimalsAreSix() public view {
        assertEq(IERC20Metadata(address(USDC)).decimals(), 6);
    }

    function test_nativeDealMapsToErc20Balance() public {
        address user = makeAddr("forkUser");
        deal(user, 1e18);
        assertEq(user.balance, 1e18);
        assertEq(USDC.balanceOf(user), 1e18 / NATIVE_TO_ERC20);
    }

    function test_realDepositIncreasesVaultBalance() public {
        address owner_ = makeAddr("forkOwner");
        deal(owner_, 100e18);
        if (!_usdcTransferWorks(owner_)) {
            vm.skip(true);
        }

        ArcBondVaultFactory factory = new ArcBondVaultFactory();
        vm.prank(owner_);
        ArcBondVault vault = ArcBondVault(factory.createVault());

        uint256 amount = 10e6;
        vm.startPrank(owner_);
        USDC.approve(address(vault), amount);
        vault.deposit(amount);
        vm.stopPrank();

        assertEq(USDC.balanceOf(address(vault)), amount);
    }

    function test_blocklistRevertsAndDoesNotConsumePaymentId() public {
        address owner_ = makeAddr("blOwner");
        address agent_ = makeAddr("blAgent");
        deal(owner_, 50e18);
        deal(agent_, 1e18);
        if (!_usdcTransferWorks(owner_)) {
            vm.skip(true);
        }

        address probe = makeAddr("probe");
        deal(probe, 1e18);
        vm.prank(probe);
        (bool nativeOk,) = BLOCKLISTED.call{value: 1}("");
        if (nativeOk) {
            vm.skip(true);
        }

        ArcBondVaultFactory factory = new ArcBondVaultFactory();
        vm.prank(owner_);
        ArcBondVault vault = ArcBondVault(factory.createVault());

        vm.startPrank(owner_);
        USDC.approve(address(vault), 10e6);
        vault.deposit(10e6);
        vault.updatePolicy(10e6, 10e6, uint64(block.timestamp + 30 days));
        vault.setRecipient(BLOCKLISTED, true);
        vault.authorizeAgent(agent_);
        vm.stopPrank();

        bytes32 paymentId = keccak256("blocklist-pay");
        vm.prank(agent_);
        vm.expectRevert();
        vault.executePayment(BLOCKLISTED, 1e6, paymentId);
        assertFalse(vault.usedPaymentIds(paymentId));
        assertEq(USDC.balanceOf(address(vault)), 10e6);
    }

    function _usdcTransferWorks(address from) internal returns (bool) {
        address sink = makeAddr("usdcSink");
        vm.prank(from);
        (bool ok,) = address(USDC).call(abi.encodeWithSelector(IERC20.transfer.selector, sink, 1));
        return ok;
    }
}
