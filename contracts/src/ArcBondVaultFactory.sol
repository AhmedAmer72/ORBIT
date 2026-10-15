// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

import {ArcBondVault} from "./ArcBondVault.sol";
import {IArcBondVault} from "./interfaces/IArcBondVault.sol";

/// @title ArcBondVaultFactory
/// @notice Ownerless factory. Deploys an isolated vault clone and initializes the caller as owner.
contract ArcBondVaultFactory {
    /// @notice 2 clones implement executePaymentIntent. The Arc Testnet factory at
    ///         0xA9Cdb36A8c1E20755AE294eff6978525A1f01a1d has neither this getter nor intents.
    uint256 public constant VERSION = 2;

    address public immutable implementation;

    mapping(address => address[]) private _vaultsOf;
    mapping(address => bool) public isVault;

    event VaultCreated(address indexed owner, address indexed vault);

    constructor() {
        implementation = address(new ArcBondVault());
    }

    function createVault() external returns (address vault) {
        vault = Clones.clone(implementation);
        IArcBondVault(vault).initialize(msg.sender);
        _vaultsOf[msg.sender].push(vault);
        isVault[vault] = true;
        emit VaultCreated(msg.sender, vault);
    }

    function vaultsOf(address owner) external view returns (address[] memory) {
        return _vaultsOf[owner];
    }

    function vaultCount(address owner) external view returns (uint256) {
        return _vaultsOf[owner].length;
    }
}
