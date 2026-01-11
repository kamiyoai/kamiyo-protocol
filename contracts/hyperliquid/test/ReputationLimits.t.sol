// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../AgentRegistry.sol";
import "../ReputationLimits.sol";

contract ReputationLimitsTest is Test {
    AgentRegistry public registry;
    ReputationLimits public limits;

    address public admin = address(1);
    address public disputeResolver = address(2);
    address public agent1 = address(3);
    address public agent2 = address(4);

    uint256 constant MIN_STAKE = 100e18;

    event TierVerified(address indexed agent, uint8 tier, uint256 maxCopyLimit);
    event TierConfigured(uint8 indexed tier, uint256 threshold, uint256 maxCopyLimit, uint256 maxCopiers);

    function setUp() public {
        vm.startPrank(admin);
        registry = new AgentRegistry(disputeResolver);
        limits = new ReputationLimits(address(registry), admin);
        vm.stopPrank();

        vm.deal(agent1, 1000e18);
        vm.deal(agent2, 1000e18);

        vm.prank(agent1);
        registry.register{value: MIN_STAKE}("Agent1");

        vm.prank(agent2);
        registry.register{value: MIN_STAKE}("Agent2");
    }

    // ============ Tier Configuration Tests ============

    function test_defaultTiers() public view {
        assertEq(limits.tierCount(), 5);

        ReputationLimits.Tier memory tier0 = limits.getTier(0);
        assertEq(tier0.threshold, 0);
        assertEq(tier0.maxCopyLimit, 100 ether);
        assertEq(tier0.maxCopiers, 5);

        ReputationLimits.Tier memory tier1 = limits.getTier(1);
        assertEq(tier1.threshold, 25);
        assertEq(tier1.maxCopyLimit, 500 ether);
        assertEq(tier1.maxCopiers, 20);

        ReputationLimits.Tier memory tier4 = limits.getTier(4);
        assertEq(tier4.threshold, 90);
        assertEq(tier4.maxCopyLimit, type(uint256).max);
        assertEq(tier4.maxCopiers, type(uint256).max);
    }

    function test_configureTier() public {
        vm.prank(admin);
        vm.expectEmit(true, false, false, true);
        emit TierConfigured(1, 30, 600 ether, 25);
        limits.configureTier(1, 30, 600 ether, 25);

        ReputationLimits.Tier memory tier = limits.getTier(1);
        assertEq(tier.threshold, 30);
        assertEq(tier.maxCopyLimit, 600 ether);
        assertEq(tier.maxCopiers, 25);
    }

    function test_configureTier_revert_notAdmin() public {
        vm.prank(agent1);
        vm.expectRevert(ReputationLimits.NotAdmin.selector);
        limits.configureTier(1, 30, 600 ether, 25);
    }

    function test_configureTier_revert_invalidTier() public {
        vm.prank(admin);
        vm.expectRevert(ReputationLimits.InvalidTier.selector);
        limits.configureTier(10, 30, 600 ether, 25);
    }

    // ============ Copy Limits Tests ============

    function test_getCopyLimits_defaultTier() public view {
        (uint256 maxCopyLimit, uint256 maxCopiers) = limits.getCopyLimits(agent1);
        assertEq(maxCopyLimit, 100 ether);
        assertEq(maxCopiers, 5);
    }

    function test_canAcceptDeposit_allowed() public view {
        (bool allowed, string memory reason) = limits.canAcceptDeposit(
            agent1,
            50 ether,  // currentAUM
            2,         // currentCopiers
            25 ether   // newDeposit
        );
        assertTrue(allowed);
        assertEq(reason, "");
    }

    function test_canAcceptDeposit_exceedsCopyLimit() public view {
        (bool allowed, string memory reason) = limits.canAcceptDeposit(
            agent1,
            80 ether,  // currentAUM
            2,         // currentCopiers
            25 ether   // newDeposit -> total 105, exceeds 100
        );
        assertFalse(allowed);
        assertEq(reason, "Exceeds copy limit for tier");
    }

    function test_canAcceptDeposit_exceedsCopierLimit() public view {
        (bool allowed, string memory reason) = limits.canAcceptDeposit(
            agent1,
            50 ether,  // currentAUM
            5,         // currentCopiers -> already at max
            10 ether   // newDeposit
        );
        assertFalse(allowed);
        assertEq(reason, "Exceeds copier limit for tier");
    }

    // ============ Agent Tier Info Tests ============

    function test_getAgentTierInfo_default() public view {
        (uint8 tier, uint64 verifiedAt, ReputationLimits.Tier memory tierInfo) =
            limits.getAgentTierInfo(agent1);

        assertEq(tier, 0);
        assertEq(verifiedAt, 0);
        assertEq(tierInfo.threshold, 0);
        assertEq(tierInfo.maxCopyLimit, 100 ether);
    }

    // ============ Pause Tests ============

    function test_pause() public {
        vm.prank(admin);
        limits.setPaused(true);

        assertTrue(limits.paused());
    }

    function test_unpause() public {
        vm.prank(admin);
        limits.setPaused(true);

        vm.prank(admin);
        limits.setPaused(false);

        assertFalse(limits.paused());
    }

    // ============ Admin Tests ============

    function test_setAdmin() public {
        address newAdmin = address(10);

        vm.prank(admin);
        limits.setAdmin(newAdmin);

        assertEq(limits.admin(), newAdmin);
    }

    function test_setAdmin_revert_notAdmin() public {
        vm.prank(agent1);
        vm.expectRevert(ReputationLimits.NotAdmin.selector);
        limits.setAdmin(address(10));
    }

    // ============ Verification Key Tests ============

    function test_setVerificationKey() public {
        uint256[2] memory alpha = [uint256(1), uint256(2)];
        uint256[2][2] memory beta = [[uint256(3), uint256(4)], [uint256(5), uint256(6)]];
        uint256[2][2] memory gamma = [[uint256(7), uint256(8)], [uint256(9), uint256(10)]];
        uint256[2][2] memory delta = [[uint256(11), uint256(12)], [uint256(13), uint256(14)]];
        uint256[2][] memory ic = new uint256[2][](2);
        ic[0] = [uint256(15), uint256(16)];
        ic[1] = [uint256(17), uint256(18)];

        vm.prank(admin);
        limits.setVerificationKey(alpha, beta, gamma, delta, ic);

        (uint256 a0, uint256 a1) = (limits.vkAlpha(0), limits.vkAlpha(1));
        assertEq(a0, 1);
        assertEq(a1, 2);
    }

    // ============ Prove Reputation Tests ============

    function test_proveReputation_revert_notRegistered() public {
        address unregistered = address(100);

        uint256[2] memory proofA;
        uint256[2][2] memory proofB;
        uint256[2] memory proofC;
        uint256[] memory pubInputs = new uint256[](2);

        vm.prank(unregistered);
        vm.expectRevert(ReputationLimits.NotRegistered.selector);
        limits.proveReputation(1, bytes32(0), proofA, proofB, proofC, pubInputs);
    }

    function test_proveReputation_revert_invalidTier() public {
        uint256[2] memory proofA;
        uint256[2][2] memory proofB;
        uint256[2] memory proofC;
        uint256[] memory pubInputs = new uint256[](2);

        vm.prank(agent1);
        vm.expectRevert(ReputationLimits.InvalidTier.selector);
        limits.proveReputation(0, bytes32(0), proofA, proofB, proofC, pubInputs);

        vm.prank(agent1);
        vm.expectRevert(ReputationLimits.InvalidTier.selector);
        limits.proveReputation(10, bytes32(0), proofA, proofB, proofC, pubInputs);
    }

    function test_proveReputation_revert_paused() public {
        vm.prank(admin);
        limits.setPaused(true);

        uint256[2] memory proofA;
        uint256[2][2] memory proofB;
        uint256[2] memory proofC;
        uint256[] memory pubInputs = new uint256[](2);

        vm.prank(agent1);
        vm.expectRevert(ReputationLimits.IsPaused.selector);
        limits.proveReputation(1, bytes32(0), proofA, proofB, proofC, pubInputs);
    }
}
