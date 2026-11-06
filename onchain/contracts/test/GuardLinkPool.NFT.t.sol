// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {GuardLinkPoolTestBase} from "./GuardLinkPool.Base.t.sol";
import {GuardLinkPool} from "../GuardLinkPool.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

contract GuardLinkPoolNFTTest is GuardLinkPoolTestBase {
    function test_Policy_OwnedByMember() public view {
        assertEq(pool.ownerOf(alicePolicy), alice);
        assertEq(pool.ownerOf(heidiPolicy), heidi);
        assertEq(pool.balanceOf(alice), 1);
    }

    function test_Nontransferable_TransferFrom() public {
        vm.prank(alice);
        vm.expectRevert(GuardLinkPool.Nontransferable.selector);
        pool.transferFrom(alice, bob, alicePolicy);
        vm.prank(stranger);
        vm.expectRevert(GuardLinkPool.Nontransferable.selector);
        pool.transferFrom(alice, stranger, alicePolicy);
        vm.prank(alice);
        vm.expectRevert(GuardLinkPool.Nontransferable.selector);
        pool.transferFrom(alice, alice, alicePolicy); // self-transfer too
        assertEq(pool.ownerOf(alicePolicy), alice);
    }

    function test_Nontransferable_SafeTransferFrom_BothOverloads() public {
        vm.startPrank(alice);
        vm.expectRevert(GuardLinkPool.Nontransferable.selector);
        pool.safeTransferFrom(alice, bob, alicePolicy);
        vm.expectRevert(GuardLinkPool.Nontransferable.selector);
        pool.safeTransferFrom(alice, bob, alicePolicy, "");
        vm.stopPrank();
        assertEq(pool.ownerOf(alicePolicy), alice);
        assertEq(pool.balanceOf(bob), 0);
    }

    function test_Nontransferable_ApproveAndSetApprovalForAllRevert() public {
        vm.startPrank(alice);
        vm.expectRevert(GuardLinkPool.Nontransferable.selector);
        pool.approve(bob, alicePolicy);
        vm.expectRevert(GuardLinkPool.Nontransferable.selector);
        pool.setApprovalForAll(bob, true);
        vm.expectRevert(GuardLinkPool.Nontransferable.selector);
        pool.setApprovalForAll(bob, false);
        vm.stopPrank();
        assertEq(pool.getApproved(alicePolicy), address(0));
        assertFalse(pool.isApprovedForAll(alice, bob));
    }

    function test_TokenURI_OnlyPolicyIdPoolAndDates() public view {
        (, uint64 s, uint64 e,,) = pool.policies(alicePolicy);
        string memory expected = string.concat(
            "data:application/json,{\"id\":1,\"pool\":\"", Strings.toHexString(address(pool)),
            "\",\"start\":", Strings.toString(s), ",\"end\":", Strings.toString(e), "}"
        );
        assertEq(pool.tokenURI(alicePolicy), expected);
    }

    function test_TokenURI_NoMemberMedicalOrIdentityDetails() public {
        bytes32 id = _submit(alice, CID, alicePolicy, 100e6);
        _assign(id);
        string memory uri = pool.tokenURI(alicePolicy);
        assertFalse(_contains(uri, Strings.toHexString(alice)), "no holder address");
        assertFalse(_contains(uri, Strings.toHexString(uint256(EVID), 32)), "no evidence commitment");
        string[8] memory banned =
            ["medical", "diagnos", "name", "claim", "evidence", "email", "patient", "amount"];
        for (uint256 i; i < banned.length; ++i) {
            assertFalse(_contains(uri, banned[i]), banned[i]);
        }
        // claim activity never leaks into metadata
        assertEq(keccak256(bytes(uri)), keccak256(bytes(pool.tokenURI(alicePolicy))));
        assertTrue(_contains(uri, Strings.toHexString(address(pool))));
    }

    function test_TokenURI_NonexistentReverts() public {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 99));
        pool.tokenURI(99);
    }
}
