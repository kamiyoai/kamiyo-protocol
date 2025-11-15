/**
 * Merkle Tree Generation Script for KAMIYO Airdrop
 *
 * This script generates a merkle tree from user allocations (points system data)
 * and creates proofs for each eligible wallet.
 *
 * Usage:
 *   ts-node generate-merkle-tree.ts <input_csv> <output_json>
 *
 * Input CSV format:
 *   wallet_address,points,allocation_kamiyo
 *   7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU,500,10000
 *   5Ghq4q5XLB4JUFy5YvGGaF5Vz8ZQjX8fJYy7TLZ8dZ8m,250,5000
 */

import { PublicKey } from '@solana/web3.js';
import { keccak_256 } from 'js-sha3';
import * as fs from 'fs';
import * as path from 'path';

interface Allocation {
    address: string;
    points: number;
    amount: number; // In KAMIYO tokens (not lamports)
}

interface LeafData {
    address: string;
    amount: number; // In lamports
    amountKamiyo: number; // In KAMIYO for display
    hash: string;
}

interface ProofData {
    address: string;
    amount: string; // String to preserve precision
    amountKamiyo: number;
    proof: string[];
}

interface MerkleTreeOutput {
    merkleRoot: string;
    totalAllocations: number;
    totalTokens: string; // In lamports
    totalTokensKamiyo: number;
    treeHeight: number;
    leaves: LeafData[];
    proofs: ProofData[];
    generatedAt: string;
}

class MerkleTree {
    private leaves: LeafData[] = [];
    private tree: string[][] = [];

    constructor(allocations: Allocation[]) {
        // Create leaf nodes
        this.leaves = allocations.map(alloc => {
            const amountLamports = BigInt(alloc.amount) * BigInt(1_000_000_000); // Convert to lamports
            const leaf = this.hashLeaf(alloc.address, amountLamports);

            return {
                address: alloc.address,
                amount: Number(amountLamports),
                amountKamiyo: alloc.amount,
                hash: leaf,
            };
        });

        // Sort leaves for deterministic ordering
        this.leaves.sort((a, b) => a.hash.localeCompare(b.hash));

        // Build tree bottom-up
        this.buildTree();
    }

    /**
     * Hash a leaf node (wallet address + amount)
     */
    private hashLeaf(address: string, amount: bigint): string {
        try {
            // Validate address
            const pubkey = new PublicKey(address);

            // Create buffer: [pubkey_bytes (32) || amount_le_bytes (8)]
            const buffer = Buffer.alloc(40);
            pubkey.toBuffer().copy(buffer, 0);

            // Write amount as little-endian 64-bit
            const amountBuffer = Buffer.alloc(8);
            amountBuffer.writeBigUInt64LE(amount);
            amountBuffer.copy(buffer, 32);

            // Hash with keccak256
            const hash = keccak_256(buffer);
            return hash;
        } catch (err) {
            throw new Error(`Invalid wallet address: ${address}`);
        }
    }

    /**
     * Hash two nodes together
     */
    private hashPair(left: string, right: string): string {
        // Sort for deterministic ordering
        const [first, second] = left <= right ? [left, right] : [right, left];

        const combined = Buffer.from(first + second, 'hex');
        return keccak_256(combined);
    }

    /**
     * Build merkle tree from leaves
     */
    private buildTree(): void {
        let currentLevel = this.leaves.map(leaf => leaf.hash);
        this.tree.push([...currentLevel]);

        while (currentLevel.length > 1) {
            const nextLevel: string[] = [];

            for (let i = 0; i < currentLevel.length; i += 2) {
                const left = currentLevel[i];
                const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;

                const parent = this.hashPair(left, right);
                nextLevel.push(parent);
            }

            this.tree.push(nextLevel);
            currentLevel = nextLevel;
        }
    }

    /**
     * Get merkle root
     */
    public getRoot(): string {
        return this.tree[this.tree.length - 1][0];
    }

    /**
     * Get proof for a specific wallet
     */
    public getProof(address: string): string[] {
        // Find leaf index
        const leafIndex = this.leaves.findIndex(leaf => leaf.address === address);
        if (leafIndex === -1) {
            throw new Error(`Wallet ${address} not found in tree`);
        }

        const proof: string[] = [];
        let currentIndex = leafIndex;

        // Traverse up the tree
        for (let level = 0; level < this.tree.length - 1; level++) {
            const levelNodes = this.tree[level];
            const isRightNode = currentIndex % 2 === 1;
            const siblingIndex = isRightNode ? currentIndex - 1 : currentIndex + 1;

            if (siblingIndex < levelNodes.length) {
                proof.push(levelNodes[siblingIndex]);
            }

            currentIndex = Math.floor(currentIndex / 2);
        }

        return proof;
    }

    /**
     * Get all proofs
     */
    public getAllProofs(): ProofData[] {
        return this.leaves.map(leaf => ({
            address: leaf.address,
            amount: leaf.amount.toString(),
            amountKamiyo: leaf.amountKamiyo,
            proof: this.getProof(leaf.address),
        }));
    }

    /**
     * Get tree height
     */
    public getHeight(): number {
        return this.tree.length;
    }

    /**
     * Get leaves
     */
    public getLeaves(): LeafData[] {
        return this.leaves;
    }
}

/**
 * Parse CSV file with allocations
 */
function parseAllocationsCSV(csvPath: string): Allocation[] {
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.trim().split('\n');

    // Skip header
    const dataLines = lines.slice(1);

    const allocations: Allocation[] = [];

    for (const line of dataLines) {
        const [address, points, amount] = line.split(',');

        if (!address || !points || !amount) {
            console.warn(`Skipping invalid line: ${line}`);
            continue;
        }

        allocations.push({
            address: address.trim(),
            points: parseInt(points.trim()),
            amount: parseFloat(amount.trim()),
        });
    }

    return allocations;
}

/**
 * Main execution
 */
function main() {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.error('Usage: ts-node generate-merkle-tree.ts <input_csv> <output_json>');
        console.error('');
        console.error('Example:');
        console.error('  ts-node generate-merkle-tree.ts allocations.csv merkle-tree.json');
        process.exit(1);
    }

    const [inputPath, outputPath] = args;

    console.log('🌳 KAMIYO Airdrop Merkle Tree Generator');
    console.log('');

    // Parse allocations
    console.log(`📄 Reading allocations from: ${inputPath}`);
    const allocations = parseAllocationsCSV(inputPath);
    console.log(`✅ Loaded ${allocations.length} allocations`);

    // Validate allocations
    console.log('');
    console.log('🔍 Validating allocations...');
    const totalTokens = allocations.reduce((sum, alloc) => sum + alloc.amount, 0);
    console.log(`   Total tokens: ${totalTokens.toLocaleString()} KAMIYO`);

    const maxAllocation = Math.max(...allocations.map(a => a.amount));
    const minAllocation = Math.min(...allocations.map(a => a.amount));
    console.log(`   Range: ${minAllocation} - ${maxAllocation} KAMIYO`);

    // Check caps
    const exceedsMax = allocations.filter(a => a.amount > 10_000);
    if (exceedsMax.length > 0) {
        console.warn(`⚠️  Warning: ${exceedsMax.length} allocations exceed 10,000 KAMIYO cap`);
    }

    const belowMin = allocations.filter(a => a.amount < 100);
    if (belowMin.length > 0) {
        console.warn(`⚠️  Warning: ${belowMin.length} allocations below 100 KAMIYO minimum`);
    }

    // Generate merkle tree
    console.log('');
    console.log('🌲 Generating merkle tree...');
    const tree = new MerkleTree(allocations);
    const root = tree.getRoot();
    console.log(`✅ Merkle root: ${root}`);
    console.log(`   Tree height: ${tree.getHeight()} levels`);

    // Generate proofs
    console.log('');
    console.log('🔑 Generating proofs for all wallets...');
    const proofs = tree.getAllProofs();
    console.log(`✅ Generated ${proofs.length} proofs`);

    // Create output
    const output: MerkleTreeOutput = {
        merkleRoot: root,
        totalAllocations: allocations.length,
        totalTokens: (BigInt(totalTokens) * BigInt(1_000_000_000)).toString(),
        totalTokensKamiyo: totalTokens,
        treeHeight: tree.getHeight(),
        leaves: tree.getLeaves(),
        proofs: proofs,
        generatedAt: new Date().toISOString(),
    };

    // Write output
    console.log('');
    console.log(`💾 Writing output to: ${outputPath}`);
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log('✅ Done!');

    // Summary
    console.log('');
    console.log('📊 Summary:');
    console.log(`   Merkle Root: ${root}`);
    console.log(`   Total Allocations: ${allocations.length}`);
    console.log(`   Total Tokens: ${totalTokens.toLocaleString()} KAMIYO`);
    console.log(`   Tree Height: ${tree.getHeight()} levels`);
    console.log('');
    console.log('🚀 Next steps:');
    console.log('   1. Review the generated merkle tree JSON');
    console.log('   2. Initialize airdrop program with merkle root');
    console.log('   3. Fund vault with tokens');
    console.log('   4. Users can claim using their proof from the JSON file');
}

// Run if called directly
if (require.main === module) {
    main();
}

export { MerkleTree, Allocation, ProofData, MerkleTreeOutput };
