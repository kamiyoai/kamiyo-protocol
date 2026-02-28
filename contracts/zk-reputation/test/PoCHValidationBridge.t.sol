// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ERC8004IdentityRegistry} from "../src/ERC8004IdentityRegistry.sol";
import {ERC8004ValidationRegistry} from "../src/ERC8004ValidationRegistry.sol";
import {Groth16Verifier} from "../src/Groth16Verifier.sol";
import {PoCHValidationBridge} from "../src/PoCHValidationBridge.sol";

contract PoCHValidationBridgeTest is Test {
    uint256 private constant BN254_SCALAR_FIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    address internal owner;
    address internal alice;

    ERC8004IdentityRegistry internal identityImpl;
    ERC8004IdentityRegistry internal identity;
    ERC8004ValidationRegistry internal validationImpl;
    ERC8004ValidationRegistry internal validation;
    Groth16Verifier internal verifier;
    PoCHValidationBridge internal bridgeImpl;
    PoCHValidationBridge internal bridge;

    function setUp() public {
        owner = makeAddr("owner");
        alice = makeAddr("alice");

        vm.startPrank(owner);

        identityImpl = new ERC8004IdentityRegistry();
        identity = ERC8004IdentityRegistry(
            address(
                new ERC1967Proxy(
                    address(identityImpl),
                    abi.encodeWithSelector(ERC8004IdentityRegistry.initialize.selector, owner)
                )
            )
        );

        validationImpl = new ERC8004ValidationRegistry();
        validation = ERC8004ValidationRegistry(
            address(
                new ERC1967Proxy(
                    address(validationImpl),
                    abi.encodeWithSelector(
                        ERC8004ValidationRegistry.initialize.selector,
                        address(identity),
                        owner
                    )
                )
            )
        );

        verifier = new Groth16Verifier();
        bridgeImpl = new PoCHValidationBridge();
        bridge = PoCHValidationBridge(
            address(
                new ERC1967Proxy(
                    address(bridgeImpl),
                    abi.encodeWithSelector(
                        PoCHValidationBridge.initialize.selector,
                        address(validation),
                        address(identity),
                        address(verifier),
                        owner
                    )
                )
            )
        );

        vm.stopPrank();
    }

    function testRequestPoCHValidationStoresPendingRecord() public {
        vm.prank(alice);
        uint256 agentId = identity.register();

        bytes32 requestHash = keccak256("poch-request-1");
        vm.prank(alice);
        bytes32 returned = bridge.requestPoCHValidation(agentId, "ipfs://poch/request/1", requestHash);
        assertEq(returned, requestHash);

        (
            uint256 recordAgentId,
            ,
            ,
            ,
            ,
            ,
            uint64 updatedAt,
            PoCHValidationBridge.PoCHStatus status
        ) = bridge.pochByRequest(requestHash);

        assertEq(recordAgentId, agentId);
        assertEq(uint256(status), uint256(PoCHValidationBridge.PoCHStatus.Pending));
        assertGt(updatedAt, 0);

        (address validatorAddress, uint256 validationAgentId, uint8 response, , , ) = validation
            .getValidationStatus(requestHash);
        assertEq(validatorAddress, address(bridge));
        assertEq(validationAgentId, agentId);
        assertEq(response, 0);
    }

    function testFinalizePoCHSuccessUpdatesValidationAndNullifier() public {
        vm.prank(alice);
        uint256 agentId = identity.register();

        bytes32 requestHash = keccak256("poch-request-2");
        vm.prank(alice);
        bridge.requestPoCHValidation(agentId, "ipfs://poch/request/2", requestHash);

        bytes32 scoreBundleCommitment = keccak256("score-bundle");
        bytes32 policyIdHash = keccak256("v1");
        bytes32 identityNullifier = keccak256("nullifier-1");
        bytes32 oracleRoundIdHash = keccak256("oracle-round-1");

        uint256 compressedSignal = uint256(
            keccak256(abi.encodePacked(policyIdHash, requestHash, identityNullifier))
        ) % BN254_SCALAR_FIELD;

        uint256[2] memory pubSignals = [uint256(scoreBundleCommitment), compressedSignal];
        uint256[2] memory pA;
        uint256[2][2] memory pB;
        uint256[2] memory pC;

        vm.mockCall(
            address(verifier),
            abi.encodeWithSelector(Groth16Verifier.verifyProof.selector),
            abi.encode(true)
        );

        vm.prank(owner);
        bridge.finalizePoCH(
            requestHash,
            85,
            pA,
            pB,
            pC,
            pubSignals,
            scoreBundleCommitment,
            policyIdHash,
            requestHash,
            identityNullifier,
            oracleRoundIdHash
        );

        (
            uint256 recordAgentId,
            bytes32 storedCommitment,
            bytes32 storedPolicyIdHash,
            bytes32 storedChallengeIdHash,
            bytes32 storedIdentityNullifier,
            bytes32 storedOracleRoundIdHash,
            uint64 updatedAt,
            PoCHValidationBridge.PoCHStatus status
        ) = bridge.pochByRequest(requestHash);

        assertEq(recordAgentId, agentId);
        assertEq(storedCommitment, scoreBundleCommitment);
        assertEq(storedPolicyIdHash, policyIdHash);
        assertEq(storedChallengeIdHash, requestHash);
        assertEq(storedIdentityNullifier, identityNullifier);
        assertEq(storedOracleRoundIdHash, oracleRoundIdHash);
        assertEq(uint256(status), uint256(PoCHValidationBridge.PoCHStatus.Verified));
        assertGt(updatedAt, 0);

        bytes32 nullifierKey = keccak256(abi.encodePacked(block.chainid, identityNullifier));
        assertTrue(bridge.usedNullifier(nullifierKey));

        (, , uint8 response, bytes32 responseHash, bytes32 tag, ) = validation.getValidationStatus(requestHash);
        assertEq(response, 85);
        assertEq(responseHash, keccak256(abi.encodePacked(scoreBundleCommitment, oracleRoundIdHash)));
        assertEq(tag, bridge.POCH_VERIFIED_TAG());
    }

    function testFinalizePoCHRejectsChallengeHashMismatch() public {
        vm.prank(alice);
        uint256 agentId = identity.register();

        bytes32 requestHash = keccak256("poch-request-3");
        vm.prank(alice);
        bridge.requestPoCHValidation(agentId, "ipfs://poch/request/3", requestHash);

        bytes32 scoreBundleCommitment = keccak256("score-bundle-3");
        bytes32 policyIdHash = keccak256("v1");
        bytes32 challengeIdHash = keccak256("different-challenge");
        bytes32 identityNullifier = keccak256("nullifier-3");
        bytes32 oracleRoundIdHash = keccak256("oracle-round-3");

        uint256 compressedSignal = uint256(
            keccak256(abi.encodePacked(policyIdHash, challengeIdHash, identityNullifier))
        ) % BN254_SCALAR_FIELD;

        uint256[2] memory pubSignals = [uint256(scoreBundleCommitment), compressedSignal];
        uint256[2] memory pA;
        uint256[2][2] memory pB;
        uint256[2] memory pC;

        vm.mockCall(
            address(verifier),
            abi.encodeWithSelector(Groth16Verifier.verifyProof.selector),
            abi.encode(true)
        );

        vm.prank(owner);
        vm.expectRevert(PoCHValidationBridge.ChallengeIdMismatch.selector);
        bridge.finalizePoCH(
            requestHash,
            70,
            pA,
            pB,
            pC,
            pubSignals,
            scoreBundleCommitment,
            policyIdHash,
            challengeIdHash,
            identityNullifier,
            oracleRoundIdHash
        );
    }

    function testFinalizePoCHRejectsNullifierReplay() public {
        vm.prank(alice);
        uint256 agentId = identity.register();

        bytes32 identityNullifier = keccak256("shared-nullifier");
        bytes32 policyIdHash = keccak256("v1");
        bytes32 oracleRoundIdHash = keccak256("oracle-round");
        uint256[2] memory pA;
        uint256[2][2] memory pB;
        uint256[2] memory pC;

        vm.mockCall(
            address(verifier),
            abi.encodeWithSelector(Groth16Verifier.verifyProof.selector),
            abi.encode(true)
        );

        bytes32 requestHash1 = keccak256("poch-request-4a");
        vm.prank(alice);
        bridge.requestPoCHValidation(agentId, "ipfs://poch/request/4a", requestHash1);
        bytes32 commitment1 = keccak256("score-bundle-4a");
        uint256 compressedSignal1 = uint256(
            keccak256(abi.encodePacked(policyIdHash, requestHash1, identityNullifier))
        ) % BN254_SCALAR_FIELD;
        uint256[2] memory pubSignals1 = [uint256(commitment1), compressedSignal1];

        vm.prank(owner);
        bridge.finalizePoCH(
            requestHash1,
            80,
            pA,
            pB,
            pC,
            pubSignals1,
            commitment1,
            policyIdHash,
            requestHash1,
            identityNullifier,
            oracleRoundIdHash
        );

        bytes32 requestHash2 = keccak256("poch-request-4b");
        vm.prank(alice);
        bridge.requestPoCHValidation(agentId, "ipfs://poch/request/4b", requestHash2);
        bytes32 commitment2 = keccak256("score-bundle-4b");
        uint256 compressedSignal2 = uint256(
            keccak256(abi.encodePacked(policyIdHash, requestHash2, identityNullifier))
        ) % BN254_SCALAR_FIELD;
        uint256[2] memory pubSignals2 = [uint256(commitment2), compressedSignal2];

        vm.prank(owner);
        vm.expectRevert(PoCHValidationBridge.NullifierAlreadyUsed.selector);
        bridge.finalizePoCH(
            requestHash2,
            80,
            pA,
            pB,
            pC,
            pubSignals2,
            commitment2,
            policyIdHash,
            requestHash2,
            identityNullifier,
            oracleRoundIdHash
        );
    }
}
