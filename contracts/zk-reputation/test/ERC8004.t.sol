// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ERC8004IdentityRegistry} from "../src/ERC8004IdentityRegistry.sol";
import {ERC8004ReputationRegistry} from "../src/ERC8004ReputationRegistry.sol";
import {ERC8004ValidationRegistry} from "../src/ERC8004ValidationRegistry.sol";
import {IERC8004Identity} from "../src/interfaces/IERC8004Identity.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract ERC8004Test is Test {
    ERC8004IdentityRegistry public identityImpl;
    ERC8004IdentityRegistry public identity;
    ERC8004ReputationRegistry public reputationImpl;
    ERC8004ReputationRegistry public reputation;
    ERC8004ValidationRegistry public validationImpl;
    ERC8004ValidationRegistry public validation;

    address public owner;
    address public alice;
    address public bob;
    address public validator;

    uint256 public alicePrivateKey;
    uint256 public bobPrivateKey;

    function setUp() public {
        owner = makeAddr("owner");
        alicePrivateKey = 0xa11ce;
        bobPrivateKey = 0xb0b;
        alice = vm.addr(alicePrivateKey);
        bob = vm.addr(bobPrivateKey);
        validator = makeAddr("validator");

        vm.startPrank(owner);

        // Deploy Identity Registry
        identityImpl = new ERC8004IdentityRegistry();
        ERC1967Proxy identityProxy = new ERC1967Proxy(
            address(identityImpl),
            abi.encodeWithSelector(ERC8004IdentityRegistry.initialize.selector, owner)
        );
        identity = ERC8004IdentityRegistry(address(identityProxy));

        // Deploy Reputation Registry
        reputationImpl = new ERC8004ReputationRegistry();
        ERC1967Proxy reputationProxy = new ERC1967Proxy(
            address(reputationImpl),
            abi.encodeWithSelector(ERC8004ReputationRegistry.initialize.selector, address(identity), owner)
        );
        reputation = ERC8004ReputationRegistry(address(reputationProxy));

        // Deploy Validation Registry
        validationImpl = new ERC8004ValidationRegistry();
        ERC1967Proxy validationProxy = new ERC1967Proxy(
            address(validationImpl),
            abi.encodeWithSelector(ERC8004ValidationRegistry.initialize.selector, address(identity), owner)
        );
        validation = ERC8004ValidationRegistry(address(validationProxy));

        // Add validator
        validation.addValidator(validator);

        vm.stopPrank();
    }

    // ============ Identity Registry Tests ============

    function test_IdentityRegisterMinimal() public {
        vm.prank(alice);
        uint256 agentId = identity.register();

        assertEq(identity.ownerOf(agentId), alice);
        assertEq(agentId, 0);
    }

    function test_IdentityRegisterWithURI() public {
        string memory uri = "https://kamiyo.ai/agent/1.json";

        vm.prank(alice);
        uint256 agentId = identity.register(uri);

        assertEq(identity.ownerOf(agentId), alice);
        assertEq(identity.tokenURI(agentId), uri);
    }

    function test_IdentityRegisterWithMetadata() public {
        string memory uri = "https://kamiyo.ai/agent/1.json";
        IERC8004Identity.MetadataEntry[] memory metadata = new IERC8004Identity.MetadataEntry[](2);
        metadata[0] = IERC8004Identity.MetadataEntry("name", bytes("TradingBot"));
        metadata[1] = IERC8004Identity.MetadataEntry("type", bytes("trading"));

        vm.prank(alice);
        uint256 agentId = identity.register(uri, metadata);

        assertEq(identity.ownerOf(agentId), alice);
        assertEq(string(identity.getMetadata(agentId, "name")), "TradingBot");
        assertEq(string(identity.getMetadata(agentId, "type")), "trading");
    }

    function test_IdentityGlobalId() public {
        vm.prank(alice);
        uint256 agentId = identity.register();

        string memory globalId = identity.getGlobalId(agentId);

        // Format: eip155:{chainId}:{registry}:{agentId}
        assertTrue(bytes(globalId).length > 0);
        // On foundry, chainId is 31337 by default
    }

    function test_IdentitySetAgentURI() public {
        vm.startPrank(alice);
        uint256 agentId = identity.register("https://old.uri");
        identity.setAgentURI(agentId, "https://new.uri");
        vm.stopPrank();

        assertEq(identity.tokenURI(agentId), "https://new.uri");
    }

    function test_IdentitySetMetadata() public {
        vm.startPrank(alice);
        uint256 agentId = identity.register();
        identity.setMetadata(agentId, "tier", bytes("gold"));
        vm.stopPrank();

        assertEq(string(identity.getMetadata(agentId, "tier")), "gold");
    }

    function test_IdentitySetAgentWallet() public {
        vm.prank(alice);
        uint256 agentId = identity.register();

        // Bob signs to authorize wallet assignment
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(abi.encode(
            identity.SET_WALLET_TYPEHASH(),
            agentId,
            bob,
            deadline
        ));
        bytes32 domainSeparator = _getDomainSeparator();
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(bobPrivateKey, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.prank(alice);
        identity.setAgentWallet(agentId, bob, deadline, signature);

        assertEq(identity.getAgentWallet(agentId), bob);
    }

    function test_IdentityGetAgentWalletDefault() public {
        vm.prank(alice);
        uint256 agentId = identity.register();

        // Without explicit wallet, returns owner
        assertEq(identity.getAgentWallet(agentId), alice);
    }

    function test_IdentityUnsetAgentWallet() public {
        vm.prank(alice);
        uint256 agentId = identity.register();

        // First set a wallet (using simplified setup for this test)
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(abi.encode(
            identity.SET_WALLET_TYPEHASH(),
            agentId,
            bob,
            deadline
        ));
        bytes32 domainSeparator = _getDomainSeparator();
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(bobPrivateKey, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.startPrank(alice);
        identity.setAgentWallet(agentId, bob, deadline, signature);
        assertEq(identity.getAgentWallet(agentId), bob);

        identity.unsetAgentWallet(agentId);
        assertEq(identity.getAgentWallet(agentId), alice); // Reverts to owner
        vm.stopPrank();
    }

    function test_IdentityCannotSetURIByNonOwner() public {
        vm.prank(alice);
        uint256 agentId = identity.register();

        vm.expectRevert(ERC8004IdentityRegistry.NotAgentOwner.selector);
        vm.prank(bob);
        identity.setAgentURI(agentId, "https://hacked.uri");
    }

    // ============ Reputation Registry Tests ============

    function test_ReputationGiveFeedback() public {
        // First register an agent
        vm.prank(alice);
        uint256 agentId = identity.register();

        // Bob gives feedback
        vm.prank(bob);
        reputation.giveFeedback(
            agentId,
            85, // value
            2,  // decimals (0.85)
            keccak256("quality"),
            keccak256("api"),
            keccak256("/v1/predict"),
            "ipfs://feedback123",
            keccak256("feedback content")
        );

        // Check feedback was recorded
        address[] memory clients = reputation.getClients(agentId);
        assertEq(clients.length, 1);
        assertEq(clients[0], bob);
    }

    function test_ReputationGetSummary() public {
        vm.prank(alice);
        uint256 agentId = identity.register();

        // Multiple feedback entries
        vm.prank(bob);
        reputation.giveFeedback(agentId, 80, 0, bytes32(0), bytes32(0), bytes32(0), "", bytes32(0));

        vm.prank(validator);
        reputation.giveFeedback(agentId, 90, 0, bytes32(0), bytes32(0), bytes32(0), "", bytes32(0));

        address[] memory clients = new address[](2);
        clients[0] = bob;
        clients[1] = validator;

        (uint64 count, int128 summaryValue, ) = reputation.getSummary(agentId, clients, bytes32(0), bytes32(0));

        assertEq(count, 2);
        assertEq(summaryValue, 170); // 80 + 90
    }

    function test_ReputationRevokeFeedback() public {
        vm.prank(alice);
        uint256 agentId = identity.register();

        vm.startPrank(bob);
        reputation.giveFeedback(agentId, 50, 0, bytes32(0), bytes32(0), bytes32(0), "", bytes32(0));
        reputation.revokeFeedback(agentId, 0);
        vm.stopPrank();

        (int128 value, , , , bool isRevoked) = reputation.readFeedback(agentId, bob, 0);
        assertEq(value, 50);
        assertTrue(isRevoked);
    }

    function test_ReputationSummaryExcludesRevoked() public {
        vm.prank(alice);
        uint256 agentId = identity.register();

        vm.startPrank(bob);
        reputation.giveFeedback(agentId, 80, 0, bytes32(0), bytes32(0), bytes32(0), "", bytes32(0));
        reputation.giveFeedback(agentId, 20, 0, bytes32(0), bytes32(0), bytes32(0), "", bytes32(0));
        reputation.revokeFeedback(agentId, 1); // Revoke the 20
        vm.stopPrank();

        address[] memory clients = new address[](1);
        clients[0] = bob;

        (uint64 count, int128 summaryValue, ) = reputation.getSummary(agentId, clients, bytes32(0), bytes32(0));

        assertEq(count, 1);
        assertEq(summaryValue, 80);
    }

    function test_ReputationAppendResponse() public {
        vm.prank(alice);
        uint256 agentId = identity.register();

        vm.prank(bob);
        reputation.giveFeedback(agentId, 50, 0, bytes32(0), bytes32(0), bytes32(0), "", bytes32(0));

        // Agent responds
        vm.prank(alice);
        reputation.appendResponse(
            agentId,
            bob,
            0,
            "ipfs://response123",
            keccak256("response content")
        );

        uint256 responseCount = reputation.getResponseCount(agentId, bob, 0);
        assertEq(responseCount, 1);
    }

    function test_ReputationTagFiltering() public {
        vm.prank(alice);
        uint256 agentId = identity.register();

        bytes32 qualityTag = keccak256("quality");
        bytes32 speedTag = keccak256("speed");

        vm.startPrank(bob);
        reputation.giveFeedback(agentId, 90, 0, qualityTag, bytes32(0), bytes32(0), "", bytes32(0));
        reputation.giveFeedback(agentId, 70, 0, speedTag, bytes32(0), bytes32(0), "", bytes32(0));
        vm.stopPrank();

        address[] memory clients = new address[](1);
        clients[0] = bob;

        // Filter by quality tag
        (uint64 count, int128 summaryValue, ) = reputation.getSummary(agentId, clients, qualityTag, bytes32(0));
        assertEq(count, 1);
        assertEq(summaryValue, 90);

        // Filter by speed tag
        (count, summaryValue, ) = reputation.getSummary(agentId, clients, speedTag, bytes32(0));
        assertEq(count, 1);
        assertEq(summaryValue, 70);
    }

    // ============ Validation Registry Tests ============

    function test_ValidationRequest() public {
        vm.prank(alice);
        uint256 agentId = identity.register();

        bytes32 requestHash = keccak256("request1");

        vm.prank(bob);
        validation.validationRequest(
            validator,
            agentId,
            "ipfs://request123",
            requestHash
        );

        bytes32[] memory requests = validation.getAgentValidations(agentId);
        assertEq(requests.length, 1);
        assertEq(requests[0], requestHash);
    }

    function test_ValidationResponse() public {
        vm.prank(alice);
        uint256 agentId = identity.register();

        bytes32 requestHash = keccak256("request1");

        vm.prank(bob);
        validation.validationRequest(validator, agentId, "", requestHash);

        vm.prank(validator);
        validation.validationResponse(
            requestHash,
            85, // response 0-100
            "ipfs://response123",
            keccak256("response"),
            keccak256("quality")
        );

        (
            address validatorAddr,
            uint256 returnedAgentId,
            uint8 response,
            ,
            bytes32 tag,
        ) = validation.getValidationStatus(requestHash);

        assertEq(validatorAddr, validator);
        assertEq(returnedAgentId, agentId);
        assertEq(response, 85);
        assertEq(tag, keccak256("quality"));
    }

    function test_ValidationSummary() public {
        vm.prank(alice);
        uint256 agentId = identity.register();

        // Create multiple validation requests/responses
        bytes32 request1 = keccak256("request1");
        bytes32 request2 = keccak256("request2");

        vm.startPrank(bob);
        validation.validationRequest(validator, agentId, "", request1);
        validation.validationRequest(validator, agentId, "", request2);
        vm.stopPrank();

        vm.startPrank(validator);
        validation.validationResponse(request1, 80, "", bytes32(0), bytes32(0));
        validation.validationResponse(request2, 90, "", bytes32(0), bytes32(0));
        vm.stopPrank();

        address[] memory validators = new address[](1);
        validators[0] = validator;

        (uint64 count, uint8 avgResponse) = validation.getSummary(agentId, validators, bytes32(0));

        assertEq(count, 2);
        assertEq(avgResponse, 85); // (80 + 90) / 2
    }

    function test_ValidationTierMapping() public {
        vm.prank(alice);
        uint256 agentId = identity.register();

        bytes32 requestHash = keccak256("tierRequest");

        vm.prank(bob);
        validation.validationRequest(validator, agentId, "", requestHash);

        // Validator submits using KAMIYO tier
        vm.prank(validator);
        validation.validationResponseFromTier(
            requestHash,
            3, // Gold tier
            "",
            bytes32(0)
        );

        (, , uint8 response, , bytes32 tag, ) = validation.getValidationStatus(requestHash);

        assertEq(response, 80); // Gold maps to 80
        assertEq(tag, keccak256("kamiyo_tier"));
    }

    function test_ValidationTierToResponse() public view {
        assertEq(validation.tierToResponse(0), 20);  // Unverified
        assertEq(validation.tierToResponse(1), 40);  // Bronze
        assertEq(validation.tierToResponse(2), 60);  // Silver
        assertEq(validation.tierToResponse(3), 80);  // Gold
        assertEq(validation.tierToResponse(4), 95);  // Platinum
        assertEq(validation.tierToResponse(5), 95);  // >= Platinum
    }

    function test_ValidationResponseToTier() public view {
        assertEq(validation.responseToTier(0), 0);   // 0-24 -> Unverified
        assertEq(validation.responseToTier(24), 0);
        assertEq(validation.responseToTier(25), 1);  // 25-49 -> Bronze
        assertEq(validation.responseToTier(49), 1);
        assertEq(validation.responseToTier(50), 2);  // 50-74 -> Silver
        assertEq(validation.responseToTier(74), 2);
        assertEq(validation.responseToTier(75), 3);  // 75-89 -> Gold
        assertEq(validation.responseToTier(89), 3);
        assertEq(validation.responseToTier(90), 4);  // 90-100 -> Platinum
        assertEq(validation.responseToTier(100), 4);
    }

    function test_ValidationCannotRespondTwice() public {
        vm.prank(alice);
        uint256 agentId = identity.register();

        bytes32 requestHash = keccak256("request1");

        vm.prank(bob);
        validation.validationRequest(validator, agentId, "", requestHash);

        vm.startPrank(validator);
        validation.validationResponse(requestHash, 80, "", bytes32(0), bytes32(0));

        vm.expectRevert(ERC8004ValidationRegistry.AlreadyResponded.selector);
        validation.validationResponse(requestHash, 90, "", bytes32(0), bytes32(0));
        vm.stopPrank();
    }

    function test_ValidationOnlyAssignedValidator() public {
        vm.prank(alice);
        uint256 agentId = identity.register();

        bytes32 requestHash = keccak256("request1");

        vm.prank(bob);
        validation.validationRequest(validator, agentId, "", requestHash);

        // Bob (not the assigned validator) tries to respond
        vm.expectRevert(ERC8004ValidationRegistry.NotValidator.selector);
        vm.prank(bob);
        validation.validationResponse(requestHash, 80, "", bytes32(0), bytes32(0));
    }

    function test_ValidationInvalidResponse() public {
        vm.prank(alice);
        uint256 agentId = identity.register();

        bytes32 requestHash = keccak256("request1");

        vm.prank(bob);
        validation.validationRequest(validator, agentId, "", requestHash);

        vm.expectRevert(ERC8004ValidationRegistry.InvalidResponse.selector);
        vm.prank(validator);
        validation.validationResponse(requestHash, 101, "", bytes32(0), bytes32(0)); // > 100
    }

    // ============ Admin Tests ============

    function test_IdentityPause() public {
        vm.prank(owner);
        identity.pause();

        vm.expectRevert();
        vm.prank(alice);
        identity.register();
    }

    function test_ReputationPause() public {
        vm.prank(alice);
        uint256 agentId = identity.register();

        vm.prank(owner);
        reputation.pause();

        vm.expectRevert();
        vm.prank(bob);
        reputation.giveFeedback(agentId, 80, 0, bytes32(0), bytes32(0), bytes32(0), "", bytes32(0));
    }

    function test_ValidationAddRemoveValidator() public {
        address newValidator = makeAddr("newValidator");

        vm.startPrank(owner);
        validation.addValidator(newValidator);
        assertTrue(validation.isValidator(newValidator));

        validation.removeValidator(newValidator);
        assertFalse(validation.isValidator(newValidator));
        vm.stopPrank();
    }

    // ============ Helpers ============

    function _getDomainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Kamiyo Agent Identity"),
                keccak256("1"),
                block.chainid,
                address(identity)
            )
        );
    }
}
