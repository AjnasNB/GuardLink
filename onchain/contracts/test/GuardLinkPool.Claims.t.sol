// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {GuardLinkPoolTestBase} from "./GuardLinkPool.Base.t.sol";
import {GuardLinkPool} from "../GuardLinkPool.sol";

contract GuardLinkPoolClaimsTest is GuardLinkPoolTestBase {
    uint64 internal start;
    uint64 internal end;

    function setUp() public override {
        super.setUp();
        (, start, end,,) = pool.policies(alicePolicy);
    }

    function _try(address who, bytes32 cid, uint256 pid, uint128 amt, uint64 incident) internal {
        vm.prank(who);
        pool.submitClaim(cid, pid, amt, incident, EVID);
    }

    // --------------------------------------------------------- claim IDs
    function test_SubmitClaim_ReturnsCanonicalId() public {
        bytes32 id = _submit(alice, CID, alicePolicy, 100e6);
        assertEq(id, keccak256(abi.encode(alice, CID)));
        assertEq(id, pool.computeClaimId(alice, CID));
        assertTrue(id != CID);
        GuardLinkPool.Claim memory c = pool.getClaim(id);
        assertEq(c.claimant, alice);
        assertEq(c.policyId, alicePolicy);
        assertEq(c.requestedAmount, 100e6);
        assertEq(c.evidenceCommitment, EVID);
        assertEq(c.incidentAt, block.timestamp);
        assertEq(c.deadline, block.timestamp + 72 hours);
        vm.expectRevert(GuardLinkPool.MissingRecord.selector);
        pool.getClaim(CID); // raw clientId is not a claim key
    }

    function test_ClaimIdSquatting_OtherMemberCannotBlockVictim() public {
        bytes32 attackerId = _submit(heidi, CID, heidiPolicy, 100e6); // front-runs the same clientId
        bytes32 victimId = _submit(alice, CID, alicePolicy, 100e6);
        assertTrue(attackerId != victimId);
        assertEq(pool.getClaim(victimId).claimant, alice);
        assertEq(pool.getClaim(attackerId).claimant, heidi);
        assertEq(victimId, pool.computeClaimId(alice, CID));
    }

    function test_ClaimIdSquatting_AttackerCannotActOnVictimClaim() public {
        bytes32 victimId = _submit(alice, CID, alicePolicy, 100e6);
        vm.prank(heidi);
        vm.expectRevert(GuardLinkPool.Unauthorized.selector);
        pool.setClaimContact(victimId, heidi);
        // the attacker also cannot reuse the victim's canonical id: it is derived from msg.sender
        bytes32 attackerId = _submit(heidi, CID, heidiPolicy, 100e6);
        assertTrue(attackerId != victimId);
        assertEq(pool.getClaim(victimId).claimant, alice);
        assertEq(pool.getClaim(victimId).policyId, alicePolicy);
    }

    function test_RevertSubmit_SameClaimantReusesClientId() public {
        _submit(alice, CID, alicePolicy, 100e6);
        vm.expectRevert(GuardLinkPool.InvalidInput.selector);
        _try(alice, CID, alicePolicy, 100e6, uint64(block.timestamp));
    }

    // ------------------------------------------------- eligibility reverts
    function test_RevertSubmit_UnverifiedOrNonMember() public {
        vm.expectRevert(GuardLinkPool.Unauthorized.selector);
        _try(mallory, CID, alicePolicy, 1e6, uint64(block.timestamp));
        vm.expectRevert(GuardLinkPool.Unauthorized.selector);
        _try(outsider, CID, alicePolicy, 1e6, uint64(block.timestamp));
        // revoked member can no longer claim
        vm.prank(admin);
        pool.verifyMember(alice, false);
        vm.expectRevert(GuardLinkPool.Unauthorized.selector);
        _try(alice, CID, alicePolicy, 1e6, uint64(block.timestamp));
    }

    function test_RevertSubmit_NotPolicyOwnerOrMissingPolicy() public {
        vm.expectRevert(GuardLinkPool.Unauthorized.selector);
        _try(alice, CID, heidiPolicy, 1e6, uint64(block.timestamp));
        vm.expectRevert(GuardLinkPool.Unauthorized.selector);
        _try(alice, CID, 999, 1e6, uint64(block.timestamp));
    }

    function test_RevertSubmit_ZeroAmountOrAboveLimit() public {
        vm.expectRevert(GuardLinkPool.CoverageExceeded.selector);
        _try(alice, CID, alicePolicy, 0, uint64(block.timestamp));
        vm.expectRevert(GuardLinkPool.CoverageExceeded.selector);
        _try(alice, CID, alicePolicy, LIMIT + 1, uint64(block.timestamp));
        _submit(alice, CID, alicePolicy, LIMIT); // exactly the limit is fine
    }

    // ------------------------------------------------------ policy overcommit
    function test_PolicyOvercommit_ParallelClaimsCannotExceedLimit() public {
        _submit(alice, keccak256("1"), alicePolicy, 700e6);
        vm.expectRevert(GuardLinkPool.CoverageExceeded.selector);
        _try(alice, keccak256("2"), alicePolicy, 300e6 + 1, uint64(block.timestamp));
        _submit(alice, keccak256("2"), alicePolicy, 300e6); // exactly remaining
        assertEq(_used(alicePolicy), LIMIT);
        vm.expectRevert(GuardLinkPool.CoverageExceeded.selector);
        _try(alice, keccak256("3"), alicePolicy, 1, uint64(block.timestamp));
        assertEq(pool.openClaimExposure(), LIMIT);
    }

    function test_PolicyOvercommit_PartialApprovalFreesDifferenceOnly() public {
        bytes32 id = _approvedClaim(alice, keccak256("1"), alicePolicy, 700e6, 500e6);
        assertEq(_used(alicePolicy), 500e6);
        _submit(alice, keccak256("2"), alicePolicy, 500e6);
        vm.expectRevert(GuardLinkPool.CoverageExceeded.selector);
        _try(alice, keccak256("3"), alicePolicy, 1, uint64(block.timestamp));
        assertEq(uint8(_status(id)), uint8(GuardLinkPool.Status.Approved));
    }

    function test_PolicyOvercommit_PaidClaimsConsumeLimitPermanently() public {
        _fundPool(1_000e6);
        bytes32 id = _approvedClaim(alice, keccak256("1"), alicePolicy, 600e6, 600e6);
        pool.settle(id);
        vm.expectRevert(GuardLinkPool.CoverageExceeded.selector);
        _try(alice, keccak256("2"), alicePolicy, 400e6 + 1, uint64(block.timestamp));
    }

    function test_PolicyOvercommit_RejectedClaimFreedAfterWindow() public {
        _rejectedClaim(alice, keccak256("1"), alicePolicy, 900e6);
        vm.expectRevert(GuardLinkPool.CoverageExceeded.selector);
        _try(alice, keccak256("2"), alicePolicy, 200e6, uint64(block.timestamp)); // still reserved
        skip(72 hours);
        pool.releaseExposure(pool.computeClaimId(alice, keccak256("1")));
        _submit(alice, keccak256("2"), alicePolicy, 200e6);
    }

    // ------------------------------------------------------ incident validity
    function test_RevertSubmit_FutureIncident() public {
        vm.expectRevert(GuardLinkPool.InvalidInput.selector);
        _try(alice, CID, alicePolicy, 1e6, uint64(block.timestamp + 1));
        _try(alice, CID, alicePolicy, 1e6, uint64(block.timestamp)); // now is fine
    }

    function test_RevertSubmit_IncidentBeforeCoverageStart() public {
        skip(10 days);
        vm.expectRevert(GuardLinkPool.InvalidInput.selector);
        _try(alice, CID, alicePolicy, 1e6, start - 1);
        _try(alice, CID, alicePolicy, 1e6, start); // inclusive start
    }

    function test_RevertSubmit_ExpiredPolicyIncidentAfterEnd() public {
        vm.warp(end + 1);
        vm.expectRevert(GuardLinkPool.InvalidInput.selector);
        _try(alice, CID, alicePolicy, 1e6, end + 1); // incident after expiry: noncovered
        _try(alice, CID, alicePolicy, 1e6, end); // incident at last covered second: ok in grace
    }

    function test_Grace_BoundaryWithCoveredIncident() public {
        vm.warp(uint256(end) + 30 days);
        _try(alice, keccak256("a"), alicePolicy, 1e6, end); // exactly 30 days after end: ok
        vm.warp(uint256(end) + 30 days + 1);
        vm.expectRevert(GuardLinkPool.InvalidInput.selector);
        _try(alice, keccak256("b"), alicePolicy, 1e6, end); // 1s late
        vm.expectRevert(GuardLinkPool.InvalidInput.selector);
        _try(alice, keccak256("c"), alicePolicy, 1e6, end - 1 days);
    }
}
