// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {GuardLinkPool} from "../GuardLinkPool.sol";
import {GuardLinkPoolWithChallenges} from "../GuardLinkPoolWithChallenges.sol";
import {GuardLinkPoolTestBase} from "./GuardLinkPool.Base.t.sol";

contract GuardLinkPoolChallengeTest is GuardLinkPoolTestBase {
    uint128 constant REQUESTED = 40e6;
    uint128 constant PROVISIONAL = 30e6;
    GuardLinkPool.ChallengeReason constant REASON = GuardLinkPool.ChallengeReason.DuplicateEvidence;

    function _newPool() internal override returns (GuardLinkPool) {
        return new GuardLinkPoolWithChallenges(admin, address(token), CONTRIB, LIMIT, TERM);
    }

    function _provisional() internal returns (bytes32) {
        return _approvedClaim(alice, CID, alicePolicy, REQUESTED, PROVISIONAL);
    }

    function _flag(bytes32 id) internal {
        vm.prank(heidi);
        pool.challengeClaim(id, REASON);
    }

    function testUnchallengedPaymentWaitsUntilExactDeadline() public {
        bytes32 id = _provisional();
        (uint64 until,,,) = pool.payoutReviews(id);
        assertEq(until, block.timestamp + 48 hours);
        vm.warp(until - 1);
        vm.expectRevert(GuardLinkPool.TooEarly.selector);
        pool.settle(id);
        vm.warp(until);
        vm.expectRevert(GuardLinkPool.DeadlinePassed.selector);
        _flag(id);
        vm.prank(outsider);
        pool.settle(id);
        assertEq(token.balanceOf(alice), PROVISIONAL);
        assertEq(pool.committedPayouts(), 0);
    }

    function testOnlyVerifiedMembersOutsideTheCaseCanFlag() public {
        bytes32 id = _submit(alice, CID, alicePolicy, REQUESTED);
        vm.prank(alice);
        pool.setClaimContact(id, heidi);
        _assign(id);
        _vote(bob, id, true, PROVISIONAL);
        _vote(carol, id, true, PROVISIONAL);
        address[4] memory excluded = [alice, heidi, dave, mallory];
        for (uint256 i; i < excluded.length; ++i) {
            vm.expectRevert(GuardLinkPool.Unauthorized.selector);
            vm.prank(excluded[i]);
            pool.challengeClaim(id, REASON);
        }
        vm.expectRevert(GuardLinkPool.InvalidInput.selector);
        vm.prank(erin);
        pool.challengeClaim(id, GuardLinkPool.ChallengeReason.None);
    }

    function testChallengeBlocksSettlementAndIndependentPanelCanReducePayout() public {
        bytes32 id = _provisional();
        _flag(id);
        assertEq(pool.committedPayouts(), 0);
        assertEq(pool.openClaimExposure(), PROVISIONAL);
        assertEq(_used(alicePolicy), PROVISIONAL);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.settle(id);
        vm.expectRevert(GuardLinkPool.InvalidJury.selector);
        vm.prank(admin);
        pool.assignAppealJury(id, _panel(heidi, frank, grace));
        _assignAppeal(id);
        vm.expectRevert(GuardLinkPool.InvalidInput.selector);
        _appealVote(erin, id, true, PROVISIONAL + 1);
        _appealVote(erin, id, true, 20e6);
        _appealVote(frank, id, true, 20e6);
        assertEq(_used(alicePolicy), 20e6);
        assertEq(pool.openClaimExposure(), 0);
        assertEq(pool.committedPayouts(), 20e6);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        _flag(id);
        vm.expectRevert(GuardLinkPool.TooEarly.selector);
        pool.settle(id);
        (uint64 until,,,) = pool.payoutReviews(id);
        vm.warp(until);
        pool.settle(id);
        assertEq(token.balanceOf(alice), 20e6);
    }

    function testChallengeRejectedOrExpiredReleasesOnlyDisputedExposure() public {
        bytes32 rejected = _provisional();
        _flag(rejected);
        _assignAppeal(rejected);
        _appealVote(erin, rejected, false, 0);
        _appealVote(frank, rejected, false, 0);
        pool.releaseExposure(rejected);
        bytes32 expired = _approvedClaim(alice, keccak256("expired"), alicePolicy, REQUESTED, PROVISIONAL);
        _flag(expired);
        vm.warp(pool.getClaim(expired).deadline);
        pool.releaseExposure(expired);
        assertEq(_used(alicePolicy), 0);
        assertEq(pool.openClaimExposure(), 0);
        assertEq(pool.committedPayouts(), 0);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.settle(expired);
    }

    function testClaimantAppealApprovalAlsoWaitsAndIsFinal() public {
        bytes32 id = _rejectedClaim(alice, CID, alicePolicy, REQUESTED);
        vm.prank(alice);
        pool.appeal(id);
        _assignAppeal(id);
        _appealVote(erin, id, true, PROVISIONAL);
        _appealVote(frank, id, true, PROVISIONAL);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        _flag(id);
        vm.expectRevert(GuardLinkPool.TooEarly.selector);
        pool.settle(id);
        vm.warp(block.timestamp + 48 hours);
        pool.settle(id);
        assertEq(token.balanceOf(alice), PROVISIONAL);
    }
}
