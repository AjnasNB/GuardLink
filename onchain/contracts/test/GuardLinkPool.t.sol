// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {GuardLinkPoolTestBase} from "./GuardLinkPool.Base.t.sol";
import {GuardLinkPool} from "../GuardLinkPool.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

/// Deployment, membership, contribution and the end-to-end happy path.
contract GuardLinkPoolTest is GuardLinkPoolTestBase {
    // ------------------------------------------------------------ deployment
    function test_Deploy_StoresConfigAndSigner() public view {
        assertEq(pool.admin(), admin);
        assertEq(pool.deploymentSigner(), address(this));
        assertEq(address(pool.token()), address(token));
        assertEq(pool.contributionAmount(), CONTRIB);
        assertEq(pool.coverageLimit(), LIMIT);
        assertEq(pool.termDays(), TERM);
    }

    function test_Deploy_EmitsPoolDeployed() public {
        vm.expectEmit(true, true, true, true);
        emit GuardLinkPool.PoolDeployed(admin, address(this), address(token), CONTRIB, LIMIT, TERM);
        new GuardLinkPool(admin, address(token), CONTRIB, LIMIT, TERM);
    }

    function test_RevertDeploy_InvalidArgs() public {
        vm.expectRevert(GuardLinkPool.InvalidInput.selector);
        new GuardLinkPool(address(0), address(token), CONTRIB, LIMIT, TERM);
        vm.expectRevert(GuardLinkPool.InvalidInput.selector);
        new GuardLinkPool(admin, address(0), CONTRIB, LIMIT, TERM);
        vm.expectRevert(GuardLinkPool.InvalidInput.selector);
        new GuardLinkPool(admin, makeAddr("eoa"), CONTRIB, LIMIT, TERM); // no code
        vm.expectRevert(GuardLinkPool.InvalidInput.selector);
        new GuardLinkPool(admin, address(token), 0, LIMIT, TERM);
        vm.expectRevert(GuardLinkPool.InvalidInput.selector);
        new GuardLinkPool(admin, address(token), CONTRIB, 0, TERM);
        vm.expectRevert(GuardLinkPool.InvalidInput.selector);
        new GuardLinkPool(admin, address(token), CONTRIB, LIMIT, 0);
    }

    // ------------------------------------------------------------ membership
    function test_Join_RecordsMemberAndRejectsDuplicate() public {
        assertTrue(pool.members(alice));
        assertFalse(pool.members(outsider));
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        vm.prank(alice);
        pool.join();
    }

    function test_VerifyMember_TogglesAndCounts() public {
        uint256 n = pool.verifiedMemberCount();
        assertEq(n, 8);
        assertFalse(pool.verifiedMembers(mallory));
        vm.expectEmit(true, true, true, true, address(pool));
        emit GuardLinkPool.MemberVerified(mallory, true, pool.verificationEpoch() + 1);
        vm.prank(admin);
        pool.verifyMember(mallory, true);
        assertTrue(pool.verifiedMembers(mallory));
        assertEq(pool.verifiedMemberCount(), n + 1);
        vm.prank(admin);
        pool.verifyMember(mallory, false);
        assertFalse(pool.verifiedMembers(mallory));
        assertEq(pool.verifiedMemberCount(), n);
    }

    function test_RevertVerifyMember_NoopAndNonMember() public {
        vm.startPrank(admin);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.verifyMember(alice, true); // already verified
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.verifyMember(mallory, false); // already unverified
        vm.expectRevert(GuardLinkPool.InvalidInput.selector);
        pool.verifyMember(outsider, true); // not a member
        vm.stopPrank();
    }

    // ------------------------------------------------------------ contribute
    function test_Contribute_PullsFundsAndMintsPolicy() public {
        assertEq(alicePolicy, 1);
        assertEq(heidiPolicy, 2);
        assertEq(pool.nextPolicyId(), 3);
        assertEq(token.balanceOf(address(pool)), 2 * CONTRIB);
        assertEq(pool.ownerOf(alicePolicy), alice);
        assertEq(pool.balanceOf(alice), 1);
        (address m, uint64 s, uint64 e, uint128 l, uint128 u) = pool.policies(alicePolicy);
        assertEq(m, alice);
        assertEq(s, T0);
        assertEq(e, T0 + uint64(TERM) * 1 days);
        assertEq(l, LIMIT);
        assertEq(u, 0);
    }

    function test_RevertContribute_UnverifiedOrNonMember() public {
        token.mint(mallory, CONTRIB);
        token.mint(outsider, CONTRIB);
        vm.startPrank(mallory);
        token.approve(address(pool), CONTRIB);
        vm.expectRevert(GuardLinkPool.Unauthorized.selector);
        pool.contribute();
        vm.stopPrank();
        vm.startPrank(outsider);
        token.approve(address(pool), CONTRIB);
        vm.expectRevert(GuardLinkPool.Unauthorized.selector);
        pool.contribute();
        vm.stopPrank();
    }

    function test_RevertContribute_NoAllowance() public {
        token.mint(bob, CONTRIB); // bob never approved
        vm.prank(bob);
        vm.expectRevert();
        pool.contribute();
        assertEq(pool.nextPolicyId(), 3);
    }

    function test_RevertContribute_TokenTransferFails() public {
        token.mint(bob, CONTRIB);
        vm.startPrank(bob);
        token.approve(address(pool), CONTRIB);
        vm.stopPrank();
        token.setFailTransfers(true);
        vm.prank(bob);
        vm.expectRevert();
        pool.contribute();
        assertEq(pool.nextPolicyId(), 3);
        assertEq(pool.balanceOf(bob), 0);
    }

    // ------------------------------------------------------------ happy path
    function test_HappyPath_EndToEnd() public {
        address zed = makeAddr("zed");
        uint256 pid = pool.nextPolicyId();
        _fundPool(1_000e6);

        // join
        vm.expectEmit(true, true, true, true, address(pool));
        emit GuardLinkPool.MemberJoined(zed);
        vm.prank(zed);
        pool.join();

        // verify
        vm.expectEmit(true, true, true, true, address(pool));
        emit GuardLinkPool.MemberVerified(zed, true, pool.verificationEpoch() + 1);
        vm.prank(admin);
        pool.verifyMember(zed, true);

        // contribute
        token.mint(zed, CONTRIB);
        vm.startPrank(zed);
        token.approve(address(pool), CONTRIB);
        vm.expectEmit(true, true, true, true, address(pool));
        emit GuardLinkPool.Contribution(zed, pid, CONTRIB);
        vm.expectEmit(true, true, true, true, address(pool));
        emit GuardLinkPool.PolicyIssued(pid, zed, uint64(block.timestamp), uint64(block.timestamp + uint256(TERM) * 1 days), LIMIT);
        assertEq(pool.contribute(), pid);
        vm.stopPrank();
        assertEq(pool.ownerOf(pid), zed);

        // claim
        skip(1 days);
        bytes32 id = pool.computeClaimId(zed, CID);
        vm.expectEmit(true, true, true, true, address(pool));
        emit GuardLinkPool.ClaimSubmitted(id, CID, zed, pid, 400e6, uint64(block.timestamp), EVID);
        vm.prank(zed);
        bytes32 returned = pool.submitClaim(CID, pid, 400e6, uint64(block.timestamp), EVID);
        assertEq(returned, id);
        assertEq(uint8(_status(id)), uint8(GuardLinkPool.Status.Submitted));
        assertEq(_used(pid), 400e6);
        assertEq(pool.openClaimExposure(), 400e6);

        // jury
        vm.expectEmit(true, true, true, true, address(pool));
        emit GuardLinkPool.JuryAssigned(id, false, _panel(bob, carol, dave), uint64(block.timestamp + 72 hours));
        _assign(id);
        assertEq(uint8(_status(id)), uint8(GuardLinkPool.Status.Voting));
        address[3] memory j = pool.getJury(id, false);
        assertEq(j[0], bob);
        assertEq(j[1], carol);
        assertEq(j[2], dave);

        // two matching approve votes
        vm.expectEmit(true, true, true, true, address(pool));
        emit GuardLinkPool.BallotCast(id, bob, false, true, 300e6, RAT);
        _vote(bob, id, true, 300e6);
        assertEq(uint8(_status(id)), uint8(GuardLinkPool.Status.Voting));

        vm.expectEmit(true, true, true, true, address(pool));
        emit GuardLinkPool.BallotCast(id, carol, false, true, 300e6, RAT);
        vm.expectEmit(true, true, true, true, address(pool));
        emit GuardLinkPool.ExposureReleased(id, pid, 100e6);
        vm.expectEmit(true, true, true, true, address(pool));
        emit GuardLinkPool.ClaimApproved(id, 300e6, false);
        _vote(carol, id, true, 300e6);

        GuardLinkPool.Claim memory c = pool.getClaim(id);
        assertEq(uint8(c.status), uint8(GuardLinkPool.Status.Approved));
        assertEq(c.approvedAmount, 300e6);
        assertEq(_used(pid), 300e6);
        assertEq(pool.committedPayouts(), 300e6);
        assertEq(pool.openClaimExposure(), 0);
        assertTrue(c.ballotCommitment != bytes32(0));
        GuardLinkPool.Ballot memory b = pool.getBallot(id, false, 0);
        assertTrue(b.cast && b.approve);
        assertEq(b.amount, 300e6);
        assertEq(b.rationaleHash, RAT);

        // settle (permissionless)
        uint256 poolBefore = token.balanceOf(address(pool));
        vm.expectEmit(true, true, true, true, address(pool));
        emit GuardLinkPool.ClaimPaid(id, zed, 300e6);
        vm.prank(stranger);
        pool.settle(id);

        c = pool.getClaim(id);
        assertEq(uint8(c.status), uint8(GuardLinkPool.Status.Paid));
        assertTrue(c.paid);
        assertEq(token.balanceOf(zed), 300e6);
        assertEq(token.balanceOf(address(pool)), poolBefore - 300e6);
        assertEq(pool.committedPayouts(), 0);
        assertEq(_used(pid), 300e6); // paid usage is permanent
    }

    function test_MissingRecords_Revert() public {
        bytes32 nope = keccak256("nope");
        vm.expectRevert(GuardLinkPool.MissingRecord.selector);
        pool.getClaim(nope);
        vm.expectRevert(GuardLinkPool.MissingRecord.selector);
        pool.settle(nope);
        vm.expectRevert(GuardLinkPool.MissingRecord.selector);
        pool.getProposal(1);
        vm.expectRevert(GuardLinkPool.MissingRecord.selector);
        pool.voteProposal(1, true);
    }
}
