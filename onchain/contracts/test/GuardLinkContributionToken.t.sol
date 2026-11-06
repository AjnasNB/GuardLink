// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {GuardLinkContributionToken} from "../mocks/GuardLinkContributionToken.sol";

contract GuardLinkContributionTokenTest is Test {
    GuardLinkContributionToken internal token;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    uint256 internal constant START = 1_000_000;
    uint256 internal constant MAX = 100e6;
    uint256 internal constant COOLDOWN = 10 minutes;

    function setUp() public {
        // forge's default timestamp (1) is < COOLDOWN, which would make a first
        // claim revert (lastClaim == 0). Warp to a realistic time.
        vm.warp(START);
        token = new GuardLinkContributionToken();
    }

    // ---------------------------------------------------------------- metadata

    function test_Metadata() public view {
        assertEq(token.name(), "GuardLink Contribution Token (TESTNET MOCK, NO VALUE)");
        assertEq(token.symbol(), "GLCT");
        assertEq(token.decimals(), 6);
        assertEq(token.MAX_PER_CLAIM(), MAX);
        assertEq(token.COOLDOWN(), COOLDOWN);
        assertEq(token.totalSupply(), 0, "no premint");
    }

    // ------------------------------------------------------------- happy paths

    function test_FaucetMintsAndRecordsClaim() public {
        vm.prank(alice);
        token.faucet(alice, 50e6);
        assertEq(token.balanceOf(alice), 50e6);
        assertEq(token.totalSupply(), 50e6);
        assertEq(token.lastClaim(alice), START);
    }

    function test_FaucetEmitsFaucetClaim() public {
        vm.expectEmit(true, true, false, true, address(token));
        emit GuardLinkContributionToken.FaucetClaim(alice, alice, 42e6);
        vm.prank(alice);
        token.faucet(alice, 42e6);
    }

    function test_FaucetExactlyMaxSucceeds() public {
        _claim(alice, MAX);
        assertEq(token.balanceOf(alice), MAX);
    }

    function test_FaucetOneBaseUnitSucceeds() public {
        _claim(alice, 1);
        assertEq(token.balanceOf(alice), 1);
    }

    // ----------------------------------------------------------------- reverts

    function test_RevertWhen_ZeroRecipient() public {
        vm.expectRevert(GuardLinkContributionToken.ZeroRecipient.selector);
        token.faucet(address(0), 1e6);
    }

    function test_ZeroRecipientCheckedBeforeThirdPartyCheck() public {
        // caller != to, but `to` is zero: ZeroRecipient wins over ThirdPartyClaim
        vm.prank(alice);
        vm.expectRevert(GuardLinkContributionToken.ZeroRecipient.selector);
        token.faucet(address(0), 0);
    }

    function test_RevertWhen_ZeroAmount() public {
        vm.expectRevert(GuardLinkContributionToken.ZeroAmount.selector);
        _claim(alice, 0);
    }

    function test_RevertWhen_OverMax() public {
        vm.expectRevert(
            abi.encodeWithSelector(GuardLinkContributionToken.ClaimAmountExceeded.selector, MAX + 1, MAX)
        );
        _claim(alice, MAX + 1);
        assertEq(token.balanceOf(alice), 0);
    }

    function test_RevertWhen_OverMaxDoesNotSetCooldown() public {
        vm.expectRevert();
        _claim(alice, MAX + 1);
        assertEq(token.lastClaim(alice), 0);
        _claim(alice, MAX); // still claimable immediately
        assertEq(token.balanceOf(alice), MAX);
    }

    // ---------------------------------------------------------------- cooldown

    function test_CooldownRevertsOneSecondBefore() public {
        _claim(alice, 10e6);
        skip(COOLDOWN - 1);
        vm.expectRevert(abi.encodeWithSelector(GuardLinkContributionToken.CooldownActive.selector, START + COOLDOWN));
        _claim(alice, 10e6);
        assertEq(token.balanceOf(alice), 10e6);
    }

    function test_CooldownAllowsAtExactlyCooldown() public {
        _claim(alice, 10e6);
        skip(COOLDOWN);
        _claim(alice, 20e6);
        assertEq(token.balanceOf(alice), 30e6);
        assertEq(token.lastClaim(alice), START + COOLDOWN);
    }

    function test_CooldownRevertsImmediatelyAfterClaim() public {
        _claim(alice, 1e6);
        vm.expectRevert(abi.encodeWithSelector(GuardLinkContributionToken.CooldownActive.selector, START + COOLDOWN));
        _claim(alice, 1e6);
    }

    function test_CooldownRestartsAfterSecondClaim() public {
        _claim(alice, 1e6);
        skip(COOLDOWN);
        _claim(alice, 1e6);
        skip(COOLDOWN - 1);
        vm.expectRevert(
            abi.encodeWithSelector(GuardLinkContributionToken.CooldownActive.selector, START + 2 * COOLDOWN)
        );
        _claim(alice, 1e6);
    }

    function test_CooldownIsPerAddress() public {
        _claim(alice, 10e6);

        // bob and carol are unaffected by alice's cooldown
        _claim(bob, 10e6);
        _claim(carol, 10e6);

        // alice is still on cooldown
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(GuardLinkContributionToken.CooldownActive.selector, START + COOLDOWN));
        token.faucet(alice, 10e6);

        assertEq(token.lastClaim(alice), START);
        assertEq(token.lastClaim(bob), START);
        assertEq(token.lastClaim(carol), START);
    }

    // ------------------------------------------------- third-party claim guard

    function test_RevertWhen_ThirdPartyClaim() public {
        vm.prank(bob);
        vm.expectRevert(GuardLinkContributionToken.ThirdPartyClaim.selector);
        token.faucet(alice, 10e6);
        assertEq(token.balanceOf(alice), 0);
        assertEq(token.totalSupply(), 0);
    }

    function test_ThirdPartyClaimCheckedBeforeAmount() public {
        // zero and over-max amounts for another recipient surface ThirdPartyClaim
        vm.prank(bob);
        vm.expectRevert(GuardLinkContributionToken.ThirdPartyClaim.selector);
        token.faucet(alice, 0);

        vm.prank(bob);
        vm.expectRevert(GuardLinkContributionToken.ThirdPartyClaim.selector);
        token.faucet(alice, MAX + 1);
    }

    function test_ThirdPartyCannotClaimForOrResetVictimCooldown() public {
        uint256[3] memory amounts = [uint256(1), 10e6, MAX];
        for (uint256 i = 0; i < amounts.length; i++) {
            vm.prank(bob);
            vm.expectRevert(GuardLinkContributionToken.ThirdPartyClaim.selector);
            token.faucet(alice, amounts[i]);
        }
        assertEq(token.lastClaim(alice), 0, "victim cooldown untouched");
        assertEq(token.balanceOf(alice), 0);
        assertEq(token.totalSupply(), 0);
    }

    function test_VictimCanClaimInFullAfterDustGriefAttempt() public {
        // dust griefing attempt (amount 1) by a third party
        vm.prank(bob);
        vm.expectRevert(GuardLinkContributionToken.ThirdPartyClaim.selector);
        token.faucet(alice, 1);

        // victim claims the full amount immediately
        vm.prank(alice);
        token.faucet(alice, MAX);
        assertEq(token.balanceOf(alice), MAX);
        assertEq(token.lastClaim(alice), START);
        assertEq(token.balanceOf(bob), 0);
    }

    function test_ThirdPartyCannotExtendVictimCooldown() public {
        _claim(alice, 10e6);
        skip(COOLDOWN - 1);

        // attempt to push the cooldown forward with dust right before it expires
        vm.prank(bob);
        vm.expectRevert(GuardLinkContributionToken.ThirdPartyClaim.selector);
        token.faucet(alice, 1);
        assertEq(token.lastClaim(alice), START);

        skip(1);
        _claim(alice, MAX);
        assertEq(token.balanceOf(alice), 10e6 + MAX);
    }

    function test_ThirdPartyRevertDoesNotAffectCallerCooldown() public {
        vm.prank(bob);
        vm.expectRevert(GuardLinkContributionToken.ThirdPartyClaim.selector);
        token.faucet(alice, 1e6);
        assertEq(token.lastClaim(bob), 0);
        _claim(bob, MAX);
        assertEq(token.balanceOf(bob), MAX);
    }

    function test_DifferentRecipientsIndependent() public {
        _claim(alice, 10e6);
        skip(COOLDOWN / 2);
        _claim(bob, 20e6);
        assertEq(token.lastClaim(alice), START);
        assertEq(token.lastClaim(bob), START + COOLDOWN / 2);

        skip(COOLDOWN / 2); // alice ready, bob not
        _claim(alice, 5e6);
        vm.expectRevert(
            abi.encodeWithSelector(GuardLinkContributionToken.CooldownActive.selector, START + COOLDOWN / 2 + COOLDOWN)
        );
        _claim(bob, 5e6);

        assertEq(token.balanceOf(alice), 15e6);
        assertEq(token.balanceOf(bob), 20e6);
        assertEq(token.totalSupply(), 35e6);
    }

    // ------------------------------------------------------ no privileged APIs

    function _claim(address who, uint256 amount) internal {
        vm.prank(who);
        token.faucet(who, amount);
    }

    function _callFails(bytes memory data) internal returns (bool ok) {
        (ok,) = address(token).call(data);
        return !ok;
    }

    function test_NoOwnerAdminOrMintFunctions() public {
        assertTrue(_callFails(abi.encodeWithSignature("owner()")));
        assertTrue(_callFails(abi.encodeWithSignature("transferOwnership(address)", alice)));
        assertTrue(_callFails(abi.encodeWithSignature("renounceOwnership()")));
        assertTrue(_callFails(abi.encodeWithSignature("mint(address,uint256)", alice, 1e6)));
        assertTrue(_callFails(abi.encodeWithSignature("burn(uint256)", 1)));
        assertTrue(_callFails(abi.encodeWithSignature("pause()")));
        assertTrue(_callFails(abi.encodeWithSignature("grantRole(bytes32,address)", bytes32(0), alice)));
        assertTrue(_callFails(abi.encodeWithSignature("hasRole(bytes32,address)", bytes32(0), alice)));
        assertEq(token.totalSupply(), 0);
    }

    function test_NoEthAccepted() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool ok,) = address(token).call{value: 1 ether}("");
        assertFalse(ok);
        assertEq(address(token).balance, 0);
    }

    // ------------------------------------------------------------ ERC20 basics

    function test_Transfer() public {
        _claim(alice, 60e6);
        vm.expectEmit(true, true, false, true, address(token));
        emit IERC20.Transfer(alice, bob, 25e6);
        vm.prank(alice);
        assertTrue(token.transfer(bob, 25e6));
        assertEq(token.balanceOf(alice), 35e6);
        assertEq(token.balanceOf(bob), 25e6);
        assertEq(token.totalSupply(), 60e6);
        // transfers don't touch faucet cooldown state
        assertEq(token.lastClaim(bob), 0);
    }

    function test_TransferRevertsOnInsufficientBalance() public {
        _claim(alice, 10e6);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, alice, 10e6, 10e6 + 1));
        token.transfer(bob, 10e6 + 1);
    }

    function test_ApproveAndTransferFrom() public {
        _claim(alice, 50e6);
        vm.expectEmit(true, true, false, true, address(token));
        emit IERC20.Approval(alice, bob, 30e6);
        vm.prank(alice);
        assertTrue(token.approve(bob, 30e6));
        assertEq(token.allowance(alice, bob), 30e6);

        vm.prank(bob);
        assertTrue(token.transferFrom(alice, carol, 20e6));
        assertEq(token.balanceOf(alice), 30e6);
        assertEq(token.balanceOf(carol), 20e6);
        assertEq(token.allowance(alice, bob), 10e6);
    }

    function test_TransferFromRevertsWithoutAllowance() public {
        _claim(alice, 50e6);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, bob, 0, 1));
        token.transferFrom(alice, carol, 1);
    }

    // -------------------------------------------------------------------- fuzz

    function testFuzz_ThirdPartyClaimAlwaysReverts(address to, address caller, uint256 amount) public {
        vm.assume(to != address(0));
        vm.assume(to != caller);

        vm.prank(caller);
        vm.expectRevert(GuardLinkContributionToken.ThirdPartyClaim.selector);
        token.faucet(to, amount);
        assertEq(token.lastClaim(to), 0);
        assertEq(token.totalSupply(), 0);
    }

    function testFuzz_ValidClaimMintsExactly(address to, uint256 amount) public {
        vm.assume(to != address(0));
        amount = bound(amount, 1, MAX);

        vm.prank(to);
        token.faucet(to, amount);

        assertEq(token.balanceOf(to), amount);
        assertEq(token.totalSupply(), amount);
        assertEq(token.lastClaim(to), block.timestamp);
    }

    function testFuzz_OverMaxReverts(uint256 amount) public {
        amount = bound(amount, MAX + 1, type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(GuardLinkContributionToken.ClaimAmountExceeded.selector, amount, MAX));
        _claim(alice, amount);
    }

    function testFuzz_CooldownBoundary(uint256 elapsed, uint256 a1, uint256 a2) public {
        elapsed = bound(elapsed, 0, 2 * COOLDOWN);
        a1 = bound(a1, 1, MAX);
        a2 = bound(a2, 1, MAX);

        _claim(alice, a1);
        skip(elapsed);

        if (elapsed < COOLDOWN) {
            vm.expectRevert(
                abi.encodeWithSelector(GuardLinkContributionToken.CooldownActive.selector, START + COOLDOWN)
            );
            _claim(alice, a2);
            assertEq(token.balanceOf(alice), a1);
        } else {
            _claim(alice, a2);
            assertEq(token.balanceOf(alice), a1 + a2);
        }
    }

    function testFuzz_TransferConservesSupply(uint256 minted, uint256 sent) public {
        minted = bound(minted, 1, MAX);
        sent = bound(sent, 0, minted);
        _claim(alice, minted);
        vm.prank(alice);
        token.transfer(bob, sent);
        assertEq(token.balanceOf(alice) + token.balanceOf(bob), minted);
        assertEq(token.totalSupply(), minted);
    }
}
