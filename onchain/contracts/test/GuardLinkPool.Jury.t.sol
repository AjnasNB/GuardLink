// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {GuardLinkPoolTestBase} from "./GuardLinkPool.Base.t.sol";
import {GuardLinkPool} from "../GuardLinkPool.sol";

contract GuardLinkPoolJuryTest is GuardLinkPoolTestBase {
    bytes32 internal id;

    function setUp() public override {
        super.setUp();
        id = _submit(alice, CID, alicePolicy, 500e6);
    }

    // ------------------------------------------------------- access control
    function test_RevertAdminCalls_FromNonAdmin() public {
        address[4] memory callers = [alice, bob, mallory, address(this)]; // incl. deployer
        for (uint256 i; i < callers.length; ++i) {
            vm.startPrank(callers[i]);
            vm.expectRevert(GuardLinkPool.Unauthorized.selector);
            pool.verifyMember(mallory, true);
            vm.expectRevert(GuardLinkPool.Unauthorized.selector);
            pool.assignJury(id, _panel(bob, carol, dave));
            vm.expectRevert(GuardLinkPool.Unauthorized.selector);
            pool.assignAppealJury(id, _panel(erin, frank, grace));
            vm.stopPrank();
        }
        assertFalse(pool.verifiedMembers(mallory));
    }

    function test_NoSelfVerification() public {
        // member cannot verify itself
        vm.prank(mallory);
        vm.expectRevert(GuardLinkPool.Unauthorized.selector);
        pool.verifyMember(mallory, true);
        assertFalse(pool.verifiedMembers(mallory));

        // even a joined admin cannot verify itself
        vm.startPrank(admin);
        pool.join();
        vm.expectRevert(GuardLinkPool.InvalidInput.selector);
        pool.verifyMember(admin, true);
        vm.stopPrank();
        assertFalse(pool.verifiedMembers(admin));
    }

    // ------------------------------------------------------------- exclusions
    function test_RevertAssign_ClaimantExcluded() public {
        vm.prank(admin);
        vm.expectRevert(GuardLinkPool.InvalidJury.selector);
        pool.assignJury(id, _panel(alice, carol, dave));
        vm.prank(admin);
        vm.expectRevert(GuardLinkPool.InvalidJury.selector);
        pool.assignJury(id, _panel(bob, carol, alice));
    }

    function test_RevertAssign_ContactExcluded_AndContactCannotVote() public {
        vm.expectEmit(true, true, true, true, address(pool));
        emit GuardLinkPool.ClaimContactSet(id, heidi);
        vm.prank(alice);
        pool.setClaimContact(id, heidi);
        assertEq(pool.getClaim(id).contact, heidi);

        vm.prank(admin);
        vm.expectRevert(GuardLinkPool.InvalidJury.selector);
        pool.assignJury(id, _panel(bob, heidi, dave));

        _assign(id);
        vm.prank(heidi);
        vm.expectRevert(GuardLinkPool.Unauthorized.selector);
        pool.vote(id, false, 0, RAT); // contact cannot decide
    }

    function test_RevertAssign_DuplicateJurors() public {
        vm.startPrank(admin);
        vm.expectRevert(GuardLinkPool.InvalidJury.selector);
        pool.assignJury(id, _panel(bob, bob, dave));
        vm.expectRevert(GuardLinkPool.InvalidJury.selector);
        pool.assignJury(id, _panel(bob, carol, bob));
        vm.expectRevert(GuardLinkPool.InvalidJury.selector);
        pool.assignJury(id, _panel(bob, carol, carol));
        vm.stopPrank();
    }

    function test_RevertAssign_UnverifiedOrNonMemberOrZeroJuror() public {
        vm.startPrank(admin);
        vm.expectRevert(GuardLinkPool.InvalidJury.selector);
        pool.assignJury(id, _panel(bob, carol, mallory));
        vm.expectRevert(GuardLinkPool.InvalidJury.selector);
        pool.assignJury(id, _panel(outsider, carol, dave));
        vm.expectRevert(GuardLinkPool.InvalidJury.selector);
        pool.assignJury(id, _panel(bob, address(0), dave));
        vm.stopPrank();
    }

    function test_Assign_MissingClaimAndWrongState() public {
        vm.prank(admin);
        vm.expectRevert(GuardLinkPool.MissingRecord.selector);
        pool.assignJury(keccak256("none"), _panel(bob, carol, dave));
        vm.prank(admin);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.assignAppealJury(id, _panel(erin, frank, grace)); // not appealed
    }

    function test_SetClaimContact_OnlyClaimantAndOnlyBeforeAssignment() public {
        vm.prank(heidi);
        vm.expectRevert(GuardLinkPool.Unauthorized.selector);
        pool.setClaimContact(id, heidi);
        _assign(id);
        vm.prank(alice);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.setClaimContact(id, heidi); // frozen at first assignment
    }

    function test_JuryEligibilityFrozenAtSelection() public {
        _assign(id);
        vm.prank(admin);
        pool.verifyMember(bob, false);
        _vote(bob, id, true, 100e6); // still allowed to vote
        _vote(carol, id, true, 100e6);
        assertEq(uint8(_status(id)), uint8(GuardLinkPool.Status.Approved));
    }

    // ---------------------------------------------------- panel replacement
    function test_Assign_ReplacementAllowedBeforeFirstBallot_KeepsDeadline() public {
        _assign(id);
        uint64 deadline = pool.getClaim(id).deadline;
        skip(1 hours);
        vm.prank(admin);
        pool.assignJury(id, _panel(erin, frank, grace));
        assertEq(pool.getClaim(id).deadline, deadline, "deadline not extended");
        assertEq(pool.getJury(id, false)[0], erin);
        vm.prank(bob);
        vm.expectRevert(GuardLinkPool.Unauthorized.selector);
        pool.vote(id, false, 0, RAT); // replaced juror out
        _vote(erin, id, false, 0);
    }

    function test_RevertAssign_NoReplacementAfterFirstBallot() public {
        _assign(id);
        _vote(bob, id, true, 100e6);
        vm.prank(admin);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.assignJury(id, _panel(erin, frank, grace));
        address[3] memory j = pool.getJury(id, false);
        assertEq(j[0], bob);
        assertEq(j[1], carol);
        assertEq(j[2], dave);
    }

    function test_RevertAssign_AfterDeadline() public {
        skip(72 hours); // unassigned claim expired
        vm.prank(admin);
        vm.expectRevert(GuardLinkPool.DeadlinePassed.selector);
        pool.assignJury(id, _panel(bob, carol, dave));
        _assignFresh(); // fresh claim: assigned then expires with no ballots
    }

    function _assignFresh() internal {
        bytes32 id2 = _submit(heidi, CID, heidiPolicy, 100e6);
        _assign(id2);
        skip(72 hours);
        vm.prank(admin);
        vm.expectRevert(GuardLinkPool.DeadlinePassed.selector);
        pool.assignJury(id2, _panel(erin, frank, grace));
    }

    // --------------------------------------------------------------- voting
    function test_RevertVote_DuplicateVote() public {
        _assign(id);
        _vote(bob, id, true, 100e6);
        vm.startPrank(bob);
        vm.expectRevert(GuardLinkPool.AlreadyVoted.selector);
        pool.vote(id, true, 100e6, RAT);
        vm.expectRevert(GuardLinkPool.AlreadyVoted.selector);
        pool.vote(id, false, 0, RAT); // cannot flip either
        vm.stopPrank();
        // duplicate did not count as a second matching ballot
        assertEq(uint8(_status(id)), uint8(GuardLinkPool.Status.Voting));
    }

    function test_RevertVote_UnauthorizedVoters() public {
        _assign(id);
        address[6] memory bad = [alice, heidi, mallory, outsider, admin, erin];
        for (uint256 i; i < bad.length; ++i) {
            vm.prank(bad[i]);
            vm.expectRevert(GuardLinkPool.Unauthorized.selector);
            pool.vote(id, true, 100e6, RAT);
        }
        // appeal-round entrypoint also rejects wrong state
        vm.prank(bob);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.appealVote(id, true, 100e6, RAT);
    }

    function test_RevertVote_BeforeJuryAssigned() public {
        vm.prank(bob);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.vote(id, true, 100e6, RAT);
    }

    function test_RevertVote_InvalidAmounts() public {
        _assign(id);
        vm.startPrank(bob);
        vm.expectRevert(GuardLinkPool.InvalidInput.selector);
        pool.vote(id, true, 0, RAT);
        vm.expectRevert(GuardLinkPool.InvalidInput.selector);
        pool.vote(id, true, 500e6 + 1, RAT);
        vm.expectRevert(GuardLinkPool.InvalidInput.selector);
        pool.vote(id, false, 1, RAT);
        vm.stopPrank();
        _vote(bob, id, true, 500e6); // full requested is the maximum allowed
    }

    function test_Vote_DeadlineBoundary() public {
        _assign(id);
        uint64 deadline = pool.getClaim(id).deadline;
        vm.warp(deadline - 1);
        _vote(bob, id, true, 100e6);
        vm.warp(deadline);
        vm.prank(carol);
        vm.expectRevert(GuardLinkPool.DeadlinePassed.selector);
        pool.vote(id, true, 100e6, RAT);
    }

    function test_RevertVote_AfterResolution() public {
        _assign(id);
        _vote(bob, id, true, 100e6);
        _vote(carol, id, true, 100e6);
        vm.prank(dave);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.vote(id, false, 0, RAT);
    }

    function test_Vote_TwoRejectsReject() public {
        _assign(id);
        _vote(bob, id, false, 0);
        vm.expectEmit(true, true, true, true, address(pool));
        emit GuardLinkPool.ClaimRejected(id, 500e6, false, uint64(block.timestamp + 72 hours));
        _vote(carol, id, false, 0);
        assertEq(uint8(_status(id)), uint8(GuardLinkPool.Status.Rejected));
        assertEq(pool.committedPayouts(), 0);
    }

    function test_Vote_ThirdJurorMatchesFirstResolves() public {
        _assign(id);
        _vote(bob, id, true, 100e6);
        _vote(carol, id, false, 0);
        _vote(dave, id, true, 100e6);
        GuardLinkPool.Claim memory c = pool.getClaim(id);
        assertEq(uint8(c.status), uint8(GuardLinkPool.Status.Approved));
        assertEq(c.approvedAmount, 100e6);
    }

    // ---------------------------------------------- unresolved (no consensus)
    function test_PartialDifferingAmounts_StayUnresolved() public {
        _assign(id);
        _vote(bob, id, true, 100e6);
        _vote(carol, id, true, 200e6);
        assertEq(uint8(_status(id)), uint8(GuardLinkPool.Status.Voting));
        vm.expectEmit(true, true, true, true, address(pool));
        emit GuardLinkPool.ClaimUnresolved(id, 500e6, false);
        _vote(dave, id, true, 300e6);

        GuardLinkPool.Claim memory c = pool.getClaim(id);
        assertEq(uint8(c.status), uint8(GuardLinkPool.Status.Unresolved));
        assertEq(c.approvedAmount, 0);
        assertEq(pool.committedPayouts(), 0);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.settle(id);
        vm.prank(alice);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.appeal(id); // unresolved is not appealable
    }

    function test_MixedDivergentBallots_StayUnresolved() public {
        _assign(id);
        _vote(bob, id, true, 100e6);
        _vote(carol, id, false, 0);
        _vote(dave, id, true, 200e6);
        assertEq(uint8(_status(id)), uint8(GuardLinkPool.Status.Unresolved));
    }

    function test_Unresolved_ExposureReleasedOnlyAtDeadline() public {
        _assign(id);
        uint64 deadline = pool.getClaim(id).deadline;
        _vote(bob, id, true, 100e6);
        _vote(carol, id, true, 200e6);
        _vote(dave, id, true, 300e6);
        assertEq(_used(alicePolicy), 500e6);
        assertEq(pool.openClaimExposure(), 500e6);

        vm.expectRevert(GuardLinkPool.TooEarly.selector);
        pool.releaseExposure(id);

        vm.warp(deadline);
        vm.expectEmit(true, true, true, true, address(pool));
        emit GuardLinkPool.ExposureReleased(id, alicePolicy, 500e6);
        pool.releaseExposure(id);
        assertEq(_used(alicePolicy), 0);
        assertEq(pool.openClaimExposure(), 0);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.releaseExposure(id); // only once
    }

    // ------------------------------------------------- empty quorum / expiry
    function test_EmptyQuorum_NoVotesAfter72h_StaysUnresolved() public {
        _assign(id);
        uint64 deadline = pool.getClaim(id).deadline;
        assertEq(uint8(_status(id)), uint8(GuardLinkPool.Status.Voting));
        vm.warp(deadline);
        assertEq(uint8(_status(id)), uint8(GuardLinkPool.Status.Unresolved));
        assertEq(pool.getClaim(id).approvedAmount, 0);
        vm.prank(bob);
        vm.expectRevert(GuardLinkPool.DeadlinePassed.selector);
        pool.vote(id, true, 100e6, RAT);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.settle(id);

        vm.expectEmit(true, true, true, true, address(pool));
        emit GuardLinkPool.ClaimUnresolved(id, 500e6, false);
        pool.releaseExposure(id);
        assertEq(_used(alicePolicy), 0);
        assertEq(pool.committedPayouts(), 0);
    }

    function test_SingleVoteIsNoQuorum_UnresolvedAfterDeadline() public {
        _assign(id);
        _vote(bob, id, true, 100e6);
        skip(72 hours);
        assertEq(uint8(_status(id)), uint8(GuardLinkPool.Status.Unresolved));
        vm.prank(carol);
        vm.expectRevert(GuardLinkPool.DeadlinePassed.selector);
        pool.vote(id, true, 100e6, RAT);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.settle(id);
    }

    function test_UnassignedClaimExpiresUnresolved_ReleasesExposure() public {
        vm.expectRevert(GuardLinkPool.TooEarly.selector);
        pool.releaseExposure(id);
        skip(72 hours);
        assertEq(uint8(_status(id)), uint8(GuardLinkPool.Status.Unresolved));
        pool.releaseExposure(id);
        assertEq(_used(alicePolicy), 0);
    }
}
