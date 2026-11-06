// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {GuardLinkPoolTestBase} from "./GuardLinkPool.Base.t.sol";
import {GuardLinkPool} from "../GuardLinkPool.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract GuardLinkPoolSettleTest is GuardLinkPoolTestBase {
    function test_Settle_PaysOnlyClaimant_AnyCallerCanTrigger() public {
        _fundPool(1_000e6);
        bytes32 id = _approvedClaim(alice, CID, alicePolicy, 400e6, 400e6);
        uint256 aliceBefore = token.balanceOf(alice);
        uint256 strangerBefore = token.balanceOf(stranger);
        uint256 bobBefore = token.balanceOf(bob);
        uint256 adminBefore = token.balanceOf(admin);

        vm.prank(stranger);
        pool.settle(id);

        assertEq(token.balanceOf(alice), aliceBefore + 400e6, "claimant paid");
        assertEq(token.balanceOf(stranger), strangerBefore, "caller not paid");
        assertEq(token.balanceOf(bob), bobBefore, "juror not paid");
        assertEq(token.balanceOf(admin), adminBefore, "admin not paid");
        assertEq(pool.committedPayouts(), 0);
    }

    function test_Settle_DoubleSettlement_Reverts() public {
        _fundPool(1_000e6);
        bytes32 id = _approvedClaim(alice, CID, alicePolicy, 400e6, 400e6);
        pool.settle(id);
        uint256 bal = token.balanceOf(alice);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.settle(id);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        vm.prank(alice);
        pool.settle(id);
        assertEq(token.balanceOf(alice), bal);
        assertEq(uint8(_status(id)), uint8(GuardLinkPool.Status.Paid));
    }

    function test_Settle_RevertsForNonApprovedClaims() public {
        _fundPool(1_000e6);
        bytes32 submitted = _submit(alice, CID, alicePolicy, 100e6);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.settle(submitted);

        _assign(submitted);
        _vote(bob, submitted, true, 100e6);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.settle(submitted); // Voting

        bytes32 rejected = _rejectedClaim(heidi, keccak256("r"), heidiPolicy, 100e6);
        vm.expectRevert(GuardLinkPool.InvalidState.selector);
        pool.settle(rejected);
    }

    function test_Settle_FailedTokenTransfer_PreservesApprovedAndIsRetriable() public {
        _fundPool(1_000e6);
        bytes32 id = _approvedClaim(alice, CID, alicePolicy, 400e6, 400e6);
        uint256 poolBal = token.balanceOf(address(pool));
        uint256 aliceBal = token.balanceOf(alice);

        token.setFailTransfers(true);
        vm.expectRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(token)));
        pool.settle(id);

        GuardLinkPool.Claim memory c = pool.getClaim(id);
        assertEq(uint8(c.status), uint8(GuardLinkPool.Status.Approved), "still Approved");
        assertFalse(c.paid, "not marked paid");
        assertEq(pool.committedPayouts(), 400e6, "obligation intact");
        assertEq(token.balanceOf(address(pool)), poolBal);
        assertEq(token.balanceOf(alice), aliceBal);

        // retry once the token works again
        token.setFailTransfers(false);
        vm.expectEmit(true, true, true, true, address(pool));
        emit GuardLinkPool.ClaimPaid(id, alice, 400e6);
        pool.settle(id);
        assertEq(uint8(_status(id)), uint8(GuardLinkPool.Status.Paid));
        assertEq(token.balanceOf(alice), aliceBal + 400e6);
        assertEq(pool.committedPayouts(), 0);
    }

    function test_Settle_NoPaidEventOnFailedTransfer() public {
        _fundPool(1_000e6);
        bytes32 id = _approvedClaim(alice, CID, alicePolicy, 400e6, 400e6);
        token.setFailTransfers(true);
        vm.recordLogs();
        (bool ok,) = address(pool).call(abi.encodeCall(pool.settle, (id)));
        assertFalse(ok);
        assertEq(vm.getRecordedLogs().length, 0, "no event on failed payout");
    }

    function test_Settle_InsufficientReserve_ThenFund_ThenRetry() public {
        // pool only holds the two 100e6 contributions = 200e6
        bytes32 id = _approvedClaim(alice, CID, alicePolicy, 500e6, 500e6);
        vm.expectRevert(GuardLinkPool.InsufficientFunds.selector);
        pool.settle(id);

        GuardLinkPool.Claim memory c = pool.getClaim(id);
        assertEq(uint8(c.status), uint8(GuardLinkPool.Status.Approved));
        assertFalse(c.paid);
        assertEq(pool.committedPayouts(), 500e6);
        assertEq(token.balanceOf(alice), 0, "no partial payout");

        // still short by 1 -> still reverts, no partial payment
        _fundPool(299e6);
        vm.expectRevert(GuardLinkPool.InsufficientFunds.selector);
        pool.settle(id);
        assertEq(token.balanceOf(alice), 0);

        _fundPool(1e6); // exactly 500e6 now
        pool.settle(id);
        assertEq(token.balanceOf(alice), 500e6);
        assertEq(uint8(_status(id)), uint8(GuardLinkPool.Status.Paid));
        assertEq(token.balanceOf(address(pool)), 0);
    }

    function test_Settle_PerClaimSolvency_UnfundedSecondDoesNotBlockFundedFirst() public {
        // pool balance 200e6; two approvals of 150e6 each (aggregate 300e6 > balance)
        bytes32 a = _approvedClaim(alice, CID, alicePolicy, 150e6, 150e6);
        bytes32 b = _approvedClaim(heidi, keccak256("h"), heidiPolicy, 150e6, 150e6);
        assertEq(pool.committedPayouts(), 300e6);

        pool.settle(a); // funded first claim pays
        assertEq(token.balanceOf(alice), 150e6);
        assertEq(uint8(_status(a)), uint8(GuardLinkPool.Status.Paid));

        vm.expectRevert(GuardLinkPool.InsufficientFunds.selector);
        pool.settle(b); // unfunded second waits
        assertEq(uint8(_status(b)), uint8(GuardLinkPool.Status.Approved));
        assertEq(pool.committedPayouts(), 150e6);

        _fundPool(100e6);
        pool.settle(b);
        assertEq(token.balanceOf(heidi), 150e6);
        assertEq(pool.committedPayouts(), 0);
    }

    function test_Settle_PerClaimSolvency_SecondClaimCanBePaidFirst() public {
        bytes32 a = _approvedClaim(alice, CID, alicePolicy, 150e6, 150e6);
        bytes32 b = _approvedClaim(heidi, keccak256("h"), heidiPolicy, 150e6, 150e6);
        pool.settle(b); // approved later but paid first: not blocked by earlier unpaid claim a
        assertEq(token.balanceOf(heidi), 150e6);
        vm.expectRevert(GuardLinkPool.InsufficientFunds.selector);
        pool.settle(a);
    }

    function test_Settle_PartialApprovalPaysApprovedNotRequested() public {
        _fundPool(1_000e6);
        bytes32 id = _approvedClaim(alice, CID, alicePolicy, 600e6, 250e6);
        pool.settle(id);
        assertEq(token.balanceOf(alice), 250e6);
        assertEq(_used(alicePolicy), 250e6);
    }
}
