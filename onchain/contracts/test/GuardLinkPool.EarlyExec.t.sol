// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {GuardLinkPoolTestBase} from "./GuardLinkPool.Base.t.sol";
import {GuardLinkPool} from "../GuardLinkPool.sol";

/// Early execution: before the deadline executeProposal succeeds iff yes+no == eligibleCount
/// (snapshot) and quorum + support pass. After the deadline behaviour is unchanged.
contract GuardLinkPoolEarlyExecTest is GuardLinkPoolTestBase {
    address[8] internal voters;
    address internal recipient = makeAddr("recipient");

    function setUp() public override {
        super.setUp();
        voters = [alice, heidi, bob, carol, dave, erin, frank, grace];
    }

    // ----------------------------------------------------------------- helpers
    /// Leave voters[0..n) verified (alice stays the proposer), revoke the rest BEFORE the snapshot.
    function _electorate(uint256 n) internal {
        for (uint256 i = n; i < 8; ++i) {
            vm.prank(admin);
            pool.verifyMember(voters[i], false);
        }
    }

    function _propose() internal returns (uint256 pid) {
        vm.prank(alice);
        pid = pool.proposeRules(50e6, 2_000e6, 30, "Lower fee, higher cap");
    }

    function _proposeTransfer(uint128 amount) internal returns (uint256 pid) {
        vm.prank(alice);
        pid = pool.proposeTreasuryTransfer(recipient, amount, "Fund demo grant");
    }

    /// voters[0..yes) vote yes, voters[yes..yes+no) vote no.
    function _cast(uint256 pid, uint256 yes, uint256 no) internal {
        for (uint256 i; i < yes + no; ++i) _castOne(pid, voters[i], i < yes);
    }

    function _castOne(uint256 pid, address who, bool support) internal {
        vm.prank(who);
        pool.voteProposal(pid, support);
    }

    function _try(uint256 pid) internal returns (bool ok, bytes memory ret) {
        return address(pool).call(abi.encodeCall(pool.executeProposal, (pid)));
    }

    function _sel(bytes memory ret) internal pure returns (bytes4 s) {
        if (ret.length >= 4) {
            assembly {
                s := mload(add(ret, 32))
            }
        }
    }

    function _ceil23(uint256 c) internal pure returns (uint256) {
        return (2 * c + 2) / 3;
    }

    function _deadline(uint256 pid) internal view returns (uint64) {
        return pool.getProposal(pid).deadline;
    }

    function _assertRulesUnchanged() internal view {
        assertEq(pool.contributionAmount(), CONTRIB);
        assertEq(pool.coverageLimit(), LIMIT);
        assertEq(pool.termDays(), TERM);
    }

    // ============================================== (1) premature => TooEarly
    function test_MissingAnySingleVote_TooEarly_EvenWhenQuorumAndSupportPass() public {
        uint256 pid = _propose();
        _cast(pid, 7, 0); // 7/8 yes: quorum (4) and support (ceil(14/3)=5) both already satisfied
        assertGe(uint256(7), uint256(4));
        assertGe(uint256(7), _ceil23(7));
        vm.expectRevert(GuardLinkPool.TooEarly.selector);
        pool.executeProposal(pid);
        assertFalse(pool.getProposal(pid).executed);
        _assertRulesUnchanged();
    }

    function test_MissingOneToSevenVotes_TooEarly() public {
        for (uint256 missing = 1; missing <= 7; ++missing) {
            uint256 pid = _propose();
            _cast(pid, 8 - missing, 0);
            vm.expectRevert(GuardLinkPool.TooEarly.selector);
            pool.executeProposal(pid);
            assertFalse(pool.getProposal(pid).executed);
        }
        _assertRulesUnchanged();
    }

    function test_NoVotesAtAll_TooEarlyBeforeDeadline() public {
        uint256 pid = _propose();
        vm.expectRevert(GuardLinkPool.TooEarly.selector);
        pool.executeProposal(pid);
    }

    function test_MissingVote_MixedYesNo_TooEarly() public {
        uint256 pid = _propose();
        _cast(pid, 5, 2); // 7 cast, 5/7 >= ceil(14/3)=5 passes, one missing
        vm.expectRevert(GuardLinkPool.TooEarly.selector);
        pool.executeProposal(pid);
    }

    function test_MissingVote_TooEarlyUpToLastSecond_ThenCompletingVoteUnlocks() public {
        uint256 pid = _propose();
        _cast(pid, 7, 0);
        vm.warp(_deadline(pid) - 1);
        vm.expectRevert(GuardLinkPool.TooEarly.selector);
        pool.executeProposal(pid);
        _castOne(pid, grace, true); // last vote (still before deadline) completes the set
        pool.executeProposal(pid);
        assertTrue(pool.getProposal(pid).executed);
    }

    function test_MissingVote_TreasuryTransfer_TooEarly() public {
        _fundPool(9_800e6);
        uint256 pid = _proposeTransfer(500e6);
        _cast(pid, 7, 0);
        vm.expectRevert(GuardLinkPool.TooEarly.selector);
        pool.executeProposal(pid);
        assertEq(token.balanceOf(recipient), 0);
    }

    // ===================================== (2) unanimous early execution works
    function test_EarlyExec_Rules_Unanimous_EmitsAndProspectiveOnly() public {
        bytes32 openClaim = _submit(alice, CID, alicePolicy, 300e6);
        uint256 pid = _propose();
        _cast(pid, 8, 0);
        assertLt(block.timestamp, _deadline(pid));

        vm.expectEmit(true, true, true, true, address(pool));
        emit GuardLinkPool.RulesUpdated(pid, 50e6, 2_000e6, 30);
        vm.expectEmit(true, true, true, true, address(pool));
        emit GuardLinkPool.ProposalExecuted(pid, GuardLinkPool.ProposalKind.Rules);
        vm.prank(stranger); // permissionless
        pool.executeProposal(pid);

        assertLt(block.timestamp, _deadline(pid), "still before the deadline");
        assertTrue(pool.getProposal(pid).executed);
        assertEq(pool.contributionAmount(), 50e6);
        assertEq(pool.coverageLimit(), 2_000e6);
        assertEq(pool.termDays(), 30);

        // existing policies and open claims untouched
        (address m, uint64 s, uint64 e, uint128 l, uint128 u) = pool.policies(alicePolicy);
        assertEq(m, alice);
        assertEq(s, T0);
        assertEq(e, T0 + uint64(TERM) * 1 days);
        assertEq(l, LIMIT);
        assertEq(u, 300e6);
        (, uint64 hs, uint64 he, uint128 hl, uint128 hu) = pool.policies(heidiPolicy);
        assertEq(hs, T0);
        assertEq(he, T0 + uint64(TERM) * 1 days);
        assertEq(hl, LIMIT);
        assertEq(hu, 0);
        assertEq(pool.getClaim(openClaim).requestedAmount, 300e6);

        // new policies take the new terms
        token.mint(mallory, 50e6);
        vm.prank(admin);
        pool.verifyMember(mallory, true);
        vm.startPrank(mallory);
        token.approve(address(pool), 50e6);
        uint256 newId = pool.contribute();
        vm.stopPrank();
        (, uint64 s2, uint64 e2, uint128 l2,) = pool.policies(newId);
        assertEq(l2, 2_000e6);
        assertEq(e2, s2 + 30 days);
    }

    function test_EarlyExec_Rules_MixedVotesMeetingSupport() public {
        uint256 pid = _propose();
        _cast(pid, 6, 2); // 6/8 == ceil(16/3)
        pool.executeProposal(pid);
        assertTrue(pool.getProposal(pid).executed);
        assertEq(pool.contributionAmount(), 50e6);
    }

    function test_EarlyExec_Rules_OneSecondBeforeDeadline() public {
        uint256 pid = _propose();
        _cast(pid, 8, 0);
        vm.warp(_deadline(pid) - 1);
        pool.executeProposal(pid);
        assertTrue(pool.getProposal(pid).executed);
    }

    function test_EarlyExec_TreasuryTransfer_Unanimous() public {
        _fundPool(9_800e6); // balance 10_000e6, cap 1_000e6
        uint256 pid = _proposeTransfer(500e6);
        _cast(pid, 8, 0);
        assertLt(block.timestamp, _deadline(pid));

        vm.expectEmit(true, true, true, true, address(pool));
        emit GuardLinkPool.TreasuryTransferred(pid, recipient, 500e6);
        vm.expectEmit(true, true, true, true, address(pool));
        emit GuardLinkPool.ProposalExecuted(pid, GuardLinkPool.ProposalKind.TreasuryTransfer);
        vm.prank(stranger);
        pool.executeProposal(pid);

        assertTrue(pool.getProposal(pid).executed);
        assertEq(token.balanceOf(recipient), 500e6);
        assertEq(token.balanceOf(address(pool)), 9_500e6);
        _assertRulesUnchanged(); // a treasury proposal never touches the rules
    }

    function test_EarlyExec_TreasuryTransfer_StillCapCheckedAtExecution() public {
        _fundPool(9_800e6);
        uint256 pid = _proposeTransfer(1_000e6);
        _cast(pid, 8, 0);
        _submit(alice, CID, alicePolicy, 1_000e6); // exposure shrinks the cap to 900e6
        vm.expectRevert(GuardLinkPool.InsufficientFunds.selector);
        pool.executeProposal(pid);
        assertFalse(pool.getProposal(pid).executed);
        assertEq(token.balanceOf(recipient), 0);
    }

    // ============= (3) all voted but not enough yes: ProposalNotPassed, no change
    function test_AllVoted_2YesOf4_NotPassed_NoStateChange() public {
        _electorate(4);
        uint256 pid = _propose();
        assertEq(pool.getProposal(pid).eligibleCount, 4);
        _cast(pid, 2, 2);
        _expectNotPassedForever(pid);
    }

    function test_AllVoted_3YesOf5_NotPassed_NoStateChange() public {
        _electorate(5);
        uint256 pid = _propose();
        assertEq(pool.getProposal(pid).eligibleCount, 5);
        _cast(pid, 3, 2);
        _expectNotPassedForever(pid);
    }

    function test_AllVoted_AllNo_NotPassed() public {
        uint256 pid = _propose();
        _cast(pid, 0, 8);
        _expectNotPassedForever(pid);
    }

    function test_AllVoted_TreasuryTransfer_NotPassed_NoTransfer() public {
        _electorate(4);
        _fundPool(9_800e6);
        uint256 pid = _proposeTransfer(500e6);
        _cast(pid, 2, 2);
        uint256 bal = token.balanceOf(address(pool));
        vm.expectRevert(GuardLinkPool.ProposalNotPassed.selector);
        pool.executeProposal(pid);
        assertFalse(pool.getProposal(pid).executed);
        assertEq(token.balanceOf(recipient), 0);
        assertEq(token.balanceOf(address(pool)), bal);
    }

    function _expectNotPassedForever(uint256 pid) internal {
        GuardLinkPool.Proposal memory before_ = pool.getProposal(pid);
        vm.expectRevert(GuardLinkPool.ProposalNotPassed.selector);
        pool.executeProposal(pid);
        vm.expectRevert(GuardLinkPool.ProposalNotPassed.selector); // retry: still cannot execute early
        pool.executeProposal(pid);
        GuardLinkPool.Proposal memory after_ = pool.getProposal(pid);
        assertFalse(after_.executed);
        assertEq(after_.yesVotes, before_.yesVotes);
        assertEq(after_.noVotes, before_.noVotes);
        assertEq(after_.eligibleCount, before_.eligibleCount);
        _assertRulesUnchanged();
        // and the deadline path agrees
        vm.warp(before_.deadline);
        vm.expectRevert(GuardLinkPool.ProposalNotPassed.selector);
        pool.executeProposal(pid);
        assertFalse(pool.getProposal(pid).executed);
        _assertRulesUnchanged();
    }

    // ============================================================ (4) snapshot
    function test_Snapshot_RevokedAfterSnapshot_CanCastCompletingVote_EarlyExecWorks() public {
        uint256 pid = _propose();
        _cast(pid, 7, 0); // everyone but grace
        vm.prank(admin);
        pool.verifyMember(grace, false); // revoked after snapshot
        vm.expectRevert(GuardLinkPool.TooEarly.selector);
        pool.executeProposal(pid);
        _castOne(pid, grace, true); // snapshot entitlement survives revocation
        assertEq(pool.getProposal(pid).yesVotes, 8);
        pool.executeProposal(pid);
        assertTrue(pool.getProposal(pid).executed);
        assertLt(block.timestamp, _deadline(pid));
        assertEq(pool.contributionAmount(), 50e6);
    }

    function test_Snapshot_VerifiedAfterSnapshot_CannotVote_CannotSubstituteForMissingVote() public {
        uint256 pid = _propose();
        _cast(pid, 7, 0);
        vm.prank(admin);
        pool.verifyMember(mallory, true); // verifiedMemberCount is now 9, snapshot stays 8
        assertEq(pool.verifiedMemberCount(), 9);
        vm.prank(mallory);
        vm.expectRevert(GuardLinkPool.Unauthorized.selector);
        pool.voteProposal(pid, true);
        GuardLinkPool.Proposal memory p = pool.getProposal(pid);
        assertEq(p.eligibleCount, 8);
        assertEq(p.yesVotes + p.noVotes, 7);
        vm.expectRevert(GuardLinkPool.TooEarly.selector);
        pool.executeProposal(pid);
        // only the genuinely missing snapshotted member can complete the set
        _castOne(pid, grace, true);
        pool.executeProposal(pid);
        assertTrue(pool.getProposal(pid).executed);
    }

    function test_Snapshot_RevokedMemberWhoHasNotVoted_StillCountsAsMissing_UntilDeadline() public {
        uint256 pid = _propose();
        _cast(pid, 7, 0);
        vm.prank(admin);
        pool.verifyMember(grace, false); // revoked, never votes
        assertEq(pool.getProposal(pid).eligibleCount, 8, "snapshot not shrunk");
        vm.expectRevert(GuardLinkPool.TooEarly.selector);
        pool.executeProposal(pid);
        vm.warp(_deadline(pid) - 1);
        vm.expectRevert(GuardLinkPool.TooEarly.selector);
        pool.executeProposal(pid);
        vm.warp(_deadline(pid));
        pool.executeProposal(pid); // deadline path: 7 cast >= 4, 7 yes >= 5
        assertTrue(pool.getProposal(pid).executed);
    }

    function test_Snapshot_RevokedBeforeProposal_ReducesElectorate_EarlyExecAfterRemainingVote() public {
        _electorate(7); // grace revoked before the snapshot
        uint256 pid = _propose();
        assertEq(pool.getProposal(pid).eligibleCount, 7);
        _cast(pid, 6, 0);
        vm.expectRevert(GuardLinkPool.TooEarly.selector);
        pool.executeProposal(pid);
        _castOne(pid, frank, true);
        pool.executeProposal(pid);
        assertTrue(pool.getProposal(pid).executed);
    }

    function test_Snapshot_SwapRevokeAndVerify_DoesNotFillGap() public {
        uint256 pid = _propose();
        _cast(pid, 7, 0);
        vm.startPrank(admin);
        pool.verifyMember(grace, false);
        pool.verifyMember(mallory, true); // verified count back to 8, but a different set
        vm.stopPrank();
        assertEq(pool.verifiedMemberCount(), pool.getProposal(pid).eligibleCount);
        vm.expectRevert(GuardLinkPool.TooEarly.selector);
        pool.executeProposal(pid);
    }

    // ================================== (5) double execution / deadline path
    function test_DoubleExecution_AfterEarlyExec_Reverts() public {
        uint256 pid = _propose();
        _cast(pid, 8, 0);
        pool.executeProposal(pid);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.executeProposal(pid);
        vm.warp(_deadline(pid));
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.executeProposal(pid);
    }

    function test_DoubleExecution_Treasury_PaysOnce() public {
        _fundPool(9_800e6);
        uint256 pid = _proposeTransfer(500e6);
        _cast(pid, 8, 0);
        pool.executeProposal(pid);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.executeProposal(pid);
        assertEq(token.balanceOf(recipient), 500e6);
    }

    function test_AfterDeadline_PartialVotes_StillExecutes() public {
        uint256 pid = _propose();
        _cast(pid, 4, 0); // quorum exactly 4/8
        skip(72 hours);
        pool.executeProposal(pid);
        assertTrue(pool.getProposal(pid).executed);
        assertEq(pool.contributionAmount(), 50e6);
    }

    function test_AfterDeadline_PartialVotes_BelowQuorumOrSupport_StillNotPassed() public {
        uint256 pid = _propose();
        _cast(pid, 3, 0); // 3 < quorum 4
        uint256 pid2 = _propose();
        _cast(pid2, 3, 2); // 3/5 < 4
        skip(72 hours);
        vm.expectRevert(GuardLinkPool.ProposalNotPassed.selector);
        pool.executeProposal(pid);
        vm.expectRevert(GuardLinkPool.ProposalNotPassed.selector);
        pool.executeProposal(pid2);
    }

    function test_MissingRecord_Reverts() public {
        vm.expectRevert(GuardLinkPool.MissingRecord.selector);
        pool.executeProposal(999);
    }

    // ===================================================== (6) voting deadline
    function test_VoteAfterDeadline_StillReverts_EvenWithOneMissing() public {
        uint256 pid = _propose();
        _cast(pid, 7, 0);
        vm.warp(_deadline(pid));
        vm.prank(grace);
        vm.expectRevert(GuardLinkPool.DeadlinePassed.selector);
        pool.voteProposal(pid, true);
        pool.executeProposal(pid); // deadline path still works with 7 votes
        assertTrue(pool.getProposal(pid).executed);
    }

    function test_VoteAfterEarlyExecution_ButBeforeDeadline_Reverts_NoDoubleCount() public {
        _electorate(4);
        uint256 pid = _propose();
        _cast(pid, 4, 0);
        pool.executeProposal(pid);
        // everyone already voted: no way to add a vote
        vm.prank(bob);
        vm.expectRevert(GuardLinkPool.AlreadyVoted.selector);
        pool.voteProposal(pid, false);
        assertEq(pool.getProposal(pid).yesVotes, 4);
        assertEq(pool.getProposal(pid).noVotes, 0);
    }

    // ===================================================================== fuzz
    /// All eligible members vote: early execution succeeds iff the support rule passes
    /// (quorum is implied by unanimity of participation), and matches the post-deadline result.
    function testFuzz_AllVoted_EarlyExecMatchesThresholds(uint256 n, uint256 yes) public {
        n = bound(n, 1, 8);
        yes = bound(yes, 0, n);
        _electorate(n);
        uint256 pid = _propose();
        assertEq(pool.getProposal(pid).eligibleCount, n);
        _cast(pid, yes, n - yes);

        bool expected = yes >= _ceil23(n);
        (bool ok, bytes memory ret) = _try(pid);
        assertLt(block.timestamp, _deadline(pid));
        assertEq(ok, expected, "early outcome");
        if (expected) {
            assertTrue(pool.getProposal(pid).executed);
            assertEq(pool.contributionAmount(), 50e6);
        } else {
            assertEq(_sel(ret), GuardLinkPool.ProposalNotPassed.selector);
            assertFalse(pool.getProposal(pid).executed);
            _assertRulesUnchanged();
            // deadline path gives the same answer
            vm.warp(_deadline(pid));
            (bool ok2,) = _try(pid);
            assertFalse(ok2);
        }
    }

    /// Any strict subset of votes: TooEarly before the deadline; after it the old rules apply.
    function testFuzz_MissingVotes_TooEarlyThenDeadlineRules(uint256 n, uint256 missing, uint256 yes) public {
        n = bound(n, 1, 8);
        missing = bound(missing, 1, n);
        uint256 cast = n - missing;
        yes = bound(yes, 0, cast);
        _electorate(n);
        uint256 pid = _propose();
        _cast(pid, yes, cast - yes);

        (bool ok, bytes memory ret) = _try(pid);
        assertFalse(ok);
        assertEq(_sel(ret), GuardLinkPool.TooEarly.selector);
        assertFalse(pool.getProposal(pid).executed);

        vm.warp(_deadline(pid) - 1);
        (ok, ret) = _try(pid);
        assertFalse(ok);
        assertEq(_sel(ret), GuardLinkPool.TooEarly.selector);

        vm.warp(_deadline(pid));
        bool expected = cast != 0 && cast >= (n + 1) / 2 && yes >= _ceil23(cast);
        (ok, ret) = _try(pid);
        assertEq(ok, expected, "deadline outcome");
        if (!ok) assertEq(_sel(ret), GuardLinkPool.ProposalNotPassed.selector);
    }

    /// A revoked-after-snapshot member can complete the set at any electorate size.
    function testFuzz_RevokedAfterSnapshot_CompletingVoteUnlocksEarlyExec(uint256 n, uint256 revokeIdx) public {
        n = bound(n, 2, 8);
        revokeIdx = bound(revokeIdx, 1, n - 1);
        _electorate(n);
        uint256 pid = _propose();
        for (uint256 i; i < n; ++i) {
            if (i != revokeIdx) _castOne(pid, voters[i], true);
        }
        vm.prank(admin);
        pool.verifyMember(voters[revokeIdx], false);
        vm.expectRevert(GuardLinkPool.TooEarly.selector);
        pool.executeProposal(pid);
        _castOne(pid, voters[revokeIdx], true);
        pool.executeProposal(pid);
        assertTrue(pool.getProposal(pid).executed);
    }

    /// Voting at/after the deadline always reverts, regardless of how many votes are missing.
    function testFuzz_VoteAtOrAfterDeadline_Reverts(uint256 n, uint256 extra) public {
        n = bound(n, 1, 8);
        extra = bound(extra, 0, 30 days);
        _electorate(n);
        uint256 pid = _propose();
        vm.warp(_deadline(pid) + extra);
        vm.prank(alice);
        vm.expectRevert(GuardLinkPool.DeadlinePassed.selector);
        pool.voteProposal(pid, true);
    }
}
