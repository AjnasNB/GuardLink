// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {GuardLinkPoolTestBase} from "./GuardLinkPool.Base.t.sol";
import {GuardLinkPool} from "../GuardLinkPool.sol";

contract GuardLinkPoolAppealTest is GuardLinkPoolTestBase {
    bytes32 internal id; // rejected by original panel (bob, carol)

    function setUp() public override {
        super.setUp();
        id = _rejectedClaim(alice, CID, alicePolicy, 500e6);
    }

    function _appealed() internal {
        vm.prank(alice);
        pool.appeal(id);
    }

    // ------------------------------------------------------------- who/when
    function test_Appeal_OnlyClaimant() public {
        address[4] memory bad = [heidi, bob, admin, outsider];
        for (uint256 i; i < bad.length; ++i) {
            vm.prank(bad[i]);
            vm.expectRevert(GuardLinkPool.Unauthorized.selector);
            pool.appeal(id);
        }
        assertEq(uint8(_status(id)), uint8(GuardLinkPool.Status.Rejected));
    }

    function test_Appeal_ClaimantSucceeds_EmitsAndSetsState() public {
        vm.expectEmit(true, true, true, true, address(pool));
        emit GuardLinkPool.ClaimAppealed(id, alice, 500e6);
        _appealed();
        GuardLinkPool.Claim memory c = pool.getClaim(id);
        assertEq(uint8(c.status), uint8(GuardLinkPool.Status.Appealed));
        assertTrue(c.appealed);
        assertEq(c.deadline, block.timestamp + 72 hours);
        assertEq(_used(alicePolicy), 500e6, "reservation preserved");
    }

    function test_Appeal_OnlyWhenRejected() public {
        bytes32 submitted = _submit(heidi, CID, heidiPolicy, 100e6);
        vm.prank(heidi);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.appeal(submitted);

        _assign(submitted);
        vm.prank(heidi);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.appeal(submitted); // Voting

        _vote(bob, submitted, true, 50e6);
        _vote(carol, submitted, true, 50e6);
        vm.prank(heidi);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.appeal(submitted); // Approved

        _fundPool(1_000e6);
        pool.settle(submitted);
        vm.prank(heidi);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.appeal(submitted); // Paid
    }

    function test_Appeal_WindowBoundary() public {
        uint64 dl = pool.getClaim(id).appealDeadline;
        assertEq(dl, block.timestamp + 72 hours);
        vm.warp(dl);
        vm.prank(alice);
        vm.expectRevert(GuardLinkPool.DeadlinePassed.selector);
        pool.appeal(id);
        vm.warp(dl - 1);
        _appealed(); // last second OK
    }

    function test_Appeal_OnlyOnce() public {
        _appealed();
        vm.prank(alice);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.appeal(id); // while pending

        _assignAppeal(id);
        _appealVote(erin, id, false, 0);
        _appealVote(frank, id, false, 0);
        assertEq(uint8(_status(id)), uint8(GuardLinkPool.Status.Rejected));
        vm.prank(alice);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.appeal(id); // after rejected appeal
    }

    // ----------------------------------------------------------- independence
    function test_AppealJury_MustBeDisjointFromOriginalPanel() public {
        _appealed();
        vm.startPrank(admin);
        vm.expectRevert(GuardLinkPool.InvalidJury.selector);
        pool.assignAppealJury(id, _panel(bob, frank, grace)); // original juror
        vm.expectRevert(GuardLinkPool.InvalidJury.selector);
        pool.assignAppealJury(id, _panel(erin, carol, grace));
        vm.expectRevert(GuardLinkPool.InvalidJury.selector);
        pool.assignAppealJury(id, _panel(erin, frank, dave)); // dave never voted but was on the panel
        vm.stopPrank();
    }

    function test_AppealJury_ExcludesClaimantDuplicatesUnverified() public {
        _appealed();
        vm.startPrank(admin);
        vm.expectRevert(GuardLinkPool.InvalidJury.selector);
        pool.assignAppealJury(id, _panel(alice, frank, grace));
        vm.expectRevert(GuardLinkPool.InvalidJury.selector);
        pool.assignAppealJury(id, _panel(erin, erin, grace));
        vm.expectRevert(GuardLinkPool.InvalidJury.selector);
        pool.assignAppealJury(id, _panel(erin, frank, mallory));
        vm.expectRevert(GuardLinkPool.InvalidJury.selector);
        pool.assignAppealJury(id, _panel(erin, frank, outsider));
        vm.stopPrank();
    }

    function test_AppealJury_ExcludesContact() public {
        bytes32 id2 = _submit(heidi, keccak256("c"), heidiPolicy, 100e6);
        vm.prank(heidi);
        pool.setClaimContact(id2, erin);
        _assign(id2);
        _vote(bob, id2, false, 0);
        _vote(carol, id2, false, 0);
        vm.prank(heidi);
        pool.appeal(id2);
        vm.prank(admin);
        vm.expectRevert(GuardLinkPool.InvalidJury.selector);
        pool.assignAppealJury(id2, _panel(erin, frank, grace));
    }

    function test_AppealJury_AssignmentAndRoleSeparation() public {
        vm.prank(admin);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.assignAppealJury(id, _panel(erin, frank, grace)); // not yet appealed
        _appealed();
        vm.prank(admin);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.assignJury(id, _panel(erin, frank, grace)); // original entrypoint closed

        vm.expectEmit(true, true, true, true, address(pool));
        emit GuardLinkPool.JuryAssigned(id, true, _panel(erin, frank, grace), uint64(block.timestamp + 72 hours));
        _assignAppeal(id);
        assertEq(uint8(_status(id)), uint8(GuardLinkPool.Status.AppealVoting));

        // original jurors cannot vote in appeal; appeal jurors cannot use vote()
        vm.prank(bob);
        vm.expectRevert(GuardLinkPool.Unauthorized.selector);
        pool.appealVote(id, true, 100e6, RAT);
        vm.prank(erin);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.vote(id, true, 100e6, RAT);

        // no appeal-panel replacement after first appeal ballot
        _appealVote(erin, id, true, 100e6);
        vm.prank(admin);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.assignAppealJury(id, _panel(erin, frank, grace));
    }

    function test_AppealVote_DuplicateAndUnauthorized() public {
        _appealed();
        _assignAppeal(id);
        _appealVote(erin, id, true, 100e6);
        vm.prank(erin);
        vm.expectRevert(GuardLinkPool.AlreadyVoted.selector);
        pool.appealVote(id, true, 100e6, RAT);
        vm.prank(alice);
        vm.expectRevert(GuardLinkPool.Unauthorized.selector);
        pool.appealVote(id, true, 100e6, RAT);
    }

    // --------------------------------------------------------------- outcomes
    function test_Appeal_Approved_ThenSettles() public {
        _fundPool(1_000e6);
        _appealed();
        _assignAppeal(id);
        _appealVote(erin, id, true, 200e6);
        vm.expectEmit(true, true, true, true, address(pool));
        emit GuardLinkPool.ClaimApproved(id, 200e6, true);
        _appealVote(frank, id, true, 200e6);

        assertEq(uint8(_status(id)), uint8(GuardLinkPool.Status.Approved));
        assertEq(_used(alicePolicy), 200e6);
        assertEq(pool.committedPayouts(), 200e6);
        assertEq(pool.openClaimExposure(), 0);
        pool.settle(id);
        assertEq(token.balanceOf(alice), 200e6);
    }

    function test_Appeal_Rejected_IsFinal_ReleasesImmediately() public {
        _appealed();
        _assignAppeal(id);
        _appealVote(erin, id, false, 0);
        vm.expectEmit(true, true, true, true, address(pool));
        emit GuardLinkPool.ClaimRejected(id, 500e6, true, 0);
        _appealVote(frank, id, false, 0);
        assertEq(_used(alicePolicy), 500e6);
        pool.releaseExposure(id); // no waiting required after a final rejection
        assertEq(_used(alicePolicy), 0);
        assertEq(pool.openClaimExposure(), 0);
    }

    function test_Appeal_DivergentVotes_Unresolved() public {
        _appealed();
        _assignAppeal(id);
        uint64 dl = pool.getClaim(id).deadline;
        _appealVote(erin, id, true, 100e6);
        _appealVote(frank, id, true, 200e6);
        _appealVote(grace, id, true, 300e6);
        assertEq(uint8(_status(id)), uint8(GuardLinkPool.Status.Unresolved));
        vm.expectRevert(GuardLinkPool.TooEarly.selector);
        pool.releaseExposure(id);
        vm.warp(dl);
        pool.releaseExposure(id);
        assertEq(_used(alicePolicy), 0);
    }

    function test_Appeal_NoPanelWithin72h_ExpiresAndReleases() public {
        _appealed();
        skip(72 hours);
        assertEq(uint8(_status(id)), uint8(GuardLinkPool.Status.Unresolved));
        vm.prank(admin);
        vm.expectRevert(GuardLinkPool.DeadlinePassed.selector);
        pool.assignAppealJury(id, _panel(erin, frank, grace));
        pool.releaseExposure(id);
        assertEq(_used(alicePolicy), 0);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.settle(id);
    }

    // ------------------------------------------------- exposure after reject
    function test_Rejection_ReservationHeldUntilAppealWindowCloses() public {
        assertEq(_used(alicePolicy), 500e6);
        vm.expectRevert(GuardLinkPool.TooEarly.selector);
        pool.releaseExposure(id);
        skip(72 hours);
        vm.expectEmit(true, true, true, true, address(pool));
        emit GuardLinkPool.ExposureReleased(id, alicePolicy, 500e6);
        pool.releaseExposure(id);
        assertEq(_used(alicePolicy), 0);
        vm.prank(alice);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.appeal(id); // too late and already released
    }

    function test_ReleaseExposure_NeverReleasesApprovedOrPaid() public {
        _fundPool(1_000e6);
        bytes32 a = _approvedClaim(heidi, keccak256("a"), heidiPolicy, 300e6, 300e6);
        skip(30 days);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.releaseExposure(a);
        pool.settle(a);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.releaseExposure(a);
        assertEq(_used(heidiPolicy), 300e6);
    }
}
