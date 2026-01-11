// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library PDAEmulation {
    bytes32 constant AGENT_SEED = keccak256("agent");
    bytes32 constant ESCROW_SEED = keccak256("escrow");
    bytes32 constant REPUTATION_SEED = keccak256("reputation");

    function deriveAddress(bytes32 seed, address owner, address factory) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(seed, owner, factory)))));
    }

    function deriveAgentAddress(address owner, address factory) internal pure returns (address) {
        return deriveAddress(AGENT_SEED, owner, factory);
    }

    function deriveEscrowAddress(address agent, bytes32 txId, address factory) internal pure returns (address) {
        return deriveAddress(keccak256(abi.encodePacked(ESCROW_SEED, txId)), agent, factory);
    }

    function deriveReputationAddress(address entity, address factory) internal pure returns (address) {
        return deriveAddress(REPUTATION_SEED, entity, factory);
    }

    function computeSalt(bytes32 seed, address owner) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(seed, owner));
    }
}
