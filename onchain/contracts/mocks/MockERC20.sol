// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockERC20
/// @notice TEST ONLY: six-decimal USDC substitute with unrestricted minting and
/// failure controls. Built from the OpenZeppelin ERC20 scaffold; deliberately
/// removes scaffold owner restrictions/permit, which this test fixture does not
/// need. The project selects solc 0.8.28 and Cancun in foundry.toml.
contract MockERC20 is ERC20 {
    bool public failTransfers;

    constructor() ERC20("Mock USDC", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Unrestricted test toggle. Both transfer paths return false without
    /// modifying balances or allowances, exercising SafeERC20 rollback behavior.
    function setFailTransfers(bool fail) external {
        failTransfers = fail;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (failTransfers) return false;
        return super.transfer(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (failTransfers) return false;
        return super.transferFrom(from, to, amount);
    }
}
