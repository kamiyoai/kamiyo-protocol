// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AgentProxy.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract AgentProxyTest is Test {
    AgentProxy impl;
    AgentProxy proxy;
    address owner = address(0x1);
    address other = address(0x2);

    function setUp() public {
        impl = new AgentProxy();

        bytes memory initData = abi.encodeCall(
            AgentProxy.initialize,
            (owner, "TestAgent", AgentProxy.AgentType.Trading)
        );

        ERC1967Proxy p = new ERC1967Proxy(address(impl), initData);
        proxy = AgentProxy(address(p));
    }

    function test_Initialize() public {
        assertEq(proxy.owner(), owner);
        assertEq(proxy.name(), "TestAgent");
        assertEq(uint8(proxy.agentType()), uint8(AgentProxy.AgentType.Trading));
        assertEq(proxy.reputation(), 500);
        assertTrue(proxy.isActive());
        assertEq(proxy.totalEscrows(), 0);
    }

    function test_Initialize_EmptyName() public {
        AgentProxy newImpl = new AgentProxy();
        bytes memory initData = abi.encodeCall(
            AgentProxy.initialize,
            (owner, "", AgentProxy.AgentType.Trading)
        );

        vm.expectRevert(AgentProxy.InvalidName.selector);
        new ERC1967Proxy(address(newImpl), initData);
    }

    function test_Initialize_NameTooLong() public {
        AgentProxy newImpl = new AgentProxy();
        bytes memory initData = abi.encodeCall(
            AgentProxy.initialize,
            (owner, "ThisNameIsWayTooLongForAnAgentXXX", AgentProxy.AgentType.Trading)
        );

        vm.expectRevert(AgentProxy.InvalidName.selector);
        new ERC1967Proxy(address(newImpl), initData);
    }

    function test_UpdateReputation() public {
        vm.prank(owner);
        proxy.updateReputation(800);

        assertEq(proxy.reputation(), 800);
    }

    function test_UpdateReputation_Max() public {
        vm.prank(owner);
        proxy.updateReputation(1000);

        assertEq(proxy.reputation(), 1000);
    }

    function test_UpdateReputation_OverMax() public {
        vm.prank(owner);
        vm.expectRevert(AgentProxy.InvalidReputation.selector);
        proxy.updateReputation(1001);
    }

    function test_UpdateReputation_NotOwner() public {
        vm.prank(other);
        vm.expectRevert();
        proxy.updateReputation(800);
    }

    function test_UpdateStake() public {
        vm.prank(owner);
        proxy.updateStake(1000);

        assertEq(proxy.stakeAmount(), 1000);
    }

    function test_UpdateStake_NotOwner() public {
        vm.prank(other);
        vm.expectRevert();
        proxy.updateStake(1000);
    }

    function test_SetActive() public {
        vm.prank(owner);
        proxy.setActive(false);

        assertFalse(proxy.isActive());

        vm.prank(owner);
        proxy.setActive(true);

        assertTrue(proxy.isActive());
    }

    function test_SetActive_NotOwner() public {
        vm.prank(other);
        vm.expectRevert();
        proxy.setActive(false);
    }

    function test_RecordEscrow() public {
        vm.startPrank(owner);
        proxy.recordEscrow(true, false);
        proxy.recordEscrow(true, false);
        proxy.recordEscrow(false, true);
        vm.stopPrank();

        assertEq(proxy.totalEscrows(), 3);
        assertEq(proxy.successfulEscrows(), 2);
        assertEq(proxy.disputedEscrows(), 1);
    }

    function test_RecordEscrow_NotOwner() public {
        vm.prank(other);
        vm.expectRevert();
        proxy.recordEscrow(true, false);
    }

    function test_SuccessRate_NoEscrows() public {
        assertEq(proxy.successRate(), 10000);
    }

    function test_SuccessRate() public {
        vm.startPrank(owner);
        proxy.recordEscrow(true, false);
        proxy.recordEscrow(true, false);
        proxy.recordEscrow(false, false);
        proxy.recordEscrow(false, false);
        vm.stopPrank();

        assertEq(proxy.successRate(), 5000); // 50%
    }

    function test_DisputeRate_NoEscrows() public {
        assertEq(proxy.disputeRate(), 0);
    }

    function test_DisputeRate() public {
        vm.startPrank(owner);
        proxy.recordEscrow(true, false);
        proxy.recordEscrow(false, true);
        proxy.recordEscrow(false, true);
        proxy.recordEscrow(false, false);
        vm.stopPrank();

        assertEq(proxy.disputeRate(), 5000); // 50%
    }

    function test_GetState() public {
        vm.startPrank(owner);
        proxy.updateReputation(750);
        proxy.updateStake(100);
        proxy.recordEscrow(true, false);
        vm.stopPrank();

        (
            address o,
            string memory n,
            AgentProxy.AgentType t,
            uint64 rep,
            uint64 stake,
            bool active,
            ,
            ,
            uint64 total,
            uint64 success,
            uint64 disputed
        ) = proxy.getState();

        assertEq(o, owner);
        assertEq(n, "TestAgent");
        assertEq(uint8(t), uint8(AgentProxy.AgentType.Trading));
        assertEq(rep, 750);
        assertEq(stake, 100);
        assertTrue(active);
        assertEq(total, 1);
        assertEq(success, 1);
        assertEq(disputed, 0);
    }

    function test_LastActiveUpdates() public {
        uint256 t1 = proxy.lastActive();

        vm.warp(block.timestamp + 100);
        vm.prank(owner);
        proxy.updateReputation(600);

        uint256 t2 = proxy.lastActive();
        assertTrue(t2 > t1);
    }

    function test_CannotInitializeTwice() public {
        vm.expectRevert();
        proxy.initialize(other, "NewName", AgentProxy.AgentType.Service);
    }

    function test_ImplementationCannotBeInitialized() public {
        vm.expectRevert();
        impl.initialize(owner, "Test", AgentProxy.AgentType.Trading);
    }

    function test_AgentTypes() public {
        AgentProxy.AgentType[4] memory types = [
            AgentProxy.AgentType.Trading,
            AgentProxy.AgentType.Service,
            AgentProxy.AgentType.Oracle,
            AgentProxy.AgentType.Custom
        ];

        for (uint i = 0; i < types.length; i++) {
            AgentProxy newImpl = new AgentProxy();
            bytes memory initData = abi.encodeCall(
                AgentProxy.initialize,
                (owner, "Agent", types[i])
            );
            ERC1967Proxy p = new ERC1967Proxy(address(newImpl), initData);
            AgentProxy agent = AgentProxy(address(p));
            assertEq(uint8(agent.agentType()), uint8(types[i]));
        }
    }
}
