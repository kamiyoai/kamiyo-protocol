// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/Groth16Verifier.sol";
import "../src/ZKReputation.sol";

contract ZKReputationTest is Test {
    Groth16Verifier public verifier;
    ZKReputation public reputation;

    address alice = address(0x1);
    address bob = address(0x2);

    // Test commitment (Poseidon hash of score=85, secret)
    uint256 constant TEST_COMMITMENT = 0x19115f3196b9cf1968a9acca111af3e8fa5fb7d0a1b2c3d4e5f6a7b8c9d0e1f2;

    function setUp() public {
        verifier = new Groth16Verifier();
        reputation = new ZKReputation(address(verifier));
    }

    function testRegister() public {
        vm.prank(alice);
        reputation.register(TEST_COMMITMENT);

        assertTrue(reputation.isRegistered(alice));
        assertEq(reputation.getAgentCommitment(alice), TEST_COMMITMENT);
        assertEq(uint256(reputation.getAgentTier(alice)), uint256(ZKReputation.Tier.Unverified));
    }

    function testCannotRegisterTwice() public {
        vm.prank(alice);
        reputation.register(TEST_COMMITMENT);

        vm.prank(alice);
        vm.expectRevert(ZKReputation.AgentAlreadyRegistered.selector);
        reputation.register(TEST_COMMITMENT);
    }

    function testCannotVerifyUnregistered() public {
        uint256[2] memory pA;
        uint256[2][2] memory pB;
        uint256[2] memory pC;

        vm.prank(alice);
        vm.expectRevert(ZKReputation.AgentNotRegistered.selector);
        reputation.verifyTier(pA, pB, pC, 75);
    }

    function testThresholdToTier() public view {
        assertEq(reputation.tierToThreshold(ZKReputation.Tier.Bronze), 25);
        assertEq(reputation.tierToThreshold(ZKReputation.Tier.Silver), 50);
        assertEq(reputation.tierToThreshold(ZKReputation.Tier.Gold), 75);
        assertEq(reputation.tierToThreshold(ZKReputation.Tier.Platinum), 90);
        assertEq(reputation.tierToThreshold(ZKReputation.Tier.Unverified), 0);
    }

    function testAgentStruct() public {
        vm.prank(alice);
        reputation.register(TEST_COMMITMENT);

        (uint256 commitment, ZKReputation.Tier tier, uint256 lastBlock, bool registered) = reputation.agents(alice);

        assertEq(commitment, TEST_COMMITMENT);
        assertEq(uint256(tier), uint256(ZKReputation.Tier.Unverified));
        assertEq(lastBlock, 0);
        assertTrue(registered);
    }
}
