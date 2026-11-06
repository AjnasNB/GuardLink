// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {GuardLinkPoolTestBase} from "./GuardLinkPool.Base.t.sol";
import {GuardLinkPool} from "../GuardLinkPool.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

/// Drives bounded realistic flows and tracks ghost accounting.
contract PoolHandler is Test {
    GuardLinkPool internal pool;
    MockERC20 internal token;
    address internal admin;
    address internal claimant;
    uint256 internal policyId;
    address[3] internal jurors;

    bytes32[] internal ids;
    mapping(bytes32 => uint128) internal approvedOf;
    mapping(bytes32 => bool) internal paid;
    uint256 internal nonce;

    uint256 public ghostApproved;
    uint256 public ghostPaid;
    uint256 public ghostMinted;

    constructor(GuardLinkPool p, MockERC20 t, address a, address c, uint256 pid, address[3] memory j) {
        pool = p;
        token = t;
        admin = a;
        claimant = c;
        policyId = pid;
        jurors = j;
    }

    function fund(uint256 amt) external {
        amt = bound(amt, 0, 500e6);
        token.mint(address(pool), amt);
        ghostMinted += amt;
    }

    function claimAndApprove(uint256 reqSeed, uint256 apprSeed) external {
        (,, uint64 end, uint128 limit, uint128 used) = pool.policies(policyId);
        if (limit == used || block.timestamp >= end) return;
        uint128 req = uint128(bound(reqSeed, 1, limit - used));
        uint128 appr = uint128(bound(apprSeed, 1, req));
        vm.prank(claimant);
        bytes32 id = pool.submitClaim(keccak256(abi.encode(nonce++)), policyId, req, uint64(block.timestamp), bytes32(0));
        vm.prank(admin);
        pool.assignJury(id, jurors);
        vm.prank(jurors[0]);
        pool.vote(id, true, appr, bytes32(0));
        vm.prank(jurors[1]);
        pool.vote(id, true, appr, bytes32(0));
        ids.push(id);
        approvedOf[id] = appr;
        ghostApproved += appr;
    }

    /// open claim that nobody judges: reserve then expire + release (net zero).
    function openThenExpire(uint256 reqSeed) external {
        (,, uint64 end, uint128 limit, uint128 used) = pool.policies(policyId);
        if (limit == used || block.timestamp + 72 hours >= end) return;
        uint128 req = uint128(bound(reqSeed, 1, limit - used));
        vm.prank(claimant);
        bytes32 id = pool.submitClaim(keccak256(abi.encode(nonce++)), policyId, req, uint64(block.timestamp), bytes32(0));
        skip(72 hours);
        pool.releaseExposure(id);
    }

    function settleOne(uint256 seed) external {
        if (ids.length == 0) return;
        bytes32 id = ids[seed % ids.length];
        uint128 a = approvedOf[id];
        if (paid[id] || token.balanceOf(address(pool)) < a) return;
        pool.settle(id);
        paid[id] = true;
        ghostPaid += a;
    }
}

contract GuardLinkPoolInvariantTest is GuardLinkPoolTestBase {
    PoolHandler internal handler;

    function setUp() public override {
        super.setUp();
        handler = new PoolHandler(pool, token, admin, alice, alicePolicy, [bob, carol, dave]);
        targetContract(address(handler));
    }

    /// committed payouts are exactly the approved-but-unpaid amount
    function invariant_CommittedEqualsApprovedMinusPaid() public view {
        assertEq(pool.committedPayouts(), handler.ghostApproved() - handler.ghostPaid());
    }

    /// token conservation: base contributions + minted - paid out
    function invariant_TokenConservation() public view {
        assertEq(token.balanceOf(address(pool)), 2 * uint256(CONTRIB) + handler.ghostMinted() - handler.ghostPaid());
    }

    /// policy usage = approved total; no stale open exposure; never above limit
    function invariant_PolicyUsageMatchesApprovals() public view {
        (,,, uint128 limit, uint128 used) = pool.policies(alicePolicy);
        assertEq(uint256(used), handler.ghostApproved());
        assertLe(used, limit);
        assertEq(pool.openClaimExposure(), 0);
    }
}
