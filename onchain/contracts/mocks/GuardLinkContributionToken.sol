// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice TESTNET-ONLY MOCK: valueless synthetic contribution token for an Ethereum
/// Sepolia Uniswap v3 demo paired with Circle's Sepolia USDC. The price in any pool
/// is synthetic and non-market. Never use on mainnet.

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title GuardLinkContributionToken
/// @notice Faucet-only TESTNET MOCK with no value, owner, admin or privileged mint.
contract GuardLinkContributionToken is ERC20 {
    error ZeroRecipient();
    error ZeroAmount();
    error ThirdPartyClaim();
    error ClaimAmountExceeded(uint256 amount, uint256 maximum);
    error CooldownActive(uint256 nextClaimAt);

    uint256 public constant MAX_PER_CLAIM = 100e6;
    uint256 public constant COOLDOWN = 10 minutes;

    mapping(address => uint256) public lastClaim;

    event FaucetClaim(address indexed to, address indexed caller, uint256 amount);

    constructor() ERC20("GuardLink Contribution Token (TESTNET MOCK, NO VALUE)", "GLCT") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Anyone may claim up to 100 tokens for THEMSELVES per cooldown.
    /// @dev `to` must equal the caller, so nobody can reset another address's
    /// cooldown with a dust claim. Amounts use six-decimal base units. No premint
    /// or other external mint path.
    function faucet(address to, uint256 amount) public {
        if (to == address(0)) revert ZeroRecipient();
        if (to != msg.sender) revert ThirdPartyClaim();
        if (amount == 0) revert ZeroAmount();
        if (amount > MAX_PER_CLAIM) revert ClaimAmountExceeded(amount, MAX_PER_CLAIM);

        uint256 nextClaimAt = lastClaim[to] + COOLDOWN;
        if (block.timestamp < nextClaimAt) revert CooldownActive(nextClaimAt);

        lastClaim[to] = block.timestamp;
        _mint(to, amount);
        emit FaucetClaim(to, msg.sender, amount);
    }
}
