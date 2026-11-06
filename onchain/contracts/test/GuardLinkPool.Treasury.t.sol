// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {GuardLinkPoolTestBase} from "./GuardLinkPool.Base.t.sol";
import {GuardLinkPool} from "../GuardLinkPool.sol";

contract GuardLinkPoolTreasuryTest is GuardLinkPoolTestBase {
    address[8] internal voters;
    address internal recipient = makeAddr("recipient");

    function setUp() public override {
        super.setUp();
        voters = [alice, heidi, bob, carol, dave, erin, frank, grace];
    }

    function _proposeTransfer(uint128 amount) internal returns (uint256 pid) {
        vm.prank(alice);
        pid = pool.proposeTreasuryTransfer(recipient, amount, "Fund demo grant");
    }

    function _passAndWait(uint256 pid) internal {
        for (uint256 i; i < 5; ++i) {
            vm.prank(voters[i]);
            pool.voteProposal(pid, true);
        }
        skip(72 hours);
    }

    function test_TreasurySupported() public view {
        assertTrue(pool.treasuryTransfersSupported());
    }

    function test_FreeTreasury_ExcludesExposureAndCommitted() public {
        assertEq(pool.freeTreasury(), 200e6);
        _submit(alice, CID, alicePolicy, 100e6);
        assertEq(pool.freeTreasury(), 100e6, "open exposure reserved");
        bytes32 id = _approvedClaim(heidi, keccak256("h"), heidiPolicy, 50e6, 50e6);
        assertEq(pool.freeTreasury(), 50e6, "committed payout reserved");
        assertEq(uint8(_status(id)), uint8(GuardLinkPool.Status.Approved));
        // saturating at zero when obligations exceed balance
        _submit(alice, keccak256("2"), alicePolicy, 900e6);
        assertEq(pool.freeTreasury(), 0);
    }

    function test_RevertPropose_InvalidArgs() public {
        _fundPool(10_000e6);
        vm.startPrank(alice);
        vm.expectRevert(GuardLinkPool.InvalidInput.selector);
        pool.proposeTreasuryTransfer(address(0), 1e6, "x");
        vm.expectRevert(GuardLinkPool.InvalidInput.selector);
        pool.proposeTreasuryTransfer(address(pool), 1e6, "x");
        vm.expectRevert(GuardLinkPool.InvalidInput.selector);
        pool.proposeTreasuryTransfer(recipient, 0, "x");
        vm.stopPrank();
    }

    function test_Transfer_CapIs10PercentOfFreeTreasury_AtProposal() public {
        _fundPool(9_800e6); // balance 10_000e6
        vm.prank(alice);
        vm.expectRevert(GuardLinkPool.InsufficientFunds.selector);
        pool.proposeTreasuryTransfer(recipient, 1_000e6 + 1, "x");
        vm.expectEmit(true, true, true, true, address(pool));
        emit GuardLinkPool.TreasuryTransferProposed(1, recipient, 1_000e6);
        uint256 pid = _proposeTransfer(1_000e6);
        GuardLinkPool.Proposal memory p = pool.getProposal(pid);
        assertEq(uint8(p.kind), uint8(GuardLinkPool.ProposalKind.TreasuryTransfer));
        assertEq(p.recipient, recipient);
        assertEq(p.amount, 1_000e6);
    }

    function test_Transfer_ExecutesAfterVote_PaysRecipientOnce() public {
        _fundPool(9_800e6);
        uint256 pid = _proposeTransfer(500e6);
        _passAndWait(pid);
        vm.expectEmit(true, true, true, true, address(pool));
        emit GuardLinkPool.TreasuryTransferred(pid, recipient, 500e6);
        vm.prank(stranger);
        pool.executeProposal(pid);
        assertEq(token.balanceOf(recipient), 500e6);
        assertEq(token.balanceOf(address(pool)), 9_500e6);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.executeProposal(pid);
        assertEq(token.balanceOf(recipient), 500e6);
    }

    function test_Transfer_FailsIfNotPassed() public {
        _fundPool(9_800e6);
        uint256 pid = _proposeTransfer(500e6);
        vm.prank(bob);
        pool.voteProposal(pid, true); // 1 vote < quorum 4
        skip(72 hours);
        vm.expectRevert(GuardLinkPool.ProposalNotPassed.selector);
        pool.executeProposal(pid);
        assertEq(token.balanceOf(recipient), 0);
    }

    function test_Transfer_CannotSpendCommittedPayouts() public {
        _fundPool(1_000e6); // balance 1_200e6
        bytes32 id = _approvedClaim(alice, CID, alicePolicy, 1_000e6, 1_000e6);
        assertEq(pool.committedPayouts(), 1_000e6);
        assertEq(pool.freeTreasury(), 200e6);

        vm.prank(alice);
        vm.expectRevert(GuardLinkPool.InsufficientFunds.selector);
        pool.proposeTreasuryTransfer(recipient, 20e6 + 1, "x"); // 10% of free 200e6 = 20e6

        uint256 pid = _proposeTransfer(20e6);
        _passAndWait(pid);
        pool.executeProposal(pid);
        assertEq(token.balanceOf(recipient), 20e6);

        // the approved payout can still be paid in full
        pool.settle(id);
        assertEq(token.balanceOf(alice), 1_000e6);
        assertEq(token.balanceOf(address(pool)), 180e6);
    }

    function test_Transfer_CapRecheckedAtExecution_NewExposureShrinksIt() public {
        _fundPool(9_800e6);
        uint256 pid = _proposeTransfer(1_000e6); // legal now
        _passAndWait(pid);
        // before execution, 1000e6 of claims are submitted: free 9_000e6 -> cap 900e6
        _submit(alice, CID, alicePolicy, 1_000e6);
        vm.expectRevert(GuardLinkPool.InsufficientFunds.selector);
        pool.executeProposal(pid);
        assertFalse(pool.getProposal(pid).executed);
        assertEq(token.balanceOf(recipient), 0);
    }

    function test_Transfer_CommittedApprovalAfterProposalBlocksExecution() public {
        _fundPool(800e6); // balance 1_000e6, cap 100e6
        uint256 pid = _proposeTransfer(100e6);
        _passAndWait(pid);
        bytes32 id = _approvedClaim(alice, CID, alicePolicy, 1_000e6, 1_000e6); // balance == committed
        assertEq(pool.freeTreasury(), 0);
        vm.expectRevert(GuardLinkPool.InsufficientFunds.selector);
        pool.executeProposal(pid);
        pool.settle(id); // payout fully funded
        assertEq(token.balanceOf(alice), 1_000e6);
    }

    function test_NoAdminWithdrawPath() public {
        // admin has no way to move pool funds: the only outflows are settle (to claimant) and executed proposals
        _fundPool(1_000e6);
        uint256 before_ = token.balanceOf(address(pool));
        vm.startPrank(admin);
        vm.expectRevert(GuardLinkPool.Unauthorized.selector);
        pool.proposeTreasuryTransfer(admin, 1e6, "x"); // admin is not a verified member
        vm.stopPrank();
        assertEq(token.balanceOf(address(pool)), before_);
    }
}
