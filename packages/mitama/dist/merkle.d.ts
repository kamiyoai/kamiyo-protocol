/**
 * Merkle tree for agent identity commitments.
 * Uses Poseidon hash for ZK circuit compatibility.
 */
export declare class MerkleTree {
    private depth;
    private leaves;
    private nodes;
    private zeroHashes;
    constructor(depth?: number);
    /**
     * Initialize the tree and compute zero hashes.
     * Must be called before other operations.
     */
    initialize(): Promise<void>;
    /**
     * Get the current root of the tree.
     */
    getRoot(): Promise<Uint8Array>;
    /**
     * Add a leaf (identity commitment) to the tree.
     * Returns the index of the added leaf.
     */
    addLeaf(commitment: Uint8Array): Promise<number>;
    /**
     * Generate a Merkle proof for a leaf at the given index.
     * Returns the proof path and indices (0 = left, 1 = right).
     */
    generateProof(index: number): Promise<{
        proof: Uint8Array[];
        pathIndices: number[];
    }>;
    /**
     * Verify a Merkle proof.
     */
    verifyProof(leaf: Uint8Array, proof: Uint8Array[], pathIndices: number[], root: Uint8Array): Promise<boolean>;
    /**
     * Get the number of leaves in the tree.
     */
    getLeafCount(): number;
    /**
     * Get a leaf at the given index.
     */
    getLeaf(index: number): Uint8Array | null;
    /**
     * Serialize the tree state for storage.
     */
    serialize(): string;
    /**
     * Deserialize tree state from storage.
     */
    static deserialize(data: string): Promise<MerkleTree>;
}
/**
 * Create and initialize a new Merkle tree.
 */
export declare function createMerkleTree(depth?: number): Promise<MerkleTree>;
//# sourceMappingURL=merkle.d.ts.map