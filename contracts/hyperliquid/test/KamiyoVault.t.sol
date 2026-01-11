// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AgentRegistry.sol";
import "../src/KamiyoVault.sol";

contract KamiyoVaultTest is Test {
    AgentRegistry public registry;
    KamiyoVault public vault;

    address public admin = address(1);
    address public disputeResolver = address(2);
    address public agent1 = address(3);
    address public user1 = address(4);
    address public user2 = address(5);

    uint256 constant MIN_STAKE = 100e18;
    uint256 constant MIN_DEPOSIT = 0.01 ether;
    uint64 constant MIN_LOCK_PERIOD = 1 days;

    event PositionOpened(
        uint256 indexed positionId,
        address indexed user,
        address indexed agent,
        uint256 deposit,
        int16 minReturnBps,
        uint64 lockPeriod
    );
    event PositionClosed(uint256 indexed positionId, uint256 returnAmount, int64 returnBps);
    event DisputeFiled(uint256 indexed disputeId, uint256 indexed positionId, address indexed user);
    event DisputeResolved(uint256 indexed disputeId, bool userWon, uint256 payout);

    function setUp() public {
        vm.startPrank(admin);
        registry = new AgentRegistry(disputeResolver);
        vault = new KamiyoVault(address(registry), disputeResolver);
        registry.setVault(address(vault));
        vm.stopPrank();

        // Setup agent
        vm.deal(agent1, 1000e18);
        vm.prank(agent1);
        registry.register{value: MIN_STAKE}("TestAgent");

        // Setup users
        vm.deal(user1, 1000e18);
        vm.deal(user2, 1000e18);
    }

    // ============ Open Position Tests ============

    function test_openPosition() public {
        uint256 deposit = 1e18;
        int16 minReturnBps = 500; // 5%
        uint64 lockPeriod = 7 days;

        vm.prank(user1);
        vm.expectEmit(true, true, true, true);
        emit PositionOpened(0, user1, agent1, deposit, minReturnBps, lockPeriod);
        uint256 positionId = vault.openPosition{value: deposit}(agent1, minReturnBps, lockPeriod);

        assertEq(positionId, 0);

        KamiyoVault.CopyPosition memory pos = vault.getPosition(0);
        assertEq(pos.user, user1);
        assertEq(pos.agent, agent1);
        assertEq(pos.deposit, deposit);
        assertEq(pos.currentValue, deposit);
        assertEq(pos.minReturnBps, minReturnBps);
        assertEq(pos.lockPeriod, lockPeriod);
        assertTrue(pos.active);
        assertFalse(pos.disputed);

        // Check agent copiers updated
        AgentRegistry.Agent memory agent = registry.getAgent(agent1);
        assertEq(agent.copiers, 1);
    }

    function test_openPosition_multipleUsers() public {
        vm.prank(user1);
        vault.openPosition{value: 1e18}(agent1, 500, 7 days);

        vm.prank(user2);
        vault.openPosition{value: 2e18}(agent1, 1000, 14 days);

        assertEq(vault.positionCount(), 2);

        AgentRegistry.Agent memory agent = registry.getAgent(agent1);
        assertEq(agent.copiers, 2);
    }

    function test_openPosition_revert_agentNotActive() public {
        vm.prank(agent1);
        registry.deactivate();

        vm.prank(user1);
        vm.expectRevert(KamiyoVault.AgentNotActive.selector);
        vault.openPosition{value: 1e18}(agent1, 500, 7 days);
    }

    function test_openPosition_revert_insufficientDeposit() public {
        vm.prank(user1);
        vm.expectRevert(KamiyoVault.InsufficientDeposit.selector);
        vault.openPosition{value: MIN_DEPOSIT - 1}(agent1, 500, 7 days);
    }

    function test_openPosition_revert_excessiveDeposit() public {
        vm.deal(user1, 2000e18);

        vm.prank(user1);
        vm.expectRevert(KamiyoVault.ExcessiveDeposit.selector);
        vault.openPosition{value: 1001e18}(agent1, 500, 7 days);
    }

    function test_openPosition_revert_invalidReturnBps() public {
        vm.prank(user1);
        vm.expectRevert(KamiyoVault.InvalidReturnBps.selector);
        vault.openPosition{value: 1e18}(agent1, -5001, 7 days);

        vm.prank(user1);
        vm.expectRevert(KamiyoVault.InvalidReturnBps.selector);
        vault.openPosition{value: 1e18}(agent1, 10001, 7 days);
    }

    function test_openPosition_revert_invalidLockPeriod() public {
        vm.prank(user1);
        vm.expectRevert(KamiyoVault.InvalidLockPeriod.selector);
        vault.openPosition{value: 1e18}(agent1, 500, MIN_LOCK_PERIOD - 1);

        vm.prank(user1);
        vm.expectRevert(KamiyoVault.InvalidLockPeriod.selector);
        vault.openPosition{value: 1e18}(agent1, 500, 366 days);
    }

    // ============ Close Position Tests ============

    function test_closePosition() public {
        vm.prank(user1);
        uint256 positionId = vault.openPosition{value: 1e18}(agent1, 500, 7 days);

        // Fast forward past lock period
        vm.warp(block.timestamp + 7 days + 1);

        uint256 balanceBefore = user1.balance;

        vm.prank(user1);
        vault.closePosition(positionId);

        // User gets deposit back (no profit, no fee)
        assertEq(user1.balance, balanceBefore + 1e18);

        KamiyoVault.CopyPosition memory pos = vault.getPosition(positionId);
        assertFalse(pos.active);
        assertGt(pos.endTime, 0);

        // Agent copiers decremented
        AgentRegistry.Agent memory agent = registry.getAgent(agent1);
        assertEq(agent.copiers, 0);
    }

    function test_closePosition_revert_positionLocked() public {
        vm.prank(user1);
        uint256 positionId = vault.openPosition{value: 1e18}(agent1, 500, 7 days);

        // Only 3 days passed
        vm.warp(block.timestamp + 3 days);

        vm.prank(user1);
        vm.expectRevert(KamiyoVault.PositionLocked.selector);
        vault.closePosition(positionId);
    }

    function test_closePosition_revert_notAuthorized() public {
        vm.prank(user1);
        uint256 positionId = vault.openPosition{value: 1e18}(agent1, 500, 7 days);

        vm.warp(block.timestamp + 7 days + 1);

        vm.prank(user2);
        vm.expectRevert(KamiyoVault.NotAuthorized.selector);
        vault.closePosition(positionId);
    }

    function test_closePosition_revert_positionNotActive() public {
        vm.prank(user1);
        uint256 positionId = vault.openPosition{value: 1e18}(agent1, 500, 7 days);

        vm.warp(block.timestamp + 7 days + 1);

        vm.prank(user1);
        vault.closePosition(positionId);

        // Try to close again
        vm.prank(user1);
        vm.expectRevert(KamiyoVault.PositionNotActive.selector);
        vault.closePosition(positionId);
    }

    // ============ Dispute Tests ============

    function test_fileDispute() public {
        vm.prank(user1);
        uint256 positionId = vault.openPosition{value: 1e18}(agent1, 500, 7 days);

        uint256 disputeFee = vault.disputeFee();

        vm.prank(user1);
        vm.expectEmit(true, true, true, false);
        emit DisputeFiled(0, positionId, user1);
        uint256 disputeId = vault.fileDispute{value: disputeFee}(positionId);

        assertEq(disputeId, 0);

        KamiyoVault.DisputeInfo memory dispute = vault.getDispute(disputeId);
        assertEq(dispute.positionId, positionId);
        assertEq(dispute.user, user1);
        assertEq(dispute.agent, agent1);
        assertFalse(dispute.resolved);

        KamiyoVault.CopyPosition memory pos = vault.getPosition(positionId);
        assertTrue(pos.disputed);
    }

    function test_fileDispute_revert_alreadyDisputed() public {
        vm.prank(user1);
        uint256 positionId = vault.openPosition{value: 1e18}(agent1, 500, 7 days);

        uint256 disputeFee = vault.disputeFee();

        vm.prank(user1);
        vault.fileDispute{value: disputeFee}(positionId);

        vm.prank(user1);
        vm.expectRevert(KamiyoVault.AlreadyDisputed.selector);
        vault.fileDispute{value: disputeFee}(positionId);
    }

    function test_fileDispute_revert_insufficientFee() public {
        vm.prank(user1);
        uint256 positionId = vault.openPosition{value: 1e18}(agent1, 500, 7 days);

        uint256 disputeFee = vault.disputeFee();

        vm.prank(user1);
        vm.expectRevert(KamiyoVault.InsufficientFee.selector);
        vault.fileDispute{value: disputeFee - 1}(positionId);
    }

    // ============ Resolve Dispute Tests ============

    function test_resolveDispute_userWins() public {
        vm.prank(user1);
        uint256 positionId = vault.openPosition{value: 1e18}(agent1, 500, 7 days);

        uint256 disputeFee = vault.disputeFee();
        vm.prank(user1);
        uint256 disputeId = vault.fileDispute{value: disputeFee}(positionId);

        uint256 userBalanceBefore = user1.balance;

        vm.prank(disputeResolver);
        vault.resolveDispute(disputeId, true);

        // User gets full deposit back
        assertEq(user1.balance, userBalanceBefore + 1e18);

        KamiyoVault.DisputeInfo memory dispute = vault.getDispute(disputeId);
        assertTrue(dispute.resolved);
        assertTrue(dispute.userWon);

        // Agent should be slashed
        AgentRegistry.Agent memory agent = registry.getAgent(agent1);
        assertLt(agent.stake, MIN_STAKE);
    }

    function test_resolveDispute_agentWins() public {
        vm.prank(user1);
        uint256 positionId = vault.openPosition{value: 1e18}(agent1, 500, 7 days);

        uint256 disputeFee = vault.disputeFee();
        vm.prank(user1);
        uint256 disputeId = vault.fileDispute{value: disputeFee}(positionId);

        uint256 userBalanceBefore = user1.balance;

        vm.prank(disputeResolver);
        vault.resolveDispute(disputeId, false);

        // User gets current value back
        assertEq(user1.balance, userBalanceBefore + 1e18);

        KamiyoVault.DisputeInfo memory dispute = vault.getDispute(disputeId);
        assertTrue(dispute.resolved);
        assertFalse(dispute.userWon);

        // Agent not slashed
        AgentRegistry.Agent memory agent = registry.getAgent(agent1);
        assertEq(agent.stake, MIN_STAKE);
    }

    // ============ Position Value Update Tests ============

    function test_updatePositionValue() public {
        vm.prank(user1);
        uint256 positionId = vault.openPosition{value: 1e18}(agent1, 500, 7 days);

        vm.prank(disputeResolver);
        vault.updatePositionValue(positionId, 1.1e18);

        KamiyoVault.CopyPosition memory pos = vault.getPosition(positionId);
        assertEq(pos.currentValue, 1.1e18);
    }

    function test_batchUpdatePositionValues() public {
        vm.prank(user1);
        vault.openPosition{value: 1e18}(agent1, 500, 7 days);

        vm.prank(user2);
        vault.openPosition{value: 2e18}(agent1, 500, 7 days);

        uint256[] memory ids = new uint256[](2);
        ids[0] = 0;
        ids[1] = 1;

        uint256[] memory values = new uint256[](2);
        values[0] = 1.1e18;
        values[1] = 2.2e18;

        vm.prank(disputeResolver);
        vault.batchUpdatePositionValues(ids, values);

        assertEq(vault.getPosition(0).currentValue, 1.1e18);
        assertEq(vault.getPosition(1).currentValue, 2.2e18);
    }

    // ============ View Function Tests ============

    function test_getUserPositions() public {
        vm.prank(user1);
        vault.openPosition{value: 1e18}(agent1, 500, 7 days);

        vm.prank(user1);
        vault.openPosition{value: 2e18}(agent1, 1000, 14 days);

        uint256[] memory positions = vault.getUserPositions(user1);
        assertEq(positions.length, 2);
        assertEq(positions[0], 0);
        assertEq(positions[1], 1);
    }

    function test_getUserActivePositions() public {
        vm.prank(user1);
        vault.openPosition{value: 1e18}(agent1, 500, 7 days);

        vm.prank(user1);
        vault.openPosition{value: 2e18}(agent1, 1000, 14 days);

        // Close first position
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(user1);
        vault.closePosition(0);

        (KamiyoVault.CopyPosition[] memory positions, uint256[] memory ids) =
            vault.getUserActivePositions(user1);

        assertEq(positions.length, 1);
        assertEq(ids[0], 1);
        assertEq(positions[0].deposit, 2e18);
    }

    function test_canClosePosition() public {
        vm.prank(user1);
        uint256 positionId = vault.openPosition{value: 1e18}(agent1, 500, 7 days);

        (bool canClose, string memory reason) = vault.canClosePosition(positionId);
        assertFalse(canClose);
        assertEq(reason, "Lock period not ended");

        vm.warp(block.timestamp + 7 days + 1);

        (canClose, reason) = vault.canClosePosition(positionId);
        assertTrue(canClose);
        assertEq(reason, "");
    }

    function test_getVaultStats() public {
        vm.prank(user1);
        vault.openPosition{value: 1e18}(agent1, 500, 7 days);

        vm.prank(user2);
        vault.openPosition{value: 2e18}(agent1, 500, 7 days);

        (uint256 positionCount, uint256 disputeCount, uint256 totalDeposits, uint256 totalFees) =
            (vault.positionCount(), vault.disputeCount(), vault.totalDeposits(), vault.totalFees());

        assertEq(positionCount, 2);
        assertEq(disputeCount, 0);
        assertEq(totalDeposits, 3e18);
        assertEq(totalFees, 0);
    }

    // ============ Admin Tests ============

    function test_emergencyWithdraw() public {
        vm.prank(user1);
        uint256 positionId = vault.openPosition{value: 1e18}(agent1, 500, 7 days);

        // Fast forward 30 days past lock period
        vm.warp(block.timestamp + 37 days + 1);

        uint256 balanceBefore = user1.balance;

        vm.prank(admin);
        vault.emergencyWithdraw(positionId);

        assertEq(user1.balance, balanceBefore + 1e18);
    }

    function test_emergencyWithdraw_revert_tooEarly() public {
        vm.prank(user1);
        uint256 positionId = vault.openPosition{value: 1e18}(agent1, 500, 7 days);

        // Only 20 days past lock period
        vm.warp(block.timestamp + 27 days);

        vm.prank(admin);
        vm.expectRevert(KamiyoVault.PositionLocked.selector);
        vault.emergencyWithdraw(positionId);
    }

    function test_pause() public {
        vm.prank(admin);
        vault.pause();

        vm.prank(user1);
        vm.expectRevert();
        vault.openPosition{value: 1e18}(agent1, 500, 7 days);
    }
}
