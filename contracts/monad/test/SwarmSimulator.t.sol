// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/SwarmSimulator.sol";

contract SwarmSimulatorTest is Test {
    SwarmSimulator sim;
    address admin = address(0x1);
    address user1 = address(0x2);
    address user2 = address(0x3);

    function setUp() public {
        sim = new SwarmSimulator(admin);
    }

    function test_InitializeSimulation() public {
        vm.prank(user1);
        bytes32 id = sim.initializeSimulation(keccak256("config"), 10);

        (bytes32 stateRoot, uint256 round, bool completed) = sim.getSimulationState(id);
        assertEq(stateRoot, bytes32(0));
        assertEq(round, 0);
        assertFalse(completed);
    }

    function test_InitializeSimulation_ZeroRounds() public {
        vm.prank(user1);
        vm.expectRevert(SwarmSimulator.BadRounds.selector);
        sim.initializeSimulation(keccak256("config"), 0);
    }

    function test_InitializeSimulation_TooManyRounds() public {
        vm.prank(user1);
        vm.expectRevert(SwarmSimulator.BadRounds.selector);
        sim.initializeSimulation(keccak256("config"), 1001);
    }

    function test_ExecuteRound() public {
        vm.prank(user1);
        bytes32 id = sim.initializeSimulation(keccak256("config"), 5);

        vm.prank(user1);
        bytes32 hash = sim.executeRound(id, "action1");

        (bytes32 stateRoot, uint256 round,) = sim.getSimulationState(id);
        assertEq(stateRoot, hash);
        assertEq(round, 1);
    }

    function test_ExecuteRound_NotInitiator() public {
        vm.prank(user1);
        bytes32 id = sim.initializeSimulation(keccak256("config"), 5);

        vm.prank(user2);
        vm.expectRevert(SwarmSimulator.NotInitiator.selector);
        sim.executeRound(id, "action1");
    }

    function test_ExecuteRound_NotFound() public {
        vm.prank(user1);
        vm.expectRevert(SwarmSimulator.NotFound.selector);
        sim.executeRound(bytes32(uint256(999)), "action1");
    }

    function test_ExecuteRound_AutoFinalize() public {
        vm.prank(user1);
        bytes32 id = sim.initializeSimulation(keccak256("config"), 2);

        vm.startPrank(user1);
        sim.executeRound(id, "action1");
        sim.executeRound(id, "action2");
        vm.stopPrank();

        (,, bool completed) = sim.getSimulationState(id);
        assertTrue(completed);
    }

    function test_ExecuteRound_AlreadyDone() public {
        vm.prank(user1);
        bytes32 id = sim.initializeSimulation(keccak256("config"), 1);

        vm.startPrank(user1);
        sim.executeRound(id, "action1");

        vm.expectRevert(SwarmSimulator.AlreadyDone.selector);
        sim.executeRound(id, "action2");
        vm.stopPrank();
    }

    function test_ExecuteRoundsBatch() public {
        vm.prank(user1);
        bytes32 id = sim.initializeSimulation(keccak256("config"), 5);

        bytes[] memory batch = new bytes[](3);
        batch[0] = "a1";
        batch[1] = "a2";
        batch[2] = "a3";

        vm.prank(user1);
        bytes32[] memory hashes = sim.executeRoundsBatch(id, batch);

        assertEq(hashes.length, 3);
        (,uint256 round,) = sim.getSimulationState(id);
        assertEq(round, 3);
    }

    function test_ExecuteRoundsBatch_NotInitiator() public {
        vm.prank(user1);
        bytes32 id = sim.initializeSimulation(keccak256("config"), 5);

        bytes[] memory batch = new bytes[](1);
        batch[0] = "a1";

        vm.prank(user2);
        vm.expectRevert(SwarmSimulator.NotInitiator.selector);
        sim.executeRoundsBatch(id, batch);
    }

    function test_FinalizeSimulation() public {
        vm.prank(user1);
        bytes32 id = sim.initializeSimulation(keccak256("config"), 2);

        vm.startPrank(user1);
        sim.executeRound(id, "a1");
        bytes memory res = sim.finalizeSimulation(id);
        vm.stopPrank();

        assertTrue(res.length > 0);
        (,, bool completed) = sim.getSimulationState(id);
        assertTrue(completed);
    }

    function test_FinalizeSimulation_NotInitiator() public {
        vm.prank(user1);
        bytes32 id = sim.initializeSimulation(keccak256("config"), 5);

        vm.prank(user2);
        vm.expectRevert(SwarmSimulator.NotInitiator.selector);
        sim.finalizeSimulation(id);
    }

    function test_GetResults_NotDone() public {
        vm.prank(user1);
        bytes32 id = sim.initializeSimulation(keccak256("config"), 5);

        vm.expectRevert(SwarmSimulator.NotDone.selector);
        sim.getResults(id);
    }

    function test_GetResults() public {
        vm.prank(user1);
        bytes32 id = sim.initializeSimulation(keccak256("config"), 1);

        vm.prank(user1);
        sim.executeRound(id, "a1");

        bytes memory res = sim.getResults(id);
        assertTrue(res.length > 0);
    }

    function test_SetConfig() public {
        vm.prank(admin);
        sim.setConfig(500, 50);

        assertEq(sim.maxRounds(), 500);
        assertEq(sim.maxConcurrent(), 50);
    }

    function test_SetConfig_NotAdmin() public {
        vm.prank(user1);
        vm.expectRevert(SwarmSimulator.NotAdmin.selector);
        sim.setConfig(500, 50);
    }

    function test_TooManyConcurrent() public {
        vm.prank(admin);
        sim.setConfig(1000, 2);

        vm.startPrank(user1);
        sim.initializeSimulation(keccak256("c1"), 10);
        sim.initializeSimulation(keccak256("c2"), 10);

        vm.expectRevert(SwarmSimulator.TooMany.selector);
        sim.initializeSimulation(keccak256("c3"), 10);
        vm.stopPrank();
    }

    function test_ActiveSimsDecrement() public {
        vm.prank(admin);
        sim.setConfig(1000, 2);

        vm.startPrank(user1);
        bytes32 id1 = sim.initializeSimulation(keccak256("c1"), 1);
        sim.initializeSimulation(keccak256("c2"), 10);

        assertEq(sim.activeSims(), 2);

        sim.executeRound(id1, "done");
        assertEq(sim.activeSims(), 1);
        vm.stopPrank();
    }
}
