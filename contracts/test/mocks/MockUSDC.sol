// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockUSDCWrongDecimals is ERC20 {
    constructor() ERC20("Bad", "BAD") {}

    function decimals() public pure override returns (uint8) {
        return 18;
    }
}

contract ShortTransferUSDC is ERC20 {
    address public skimFrom;

    constructor() ERC20("Short USDC", "sUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setSkimFrom(address account) external {
        skimFrom = account;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from == skimFrom && to != address(0) && value > 1) {
            super._update(from, to, value - 1);
            return;
        }
        super._update(from, to, value);
    }
}

contract ReenteringUSDC is ERC20 {
    address public target;
    bytes public data;
    bool public armed;

    constructor() ERC20("Reenter USDC", "rUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function arm(address target_, bytes calldata data_) external {
        target = target_;
        data = data_;
        armed = true;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (armed && from != address(0) && to != address(0) && target != address(0)) {
            armed = false;
            (bool ok,) = target.call(data);
            ok;
        }
    }
}
