// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

import {ArcBondWorkspace} from "./ArcBondWorkspace.sol";

/// @title ArcBondWorkspaceFactory
/// @notice Deploys workspace clones. This is not an upgrade of ArcBondVaultFactory.
/// @dev VERSION 1 is the workspace generation. Vault factory version 2 is a different contract.
contract ArcBondWorkspaceFactory {
    uint256 public constant VERSION = 1;

    address public immutable implementation;

    mapping(address => address[]) private _workspacesOf;
    mapping(address => bool) public isWorkspace;

    event WorkspaceCreated(address indexed owner, address indexed workspace);

    constructor() {
        implementation = address(new ArcBondWorkspace());
    }

    function createWorkspace() external returns (address workspace) {
        workspace = Clones.clone(implementation);
        ArcBondWorkspace(workspace).initialize(msg.sender);
        _workspacesOf[msg.sender].push(workspace);
        isWorkspace[workspace] = true;
        emit WorkspaceCreated(msg.sender, workspace);
    }

    function workspacesOf(address owner_) external view returns (address[] memory) {
        return _workspacesOf[owner_];
    }

    function workspaceCount(address owner_) external view returns (uint256) {
        return _workspacesOf[owner_].length;
    }
}
