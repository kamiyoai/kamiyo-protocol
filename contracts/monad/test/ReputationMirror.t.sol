// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../ReputationMirror.sol";

contract ReputationMirrorTest is Test {
    ReputationMirror mirror;
    address admin = address(0x1);
    address user1 = address(0x2);

    function setUp() public {
        mirror = new ReputationMirror(admin);
    }

    function test_Constructor() public {
        assertEq(mirror.admin(), admin);
        assertFalse(mirror.paused());
    }

    function test_SetAdmin() public {
        address newAdmin = address(0x99);

        vm.prank(admin);
        mirror.setAdmin(newAdmin);

        assertEq(mirror.admin(), newAdmin);
    }

    function test_SetAdmin_NotAdmin() public {
        vm.prank(user1);
        vm.expectRevert(ReputationMirror.NotAdmin.selector);
        mirror.setAdmin(user1);
    }

    function test_SetPaused() public {
        vm.prank(admin);
        mirror.setPaused(true);
        assertTrue(mirror.paused());

        vm.prank(admin);
        mirror.setPaused(false);
        assertFalse(mirror.paused());
    }

    function test_SetPaused_NotAdmin() public {
        vm.prank(user1);
        vm.expectRevert(ReputationMirror.NotAdmin.selector);
        mirror.setPaused(true);
    }

    function test_SetVerificationKey() public {
        uint256[2] memory alpha = [uint256(1), uint256(2)];
        uint256[2][2] memory beta = [[uint256(3), uint256(4)], [uint256(5), uint256(6)]];
        uint256[2][2] memory gamma = [[uint256(7), uint256(8)], [uint256(9), uint256(10)]];
        uint256[2][2] memory delta = [[uint256(11), uint256(12)], [uint256(13), uint256(14)]];
        uint256[2][] memory ic = new uint256[2][](2);
        ic[0] = [uint256(15), uint256(16)];
        ic[1] = [uint256(17), uint256(18)];

        vm.prank(admin);
        mirror.setVerificationKey(alpha, beta, gamma, delta, ic);

        assertEq(mirror.vkAlpha(0), 1);
        assertEq(mirror.vkAlpha(1), 2);
    }

    function test_SetVerificationKey_NotAdmin() public {
        uint256[2] memory alpha = [uint256(1), uint256(2)];
        uint256[2][2] memory beta = [[uint256(3), uint256(4)], [uint256(5), uint256(6)]];
        uint256[2][2] memory gamma = [[uint256(7), uint256(8)], [uint256(9), uint256(10)]];
        uint256[2][2] memory delta = [[uint256(11), uint256(12)], [uint256(13), uint256(14)]];
        uint256[2][] memory ic = new uint256[2][](1);
        ic[0] = [uint256(15), uint256(16)];

        vm.prank(user1);
        vm.expectRevert(ReputationMirror.NotAdmin.selector);
        mirror.setVerificationKey(alpha, beta, gamma, delta, ic);
    }

    function test_HasAttestation_False() public {
        assertFalse(mirror.hasAttestation(keccak256("test")));
    }

    function test_ReputationExists_False() public {
        assertFalse(mirror.reputationExists(keccak256("test")));
    }

    function test_GetAttestation_NotFound() public {
        vm.expectRevert(ReputationMirror.NotFound.selector);
        mirror.getAttestation(keccak256("test"));
    }

    function test_GetReputation_NotFound() public {
        vm.expectRevert(ReputationMirror.NotFound.selector);
        mirror.getReputation(keccak256("test"));
    }

    function test_SubmitAttestation_Paused() public {
        vm.prank(admin);
        mirror.setPaused(true);

        IKamiyoBridge.ReputationAttestation memory att = IKamiyoBridge.ReputationAttestation({
            entityHash: keccak256("test"),
            reputationScore: 100,
            totalTransactions: 50,
            disputesWon: 5,
            disputesLost: 2,
            timestamp: block.timestamp
        });

        IKamiyoBridge.Groth16Proof memory proof = IKamiyoBridge.Groth16Proof({
            a: [uint256(0), uint256(0)],
            b: [[uint256(0), uint256(0)], [uint256(0), uint256(0)]],
            c: [uint256(0), uint256(0)]
        });

        uint256[] memory inputs = new uint256[](0);

        vm.expectRevert(ReputationMirror.IsPaused.selector);
        mirror.submitAttestation(att, proof, inputs);
    }

    function test_VerifyProof_BadInputs() public {
        uint256[2] memory alpha = [uint256(1), uint256(2)];
        uint256[2][2] memory beta = [[uint256(3), uint256(4)], [uint256(5), uint256(6)]];
        uint256[2][2] memory gamma = [[uint256(7), uint256(8)], [uint256(9), uint256(10)]];
        uint256[2][2] memory delta = [[uint256(11), uint256(12)], [uint256(13), uint256(14)]];
        uint256[2][] memory ic = new uint256[2][](2);
        ic[0] = [uint256(15), uint256(16)];
        ic[1] = [uint256(17), uint256(18)];

        vm.prank(admin);
        mirror.setVerificationKey(alpha, beta, gamma, delta, ic);

        IKamiyoBridge.Groth16Proof memory proof = IKamiyoBridge.Groth16Proof({
            a: [uint256(0), uint256(0)],
            b: [[uint256(0), uint256(0)], [uint256(0), uint256(0)]],
            c: [uint256(0), uint256(0)]
        });

        uint256[] memory inputs = new uint256[](3);
        inputs[0] = 1;
        inputs[1] = 2;
        inputs[2] = 3;

        vm.expectRevert(ReputationMirror.BadInputs.selector);
        mirror.verifyProof(proof, inputs);
    }
}
