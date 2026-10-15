// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

import {ArcBondWorkspaceFactory} from "../src/ArcBondWorkspaceFactory.sol";

/// @notice Broadcasts the workspace factory to the RPC selected by the operator.
/// @dev The forge wrapper must pin Arc Testnet. This script does not select a chain.
contract DeployWorkspace is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        ArcBondWorkspaceFactory factory = new ArcBondWorkspaceFactory();
        vm.stopBroadcast();

        console2.log("ArcBondWorkspaceFactory", address(factory));
        console2.log("implementation", factory.implementation());
        console2.log("version", factory.VERSION());
        console2.log("deployer", vm.addr(pk));
    }
}
