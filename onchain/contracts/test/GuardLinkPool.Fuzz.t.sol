// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {GuardLinkPoolTestBase} from "./GuardLinkPool.Base.t.sol";
import {GuardLinkPool} from "../GuardLinkPool.sol";

contract GuardLinkPoolFuzzTest is GuardLinkPoolTestBase {
    address[8] internal voters;

    function setUp() public override {
        super.setUp();
        voters = [alice, heidi, bob, carol, dave, erin, frank, grace];
    }

    function testFuzz_Settle_PaysExactApprovedWhenFunded(uint128 requested, uint128 approved, uint256 funding) public {
        requested = uint128(bound(requested, 1, LIMIT));
        approved = uint128(bound(approved, 1, requested));
        funding = bound(funding, 0, 2_000e6);
        _fundPool(funding);

        bytes32 id = _approvedClaim(alice, CID, alicePolicy, requested, approved);
        assertEq(_used(alicePolicy), approved, "used == approved after approval");
        assertEq(pool.committedPayouts(), approved);
        assertEq(pool.openClaimExposure(), 0);

        uint256 bal = token.balanceOf(address(pool));
        if (bal >= approved) {
            pool.settle(id);
            assertEq(token.balanceOf(alice), approved);
            assertEq(token.balanceOf(address(pool)), bal - approved);
            assertEq(pool.committedPayouts(), 0);
            assertEq(uint8(_status(id)), uint8(GuardLinkPool.Status.Paid));
        } else {
            vm.expectRevert(GuardLinkPool.InsufficientFunds.selector);
            pool.settle(id);
            assertEq(token.balanceOf(alice), 0);
            assertEq(token.balanceOf(address(pool)), bal);
            assertEq(uint8(_status(id)), uint8(GuardLinkPool.Status.Approved));
            _fundPool(approved - bal);
            pool.settle(id);
            assertEq(token.balanceOf(alice), approved);
        }
    }

    function testFuzz_Limits_SecondClaimSucceedsIffWithinRemaining(uint128 a, uint128 b) public {
        a = uint128(bound(a, 1, LIMIT));
        b = uint128(bound(b, 1, LIMIT));
        _submit(alice, keccak256("1"), alicePolicy, a);
        vm.prank(alice);
        if (uint256(a) + b > LIMIT) {
            vm.expectRevert(GuardLinkPool.CoverageExceeded.selector);
            pool.submitClaim(keccak256("2"), alicePolicy, b, uint64(block.timestamp), EVID);
            assertEq(_used(alicePolicy), a);
        } else {
            pool.submitClaim(keccak256("2"), alicePolicy, b, uint64(block.timestamp), EVID);
            assertEq(_used(alicePolicy), uint256(a) + b);
        }
        assertLe(_used(alicePolicy), LIMIT);
    }

    function testFuzz_Limits_ReleaseRestoresExactly(uint128 a, uint128 c) public {
        a = uint128(bound(a, 1, LIMIT));
        c = uint128(bound(c, 1, a));
        bytes32 id = _submit(alice, CID, alicePolicy, a);
        _assign(id);
        _vote(bob, id, true, c);
        _vote(carol, id, true, c);
        assertEq(_used(alicePolicy), c);
        // difference was freed exactly: can still claim LIMIT - c
        if (c < LIMIT) {
            _submit(alice, keccak256("2"), alicePolicy, LIMIT - c);
            assertEq(_used(alicePolicy), LIMIT);
        }
    }

    function testFuzz_GraceWindow(uint256 delta) public {
        delta = bound(delta, 0, 60 days);
        (, , uint64 end,,) = pool.policies(alicePolicy);
        vm.warp(uint256(end) + delta);
        vm.prank(alice);
        if (delta > 30 days) vm.expectRevert(GuardLinkPool.InvalidInput.selector);
        pool.submitClaim(CID, alicePolicy, 1e6, end, EVID);
    }

    function testFuzz_TreasuryCapIsTenPercentOfFree(uint256 funding, uint256 amount, uint256 reservedSeed) public {
        funding = bound(funding, 0, 1e12);
        _fundPool(funding);
        // optionally reserve some exposure
        uint128 reserved = uint128(bound(reservedSeed, 0, LIMIT));
        if (reserved != 0) _submit(alice, CID, alicePolicy, reserved);
        uint256 free = pool.freeTreasury();
        assertEq(free, token.balanceOf(address(pool)) > reserved ? token.balanceOf(address(pool)) - reserved : 0);
        amount = bound(amount, 1, 1e12);
        vm.prank(alice);
        if (amount > free / 10) vm.expectRevert(GuardLinkPool.InsufficientFunds.selector);
        pool.proposeTreasuryTransfer(makeAddr("r"), uint128(amount), "grant");
    }

    function testFuzz_GovernanceThresholds(uint256 yes, uint256 no) public {
        yes = bound(yes, 0, 8);
        no = bound(no, 0, 8 - yes);
        vm.prank(alice);
        uint256 pid = pool.proposeRules(50e6, 2_000e6, 30, "d");
        for (uint256 i; i < yes + no; ++i) {
            vm.prank(voters[i]);
            pool.voteProposal(pid, i < yes);
        }
        skip(72 hours);
        uint256 cast = yes + no;
        bool expected = cast != 0 && cast >= uint256(4) && yes >= (2 * cast + 2) / 3;
        (bool ok,) = address(pool).call(abi.encodeCall(pool.executeProposal, (pid)));
        assertEq(ok, expected);
    }
}
