// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {GuardLinkPoolTestBase} from "./GuardLinkPool.Base.t.sol";
import {GuardLinkPool} from "../GuardLinkPool.sol";

contract GuardLinkPoolGovTest is GuardLinkPoolTestBase {
    address[8] internal voters;
    address internal recipient = makeAddr("recipient");

    function setUp() public override {
        super.setUp();
        voters = [alice, heidi, bob, carol, dave, erin, frank, grace];
    }

    function _propose() internal returns (uint256 pid) {
        vm.prank(alice);
        pid = pool.proposeRules(50e6, 2_000e6, 30, "Lower fee, higher cap");
    }

    function _proposeTransfer(uint128 amount) internal returns (uint256 pid) {
        vm.prank(alice);
        pid = pool.proposeTreasuryTransfer(recipient, amount, "Fund demo grant");
    }

    function _cast(uint256 pid, uint256 yes, uint256 no) internal {
        for (uint256 i; i < yes + no; ++i) {
            vm.prank(voters[i]);
            pool.voteProposal(pid, i < yes);
        }
    }

    function _exec(uint256 pid) internal returns (bool ok) {
        (ok,) = address(pool).call(abi.encodeCall(pool.executeProposal, (pid)));
    }

    function _outcome(uint256 yes, uint256 no) internal returns (bool) {
        uint256 pid = _propose();
        _cast(pid, yes, no);
        skip(72 hours);
        return _exec(pid);
    }

    // --------------------------------------------------------- proposals
    function test_ProposeRules_SnapshotAndEvents() public {
        vm.expectEmit(true, true, true, true, address(pool));
        emit GuardLinkPool.ProposalCreated(
            1, alice, GuardLinkPool.ProposalKind.Rules, pool.verificationEpoch(), 8,
            uint64(block.timestamp + 72 hours), "Lower fee, higher cap"
        );
        vm.expectEmit(true, true, true, true, address(pool));
        emit GuardLinkPool.RulesProposed(1, 50e6, 2_000e6, 30);
        uint256 pid = _propose();
        GuardLinkPool.Proposal memory p = pool.getProposal(pid);
        assertEq(p.proposer, alice);
        assertEq(p.eligibleCount, 8);
        assertEq(p.deadline, block.timestamp + 72 hours);
        assertFalse(p.executed);
    }

    function test_RevertPropose_UnverifiedOrInvalid() public {
        vm.prank(mallory);
        vm.expectRevert(GuardLinkPool.Unauthorized.selector);
        pool.proposeRules(50e6, 2_000e6, 30, "x");
        vm.prank(outsider);
        vm.expectRevert(GuardLinkPool.Unauthorized.selector);
        pool.proposeTreasuryTransfer(recipient, 1, "x");
        vm.startPrank(alice);
        vm.expectRevert(GuardLinkPool.InvalidInput.selector);
        pool.proposeRules(0, 2_000e6, 30, "x");
        vm.expectRevert(GuardLinkPool.InvalidInput.selector);
        pool.proposeRules(1, 0, 30, "x");
        vm.expectRevert(GuardLinkPool.InvalidInput.selector);
        pool.proposeRules(1, 1, 0, "x");
        vm.stopPrank();
    }

    // ---------------------------------------------------- snapshot semantics
    function test_Snapshot_UnverifyAfterProposal_CanStillVote() public {
        uint256 pid = _propose();
        vm.prank(admin);
        pool.verifyMember(bob, false); // same block as proposal
        vm.prank(bob);
        pool.voteProposal(pid, true);
        assertEq(pool.getProposal(pid).yesVotes, 1);
        assertEq(pool.getProposal(pid).eligibleCount, 8, "snapshot count immutable");
    }

    function test_Snapshot_VerifyAfterProposal_CannotVote_UntilNextProposal() public {
        uint256 pid = _propose();
        vm.prank(admin);
        pool.verifyMember(mallory, true);
        vm.prank(mallory);
        vm.expectRevert(GuardLinkPool.Unauthorized.selector);
        pool.voteProposal(pid, true);
        assertEq(pool.getProposal(pid).eligibleCount, 8);

        uint256 pid2 = _propose(); // new snapshot includes mallory
        assertEq(pool.getProposal(pid2).eligibleCount, 9);
        vm.prank(mallory);
        pool.voteProposal(pid2, true);
    }

    function test_Snapshot_UnverifiedBeforeProposal_CannotVote() public {
        vm.prank(admin);
        pool.verifyMember(heidi, false);
        uint256 pid = _propose();
        assertEq(pool.getProposal(pid).eligibleCount, 7);
        vm.prank(heidi);
        vm.expectRevert(GuardLinkPool.Unauthorized.selector);
        pool.voteProposal(pid, true);
    }

    function test_Snapshot_FlipFlopSameBlockAfterProposalDoesNotChangeEligibility() public {
        uint256 pid = _propose();
        vm.startPrank(admin);
        pool.verifyMember(mallory, true);
        pool.verifyMember(mallory, false);
        pool.verifyMember(bob, false);
        pool.verifyMember(bob, true);
        pool.verifyMember(bob, false);
        vm.stopPrank();
        vm.prank(mallory);
        vm.expectRevert(GuardLinkPool.Unauthorized.selector);
        pool.voteProposal(pid, true);
        vm.prank(bob);
        pool.voteProposal(pid, true);
    }

    function test_Snapshot_VerifiedAtHistory() public {
        uint64 e0 = pool.verificationEpoch();
        assertTrue(pool.verifiedAt(bob, e0));
        vm.prank(admin);
        pool.verifyMember(bob, false);
        assertTrue(pool.verifiedAt(bob, e0));
        assertFalse(pool.verifiedAt(bob, pool.verificationEpoch()));
        assertFalse(pool.verifiedAt(mallory, e0));
        assertFalse(pool.verifiedAt(outsider, e0));
    }

    // ------------------------------------------------------ voting/execution
    function test_VoteProposal_OnceOnly_AndEvent() public {
        uint256 pid = _propose();
        vm.expectEmit(true, true, true, true, address(pool));
        emit GuardLinkPool.ProposalVote(pid, bob, true);
        vm.prank(bob);
        pool.voteProposal(pid, true);
        vm.startPrank(bob);
        vm.expectRevert(GuardLinkPool.AlreadyVoted.selector);
        pool.voteProposal(pid, true);
        vm.expectRevert(GuardLinkPool.AlreadyVoted.selector);
        pool.voteProposal(pid, false);
        vm.stopPrank();
        assertEq(pool.getProposal(pid).yesVotes, 1);
        assertEq(pool.getProposal(pid).noVotes, 0);
        assertTrue(pool.proposalVoted(pid, bob));
    }

    function test_VoteProposal_DeadlineBoundary() public {
        uint256 pid = _propose();
        uint64 dl = pool.getProposal(pid).deadline;
        vm.warp(dl - 1);
        vm.prank(bob);
        pool.voteProposal(pid, true);
        vm.warp(dl);
        vm.prank(carol);
        vm.expectRevert(GuardLinkPool.DeadlinePassed.selector);
        pool.voteProposal(pid, true);
    }

    function test_Execute_OnlyAfterDeadline() public {
        uint256 pid = _propose();
        _cast(pid, 7, 0); // one eligible member (8 snapshotted) has not voted -> no early exec
        vm.expectRevert(GuardLinkPool.TooEarly.selector);
        pool.executeProposal(pid);
        vm.warp(pool.getProposal(pid).deadline - 1);
        vm.expectRevert(GuardLinkPool.TooEarly.selector);
        pool.executeProposal(pid);
        vm.warp(pool.getProposal(pid).deadline);
        vm.expectEmit(true, true, true, true, address(pool));
        emit GuardLinkPool.RulesUpdated(pid, 50e6, 2_000e6, 30);
        vm.expectEmit(true, true, true, true, address(pool));
        emit GuardLinkPool.ProposalExecuted(pid, GuardLinkPool.ProposalKind.Rules);
        vm.prank(stranger); // permissionless
        pool.executeProposal(pid);
        assertTrue(pool.getProposal(pid).executed);
    }

    function test_Execute_NoVotes_NotPassed_AndDoubleExecute() public {
        uint256 pid = _propose();
        skip(72 hours);
        vm.expectRevert(GuardLinkPool.ProposalNotPassed.selector);
        pool.executeProposal(pid);

        uint256 pid2 = _propose();
        _cast(pid2, 8, 0);
        skip(72 hours);
        pool.executeProposal(pid2);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.executeProposal(pid2);
    }

    function test_Quorum_RoundedUp_OddElectorate() public {
        vm.prank(admin);
        pool.verifyMember(grace, false); // 7 eligible -> quorum ceil(3.5)=4
        uint256 pid = _propose();
        assertEq(pool.getProposal(pid).eligibleCount, 7);
        _cast(pid, 3, 0); // 3 unanimous yes: below quorum (floor would be 3)
        skip(72 hours);
        vm.expectRevert(GuardLinkPool.ProposalNotPassed.selector);
        pool.executeProposal(pid);

        uint256 pid2 = _propose();
        _cast(pid2, 4, 0);
        skip(72 hours);
        pool.executeProposal(pid2);
    }

    function test_Quorum_EvenElectorateExactHalf() public {
        assertFalse(_outcome(3, 0), "3/8 below quorum");
        assertTrue(_outcome(4, 0), "4/8 meets quorum");
    }

    function test_Support_TwoThirdsRoundedUpOfVotesCast() public {
        assertTrue(_outcome(4, 1), "4/5 >= ceil(10/3)=4");
        assertFalse(_outcome(3, 2), "3/5 < 4 (floor would wrongly allow)");
        assertTrue(_outcome(3, 1), "3/4 >= ceil(8/3)=3");
        assertFalse(_outcome(2, 2), "2/4 < 3");
        assertTrue(_outcome(4, 2), "4/6 == exactly 2/3");
        assertFalse(_outcome(3, 3), "3/6 < 4");
        assertFalse(_outcome(5, 3), "5/8 < ceil(16/3)=6");
        assertTrue(_outcome(6, 2), "6/8 >= 6");
    }

    // ------------------------------------------------------- prospective terms
    function test_Rules_ProspectiveOnly_ExistingPoliciesUnchanged() public {
        bytes32 openClaim = _submit(alice, CID, alicePolicy, 300e6);
        uint256 pid = _propose();
        _cast(pid, 8, 0);
        skip(72 hours);
        pool.executeProposal(pid);

        assertEq(pool.contributionAmount(), 50e6);
        assertEq(pool.coverageLimit(), 2_000e6);
        assertEq(pool.termDays(), 30);

        (, uint64 s, uint64 e, uint128 l, uint128 u) = pool.policies(alicePolicy);
        assertEq(s, T0);
        assertEq(e, T0 + uint64(TERM) * 1 days);
        assertEq(l, LIMIT);
        assertEq(u, 300e6);
        assertEq(pool.getClaim(openClaim).requestedAmount, 300e6);

        // new policy takes the new terms
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
        assertEq(token.balanceOf(mallory), 0);

        // alice's older policy keeps the old limit: the rest of 1000e6 only
        vm.expectRevert(GuardLinkPool.CoverageExceeded.selector);
        vm.prank(alice);
        pool.submitClaim(keccak256("x"), alicePolicy, 700e6 + 1, uint64(block.timestamp), EVID);
    }
}
