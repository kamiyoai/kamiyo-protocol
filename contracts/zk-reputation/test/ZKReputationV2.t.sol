// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/Groth16Verifier.sol";
import "../src/ZKReputationV2.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract ZKReputationV2Test is Test {
    ZKReputationV2 public implementation;
    ZKReputationV2 public reputation;
    Groth16Verifier public verifier;

    address public owner = address(1);
    address public agent1 = address(2);
    address public agent2 = address(3);

    uint256 constant COMMITMENT_1 = 12345;
    uint256 constant COMMITMENT_2 = 67890;

    function setUp() public {
        verifier = new Groth16Verifier();
        implementation = new ZKReputationV2();

        bytes memory initData = abi.encodeWithSelector(
            ZKReputationV2.initialize.selector,
            address(verifier),
            owner
        );

        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);
        reputation = ZKReputationV2(address(proxy));
    }

    function testInitialize() public view {
        assertEq(address(reputation.verifier()), address(verifier));
        assertEq(reputation.owner(), owner);
        assertEq(reputation.decayPeriod(), 0);
    }

    function testRegister() public {
        vm.prank(agent1);
        reputation.register(COMMITMENT_1);

        assertTrue(reputation.isRegistered(agent1));
        assertEq(reputation.getAgentCommitment(agent1), COMMITMENT_1);
        assertTrue(reputation.commitmentUsed(COMMITMENT_1));
    }

    function testCannotRegisterZeroCommitment() public {
        vm.prank(agent1);
        vm.expectRevert(ZKReputationV2.ZeroCommitment.selector);
        reputation.register(0);
    }

    function testCannotRegisterDuplicateCommitment() public {
        vm.prank(agent1);
        reputation.register(COMMITMENT_1);

        vm.prank(agent2);
        vm.expectRevert(ZKReputationV2.CommitmentAlreadyUsed.selector);
        reputation.register(COMMITMENT_1);
    }

    function testCannotRegisterTwice() public {
        vm.prank(agent1);
        reputation.register(COMMITMENT_1);

        vm.prank(agent1);
        vm.expectRevert(ZKReputationV2.AgentAlreadyRegistered.selector);
        reputation.register(COMMITMENT_2);
    }

    function testUnregister() public {
        vm.startPrank(agent1);
        reputation.register(COMMITMENT_1);

        assertTrue(reputation.isRegistered(agent1));
        assertTrue(reputation.commitmentUsed(COMMITMENT_1));

        reputation.unregister();

        assertFalse(reputation.isRegistered(agent1));
        assertFalse(reputation.commitmentUsed(COMMITMENT_1));
        vm.stopPrank();
    }

    function testUnregisterFreesCommitment() public {
        vm.prank(agent1);
        reputation.register(COMMITMENT_1);

        vm.prank(agent1);
        reputation.unregister();

        vm.prank(agent2);
        reputation.register(COMMITMENT_1);
        assertTrue(reputation.isRegistered(agent2));
    }

    function testCannotUnregisterIfNotRegistered() public {
        vm.prank(agent1);
        vm.expectRevert(ZKReputationV2.AgentNotRegistered.selector);
        reputation.unregister();
    }

    function testPause() public {
        vm.prank(owner);
        reputation.pause();

        vm.prank(agent1);
        vm.expectRevert();
        reputation.register(COMMITMENT_1);
    }

    function testUnpause() public {
        vm.prank(owner);
        reputation.pause();

        vm.prank(owner);
        reputation.unpause();

        vm.prank(agent1);
        reputation.register(COMMITMENT_1);
        assertTrue(reputation.isRegistered(agent1));
    }

    function testOnlyOwnerCanPause() public {
        vm.prank(agent1);
        vm.expectRevert();
        reputation.pause();
    }

    function testSetDecayPeriod() public {
        vm.prank(owner);
        reputation.setDecayPeriod(1000);
        assertEq(reputation.decayPeriod(), 1000);
    }

    function testOnlyOwnerCanSetDecayPeriod() public {
        vm.prank(agent1);
        vm.expectRevert();
        reputation.setDecayPeriod(1000);
    }

    function testSetVerifier() public {
        Groth16Verifier newVerifier = new Groth16Verifier();

        vm.prank(owner);
        reputation.setVerifier(address(newVerifier));

        assertEq(address(reputation.verifier()), address(newVerifier));
    }

    function testCannotSetZeroVerifier() public {
        vm.prank(owner);
        vm.expectRevert(ZKReputationV2.ZeroAddress.selector);
        reputation.setVerifier(address(0));
    }

    function testThresholdToTier() public {
        vm.prank(agent1);
        reputation.register(COMMITMENT_1);
        assertEq(uint256(reputation.getAgentTier(agent1)), uint256(ZKReputationV2.Tier.Unverified));
    }

    function testGetAgentTierWithDecayNoDecay() public {
        vm.prank(agent1);
        reputation.register(COMMITMENT_1);

        (ZKReputationV2.Tier tier, uint256 blocksUntilDecay) = reputation.getAgentTierWithDecay(agent1);
        assertEq(uint256(tier), uint256(ZKReputationV2.Tier.Unverified));
        assertEq(blocksUntilDecay, type(uint256).max);
    }
}
