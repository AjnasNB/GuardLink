// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {GuardLinkPool} from "./GuardLinkPool.sol";

/// @notice Pool version with a 48-hour hold after a jury approves payment.
contract GuardLinkPoolWithChallenges is GuardLinkPool {
    constructor(address admin, address token, uint128 contribution, uint128 coverage, uint32 termDays)
        GuardLinkPool(admin, token, contribution, coverage, termDays)
    {}

    function payoutChallengePeriod() public pure override returns (uint64) {
        return 48 hours;
    }
}
