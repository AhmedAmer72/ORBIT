// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

import {ArcBondVaultFactory} from "../src/ArcBondVaultFactory.sol";

/// @notice Writes the factory (and its implementation) when broadcast is enabled.
/// @dev Do not pass --broadcast until an operator explicitly confirms and a local key is set.
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        ArcBondVaultFactory factory = new ArcBondVaultFactory();
        vm.stopBroadcast();

        console2.log("ArcBondVaultFactory", address(factory));
        console2.log("implementation", factory.implementation());
        console2.log("version", factory.VERSION());
        console2.log("deployer", vm.addr(pk));
    }
}
