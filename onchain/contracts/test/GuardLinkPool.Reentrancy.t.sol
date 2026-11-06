// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {GuardLinkPoolTestBase} from "./GuardLinkPool.Base.t.sol";
import {GuardLinkPool} from "../GuardLinkPool.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

/// Token that tries to re-enter settle() for ANOTHER approved claim while paying the first.
contract ReentrantToken is MockERC20 {
    GuardLinkPool public target;
    bytes32 public otherClaim;
    bool public armed;
    bool public attempted;
    bool public blocked;
    bytes4 public errSel;

    function arm(GuardLinkPool t, bytes32 other) external {
        target = t;
        otherClaim = other;
        armed = true;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (armed && from == address(target)) {
            armed = false;
            attempted = true;
            try target.settle(otherClaim) {}
            catch (bytes memory r) {
                blocked = true;
                errSel = bytes4(r);
            }
        }
        super._update(from, to, value);
    }
}

/// Member contract that re-enters contribute() from its ERC721 receiver hook.
contract MintReentrant is IERC721Receiver {
    GuardLinkPool public pool;
    MockERC20 public tok;
    bool public blocked;
    uint256 public hits;
    bytes4 public errSel;

    constructor(GuardLinkPool p, MockERC20 t) {
        pool = p;
        tok = t;
    }

    function join() external {
        pool.join();
    }

    function go() external {
        tok.approve(address(pool), type(uint256).max);
        pool.contribute();
    }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        ++hits;
        try pool.contribute() {}
        catch (bytes memory r) {
            blocked = true;
            errSel = bytes4(r);
        }
        return IERC721Receiver.onERC721Received.selector;
    }
}

contract GuardLinkPoolReentrancyTest is GuardLinkPoolTestBase {
    function _newToken() internal override returns (MockERC20) {
        return new ReentrantToken();
    }

    function test_Reentrancy_SettleCannotBeReenteredViaToken() public {
        ReentrantToken rt = ReentrantToken(address(token));
        _fundPool(1_000e6);
        bytes32 a = _approvedClaim(alice, CID, alicePolicy, 100e6, 100e6);
        bytes32 b = _approvedClaim(heidi, keccak256("h"), heidiPolicy, 100e6, 100e6);
        rt.arm(pool, b);

        pool.settle(a);

        assertTrue(rt.attempted(), "token tried to re-enter");
        assertTrue(rt.blocked(), "re-entry was blocked");
        assertEq(rt.errSel(), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(token.balanceOf(alice), 100e6);
        assertEq(token.balanceOf(heidi), 0, "other claim not paid inside callback");
        assertEq(uint8(_status(b)), uint8(GuardLinkPool.Status.Approved));
        assertEq(pool.committedPayouts(), 100e6);

        pool.settle(b); // normal path still fine
        assertEq(token.balanceOf(heidi), 100e6);
    }

    function test_Reentrancy_ContributeCannotBeReenteredViaMintHook() public {
        MintReentrant atk = new MintReentrant(pool, token);
        atk.join();
        vm.prank(admin);
        pool.verifyMember(address(atk), true);
        token.mint(address(atk), 2 * CONTRIB); // enough for a second policy if reentry worked

        uint256 next = pool.nextPolicyId();
        atk.go();

        assertEq(atk.hits(), 1);
        assertTrue(atk.blocked(), "reentrant contribute blocked");
        assertEq(atk.errSel(), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(pool.nextPolicyId(), next + 1, "exactly one policy minted");
        assertEq(pool.balanceOf(address(atk)), 1);
        assertEq(token.balanceOf(address(atk)), CONTRIB, "charged exactly once");
    }
}
