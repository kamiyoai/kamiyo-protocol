// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../AgentRegistry.sol";

contract AgentRegistryTest is Test {
    AgentRegistry public registry;

    address public admin = address(1);
    address public disputeResolver = address(2);
    address public agent1 = address(3);
    address public agent2 = address(4);
    address public vault = address(5);

    uint256 constant MIN_STAKE = 100e18;

    event AgentRegistered(address indexed agent, string name, uint256 stake);
    event AgentDeactivated(address indexed agent);
    event AgentReactivated(address indexed agent);
    event StakeAdded(address indexed agent, uint256 amount, uint256 newTotal);
    event WithdrawalRequested(address indexed agent, uint256 amount, uint64 availableAt);
    event StakeWithdrawn(address indexed agent, uint256 amount, uint256 remaining);

    function setUp() public {
        vm.prank(admin);
        registry = new AgentRegistry(disputeResolver);

        vm.prank(admin);
        registry.setVault(vault);

        vm.deal(agent1, 1000e18);
        vm.deal(agent2, 1000e18);
    }

    // ============ Registration Tests ============

    function test_register() public {
        vm.prank(agent1);
        vm.expectEmit(true, false, false, true);
        emit AgentRegistered(agent1, "TestAgent", MIN_STAKE);
        registry.register{value: MIN_STAKE}("TestAgent");

        assertTrue(registry.isRegistered(agent1));

        AgentRegistry.Agent memory agent = registry.getAgent(agent1);
        assertEq(agent.owner, agent1);
        assertEq(agent.name, "TestAgent");
        assertEq(agent.stake, MIN_STAKE);
        assertTrue(agent.active);
        assertEq(agent.copiers, 0);
    }

    function test_register_withExtraStake() public {
        uint256 stakeAmount = 500e18;

        vm.prank(agent1);
        registry.register{value: stakeAmount}("TestAgent");

        AgentRegistry.Agent memory agent = registry.getAgent(agent1);
        assertEq(agent.stake, stakeAmount);
    }

    function test_register_revert_alreadyRegistered() public {
        vm.prank(agent1);
        registry.register{value: MIN_STAKE}("TestAgent");

        vm.prank(agent1);
        vm.expectRevert(AgentRegistry.AlreadyRegistered.selector);
        registry.register{value: MIN_STAKE}("TestAgent2");
    }

    function test_register_revert_insufficientStake() public {
        vm.prank(agent1);
        vm.expectRevert(AgentRegistry.InsufficientStake.selector);
        registry.register{value: MIN_STAKE - 1}("TestAgent");
    }

    function test_register_revert_invalidName_tooShort() public {
        vm.prank(agent1);
        vm.expectRevert(AgentRegistry.InvalidName.selector);
        registry.register{value: MIN_STAKE}("AB");
    }

    function test_register_revert_invalidName_tooLong() public {
        vm.prank(agent1);
        vm.expectRevert(AgentRegistry.InvalidName.selector);
        registry.register{value: MIN_STAKE}("ThisNameIsWayTooLongForTheRegistry");
    }

    function test_register_revert_invalidName_invalidChars() public {
        vm.prank(agent1);
        vm.expectRevert(AgentRegistry.InvalidName.selector);
        registry.register{value: MIN_STAKE}("Test Agent");

        vm.prank(agent2);
        vm.expectRevert(AgentRegistry.InvalidName.selector);
        registry.register{value: MIN_STAKE}("Test@Agent");
    }

    // ============ Stake Management Tests ============

    function test_addStake() public {
        vm.prank(agent1);
        registry.register{value: MIN_STAKE}("TestAgent");

        uint256 additionalStake = 50e18;

        vm.prank(agent1);
        vm.expectEmit(true, false, false, true);
        emit StakeAdded(agent1, additionalStake, MIN_STAKE + additionalStake);
        registry.addStake{value: additionalStake}();

        AgentRegistry.Agent memory agent = registry.getAgent(agent1);
        assertEq(agent.stake, MIN_STAKE + additionalStake);
    }

    function test_addStake_revert_notRegistered() public {
        vm.prank(agent1);
        vm.expectRevert(AgentRegistry.NotRegistered.selector);
        registry.addStake{value: 50e18}();
    }

    function test_requestWithdrawal() public {
        vm.prank(agent1);
        registry.register{value: 200e18}("TestAgent");

        uint256 withdrawAmount = 50e18;

        vm.prank(agent1);
        registry.requestWithdrawal(withdrawAmount);

        (uint256 amount, uint256 requestTime) = (
            registry.withdrawalRequestAmount(agent1),
            registry.withdrawalRequestTime(agent1)
        );
        assertEq(amount, withdrawAmount);
        assertEq(requestTime, block.timestamp);
    }

    function test_executeWithdrawal() public {
        vm.prank(agent1);
        registry.register{value: 200e18}("TestAgent");

        uint256 withdrawAmount = 50e18;
        uint256 balanceBefore = agent1.balance;

        vm.prank(agent1);
        registry.requestWithdrawal(withdrawAmount);

        // Fast forward 7 days
        vm.warp(block.timestamp + 7 days + 1);

        vm.prank(agent1);
        registry.executeWithdrawal();

        assertEq(agent1.balance, balanceBefore + withdrawAmount);

        AgentRegistry.Agent memory agent = registry.getAgent(agent1);
        assertEq(agent.stake, 150e18);
    }

    function test_executeWithdrawal_revert_delayNotMet() public {
        vm.prank(agent1);
        registry.register{value: 200e18}("TestAgent");

        vm.prank(agent1);
        registry.requestWithdrawal(50e18);

        vm.warp(block.timestamp + 6 days);

        vm.prank(agent1);
        vm.expectRevert(AgentRegistry.WithdrawalDelayNotMet.selector);
        registry.executeWithdrawal();
    }

    function test_cancelWithdrawal() public {
        vm.prank(agent1);
        registry.register{value: 200e18}("TestAgent");

        vm.prank(agent1);
        registry.requestWithdrawal(50e18);

        vm.prank(agent1);
        registry.cancelWithdrawal();

        assertEq(registry.withdrawalRequestAmount(agent1), 0);
    }

    // ============ Activation Tests ============

    function test_deactivate() public {
        vm.prank(agent1);
        registry.register{value: MIN_STAKE}("TestAgent");

        vm.prank(agent1);
        vm.expectEmit(true, false, false, false);
        emit AgentDeactivated(agent1);
        registry.deactivate();

        AgentRegistry.Agent memory agent = registry.getAgent(agent1);
        assertFalse(agent.active);
    }

    function test_reactivate() public {
        vm.prank(agent1);
        registry.register{value: MIN_STAKE}("TestAgent");

        vm.prank(agent1);
        registry.deactivate();

        vm.prank(agent1);
        vm.expectEmit(true, false, false, false);
        emit AgentReactivated(agent1);
        registry.reactivate();

        AgentRegistry.Agent memory agent = registry.getAgent(agent1);
        assertTrue(agent.active);
    }

    // ============ Copier Management Tests ============

    function test_updateCopiers() public {
        vm.prank(agent1);
        registry.register{value: MIN_STAKE}("TestAgent");

        vm.prank(vault);
        registry.updateCopiers(agent1, true);

        AgentRegistry.Agent memory agent = registry.getAgent(agent1);
        assertEq(agent.copiers, 1);

        vm.prank(vault);
        registry.updateCopiers(agent1, false);

        agent = registry.getAgent(agent1);
        assertEq(agent.copiers, 0);
    }

    function test_updateCopiers_revert_notVaultOrAdmin() public {
        vm.prank(agent1);
        registry.register{value: MIN_STAKE}("TestAgent");

        vm.prank(agent2);
        vm.expectRevert(AgentRegistry.NotAuthorized.selector);
        registry.updateCopiers(agent1, true);
    }

    // ============ Slashing Tests ============

    function test_slash() public {
        vm.prank(agent1);
        registry.register{value: MIN_STAKE}("TestAgent");

        uint256 expectedSlash = MIN_STAKE * 10 / 100;
        uint256 resolverBalanceBefore = disputeResolver.balance;

        // Slash is now called by vault (via onlyVaultOrAdmin modifier)
        vm.prank(vault);
        uint256 slashAmount = registry.slash(agent1, "Test slash");

        assertEq(slashAmount, expectedSlash);
        // Slashed funds go to disputeResolver
        assertEq(disputeResolver.balance, resolverBalanceBefore + expectedSlash);

        AgentRegistry.Agent memory agent = registry.getAgent(agent1);
        assertEq(agent.stake, MIN_STAKE - expectedSlash);
    }

    // ============ View Functions Tests ============

    function test_getAgents() public {
        vm.prank(agent1);
        registry.register{value: MIN_STAKE}("Agent1");

        vm.prank(agent2);
        registry.register{value: MIN_STAKE}("Agent2");

        (address[] memory agents, uint256 total) = registry.getAgents(0, 10);
        assertEq(agents.length, 2);
        assertEq(total, 2);
        assertEq(agents[0], agent1);
        assertEq(agents[1], agent2);
    }

    function test_getSuccessRate() public {
        vm.prank(agent1);
        registry.register{value: MIN_STAKE}("TestAgent");

        // Record 10 trades, 7 successful
        for (uint i = 0; i < 7; i++) {
            vm.prank(vault);
            registry.recordTrade(agent1, 100, true);
        }
        for (uint i = 0; i < 3; i++) {
            vm.prank(vault);
            registry.recordTrade(agent1, -50, false);
        }

        uint256 rate = registry.getSuccessRate(agent1);
        assertEq(rate, 7000); // 70%
    }

    // ============ Admin Tests ============

    function test_transferAdmin() public {
        address newAdmin = address(10);

        vm.prank(admin);
        registry.transferAdmin(newAdmin);

        assertEq(registry.pendingAdmin(), newAdmin);

        vm.prank(newAdmin);
        registry.acceptAdmin();

        assertEq(registry.admin(), newAdmin);
        assertEq(registry.pendingAdmin(), address(0));
    }

    function test_pause() public {
        vm.prank(admin);
        registry.pause();

        vm.prank(agent1);
        vm.expectRevert();
        registry.register{value: MIN_STAKE}("TestAgent");
    }
}
