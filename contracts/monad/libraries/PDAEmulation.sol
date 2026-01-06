// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PDAEmulation
 * @notice Deterministic address derivation mimicking Solana PDA behavior.
 * @dev Uses CREATE2-style derivation for predictable proxy addresses.
 */
library PDAEmulation {
    bytes32 public constant AGENT_SEED = keccak256("agent");
    bytes32 public constant ESCROW_SEED = keccak256("escrow");
    bytes32 public constant REPUTATION_SEED = keccak256("reputation");

    /**
     * @notice Derive deterministic address from seed and owner.
     * @param seed The seed bytes (equivalent to Solana PDA seeds).
     * @param owner The owner address.
     * @param factory The factory contract address.
     * @return The derived address.
     */
    function deriveAddress(
        bytes32 seed,
        address owner,
        address factory
    ) internal pure returns (address) {
        bytes32 hash = keccak256(abi.encodePacked(seed, owner, factory));
        return address(uint160(uint256(hash)));
    }

    /**
     * @notice Derive agent proxy address.
     * @dev Equivalent to Solana: seeds = [b"agent", owner.key()]
     */
    function deriveAgentAddress(
        address owner,
        address factory
    ) internal pure returns (address) {
        return deriveAddress(AGENT_SEED, owner, factory);
    }

    /**
     * @notice Derive escrow proxy address.
     * @dev Equivalent to Solana: seeds = [b"escrow", agent.key(), tx_id]
     */
    function deriveEscrowAddress(
        address agent,
        bytes32 transactionId,
        address factory
    ) internal pure returns (address) {
        bytes32 combinedSeed = keccak256(
            abi.encodePacked(ESCROW_SEED, transactionId)
        );
        return deriveAddress(combinedSeed, agent, factory);
    }

    /**
     * @notice Derive reputation proxy address.
     * @dev Equivalent to Solana: seeds = [b"reputation", entity.key()]
     */
    function deriveReputationAddress(
        address entity,
        address factory
    ) internal pure returns (address) {
        return deriveAddress(REPUTATION_SEED, entity, factory);
    }

    /**
     * @notice Compute CREATE2 salt for proxy deployment.
     */
    function computeSalt(
        bytes32 seed,
        address owner
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(seed, owner));
    }
}
