// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {GuardLinkPool} from "../GuardLinkPool.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

/// Shared fixture: 8 verified members (2 claimants + 6 jurors), unverified member, outsider.
abstract contract GuardLinkPoolTestBase is Test {
    GuardLinkPool internal pool;
    MockERC20 internal token;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice"); // main claimant
    address internal heidi = makeAddr("heidi"); // second claimant
    address internal bob = makeAddr("bob"); // panel 1
    address internal carol = makeAddr("carol"); // panel 1
    address internal dave = makeAddr("dave"); // panel 1
    address internal erin = makeAddr("erin"); // panel 2 (appeal)
    address internal frank = makeAddr("frank"); // panel 2 (appeal)
    address internal grace = makeAddr("grace"); // panel 2 (appeal)
    address internal mallory = makeAddr("mallory"); // member, NOT verified
    address internal outsider = makeAddr("outsider"); // not a member
    address internal stranger = makeAddr("stranger");

    uint128 internal constant CONTRIB = 100e6;
    uint128 internal constant LIMIT = 1_000e6;
    uint32 internal constant TERM = 365;
    uint256 internal constant T0 = 1_700_000_000;
    bytes32 internal constant CID = keccak256("uuid-1");
    bytes32 internal constant EVID = keccak256("evidence-commitment");
    bytes32 internal constant RAT = keccak256("rationale");

    uint256 internal alicePolicy;
    uint256 internal heidiPolicy;

    /// Overridable so a category can plug in a hostile token.
    function _newToken() internal virtual returns (MockERC20) {
        return new MockERC20();
    }

    function setUp() public virtual {
        vm.warp(T0);
        token = _newToken();
        pool = new GuardLinkPool(admin, address(token), CONTRIB, LIMIT, TERM);
        address[8] memory vs = [alice, heidi, bob, carol, dave, erin, frank, grace];
        for (uint256 i; i < vs.length; ++i) _onboard(vs[i]);
        vm.prank(mallory);
        pool.join();
        alicePolicy = _policy(alice);
        heidiPolicy = _policy(heidi);
    }

    // ----------------------------------------------------------------- helpers
    function _onboard(address who) internal {
        vm.prank(who);
        pool.join();
        vm.prank(admin);
        pool.verifyMember(who, true);
    }

    function _policy(address who) internal returns (uint256 id) {
        token.mint(who, CONTRIB);
        vm.startPrank(who);
        token.approve(address(pool), CONTRIB);
        id = pool.contribute();
        vm.stopPrank();
    }

    function _fundPool(uint256 amount) internal {
        token.mint(address(pool), amount);
    }

    function _submit(address who, bytes32 clientId, uint256 policyId, uint128 amount)
        internal
        returns (bytes32 claimId)
    {
        vm.prank(who);
        claimId = pool.submitClaim(clientId, policyId, amount, uint64(block.timestamp), EVID);
    }

    function _panel(address a, address b, address c) internal pure returns (address[3] memory p) {
        p = [a, b, c];
    }

    function _assign(bytes32 id) internal {
        vm.prank(admin);
        pool.assignJury(id, _panel(bob, carol, dave));
    }

    function _assignAppeal(bytes32 id) internal {
        vm.prank(admin);
        pool.assignAppealJury(id, _panel(erin, frank, grace));
    }

    function _vote(address who, bytes32 id, bool approve, uint128 amount) internal {
        vm.prank(who);
        pool.vote(id, approve, amount, RAT);
    }

    function _appealVote(address who, bytes32 id, bool approve, uint128 amount) internal {
        vm.prank(who);
        pool.appealVote(id, approve, amount, RAT);
    }

    /// claim -> jury -> bob+carol approve `approved`
    function _approvedClaim(address who, bytes32 clientId, uint256 policyId, uint128 requested, uint128 approved)
        internal
        returns (bytes32 id)
    {
        id = _submit(who, clientId, policyId, requested);
        _assign(id);
        _vote(bob, id, true, approved);
        _vote(carol, id, true, approved);
    }

    /// claim -> jury -> bob+carol reject
    function _rejectedClaim(address who, bytes32 clientId, uint256 policyId, uint128 requested)
        internal
        returns (bytes32 id)
    {
        id = _submit(who, clientId, policyId, requested);
        _assign(id);
        _vote(bob, id, false, 0);
        _vote(carol, id, false, 0);
    }

    function _status(bytes32 id) internal view returns (GuardLinkPool.Status) {
        return pool.getClaim(id).status;
    }

    function _used(uint256 policyId) internal view returns (uint128 used) {
        (,,,, used) = pool.policies(policyId);
    }

    function _contains(string memory haystack, string memory needle) internal pure returns (bool) {
        bytes memory h = bytes(haystack);
        bytes memory n = bytes(needle);
        if (n.length == 0) return true;
        if (n.length > h.length) return false;
        for (uint256 i; i <= h.length - n.length; ++i) {
            bool ok = true;
            for (uint256 j; j < n.length; ++j) {
                if (h[i + j] != n[j]) {
                    ok = false;
                    break;
                }
            }
            if (ok) return true;
        }
        return false;
    }
}
