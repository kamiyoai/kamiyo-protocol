#!/usr/bin/env python3
"""
Merkle Tree Generation Script for KAMIYO Airdrop (Python Version)

This script generates a merkle tree from user allocations (points system data)
and creates proofs for each eligible wallet.

Usage:
    python generate_merkle_tree.py <input_csv> <output_json>

Input CSV format:
    wallet_address,points,allocation_kamiyo
    7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU,500,10000
    5Ghq4q5XLB4JUFy5YvGGaF5Vz8ZQjX8fJYy7TLZ8dZ8m,250,5000

Dependencies:
    pip install base58 pycryptodome
"""

import sys
import json
import csv
from typing import List, Dict, Tuple
from datetime import datetime
from Crypto.Hash import keccak
import base58


class MerkleTree:
    """Merkle tree generator for KAMIYO airdrop"""

    def __init__(self, allocations: List[Dict]):
        self.leaves = []
        self.tree = []

        # Create leaf nodes
        for alloc in allocations:
            amount_lamports = int(alloc['amount'] * 1_000_000_000)  # Convert to lamports
            leaf_hash = self._hash_leaf(alloc['address'], amount_lamports)

            self.leaves.append({
                'address': alloc['address'],
                'amount': amount_lamports,
                'amountKamiyo': alloc['amount'],
                'hash': leaf_hash
            })

        # Sort leaves for deterministic ordering
        self.leaves.sort(key=lambda x: x['hash'])

        # Build tree
        self._build_tree()

    def _hash_leaf(self, address: str, amount: int) -> str:
        """Hash a leaf node (wallet address + amount)"""
        try:
            # Decode base58 address to bytes (32 bytes)
            pubkey_bytes = base58.b58decode(address)
            if len(pubkey_bytes) != 32:
                raise ValueError(f"Invalid address length: {address}")

            # Convert amount to little-endian 8 bytes
            amount_bytes = amount.to_bytes(8, byteorder='little')

            # Concatenate and hash
            data = pubkey_bytes + amount_bytes
            k = keccak.new(digest_bits=256)
            k.update(data)
            return k.hexdigest()

        except Exception as e:
            raise ValueError(f"Invalid wallet address {address}: {e}")

    def _hash_pair(self, left: str, right: str) -> str:
        """Hash two nodes together"""
        # Sort for deterministic ordering
        first, second = (left, right) if left <= right else (right, left)

        # Concatenate hex strings and hash
        combined = bytes.fromhex(first + second)
        k = keccak.new(digest_bits=256)
        k.update(combined)
        return k.hexdigest()

    def _build_tree(self):
        """Build merkle tree from leaves"""
        current_level = [leaf['hash'] for leaf in self.leaves]
        self.tree.append(current_level[:])

        while len(current_level) > 1:
            next_level = []

            for i in range(0, len(current_level), 2):
                left = current_level[i]
                right = current_level[i + 1] if i + 1 < len(current_level) else left

                parent = self._hash_pair(left, right)
                next_level.append(parent)

            self.tree.append(next_level)
            current_level = next_level

    def get_root(self) -> str:
        """Get merkle root"""
        return self.tree[-1][0]

    def get_proof(self, address: str) -> List[str]:
        """Get proof for a specific wallet"""
        # Find leaf index
        leaf_index = None
        for i, leaf in enumerate(self.leaves):
            if leaf['address'] == address:
                leaf_index = i
                break

        if leaf_index is None:
            raise ValueError(f"Wallet {address} not found in tree")

        proof = []
        current_index = leaf_index

        # Traverse up the tree
        for level in range(len(self.tree) - 1):
            level_nodes = self.tree[level]
            is_right_node = current_index % 2 == 1
            sibling_index = current_index - 1 if is_right_node else current_index + 1

            if sibling_index < len(level_nodes):
                proof.append(level_nodes[sibling_index])

            current_index = current_index // 2

        return proof

    def get_all_proofs(self) -> List[Dict]:
        """Get proofs for all wallets"""
        proofs = []
        for leaf in self.leaves:
            proof = self.get_proof(leaf['address'])
            proofs.append({
                'address': leaf['address'],
                'amount': str(leaf['amount']),
                'amountKamiyo': leaf['amountKamiyo'],
                'proof': proof
            })
        return proofs

    def get_height(self) -> int:
        """Get tree height"""
        return len(self.tree)


def parse_allocations_csv(csv_path: str) -> List[Dict]:
    """Parse CSV file with allocations"""
    allocations = []

    with open(csv_path, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                allocations.append({
                    'address': row['wallet_address'].strip(),
                    'points': int(row['points']),
                    'amount': float(row['allocation_kamiyo'])
                })
            except Exception as e:
                print(f"Warning: Skipping invalid row: {row} - {e}")

    return allocations


def main():
    if len(sys.argv) < 3:
        print('Usage: python generate_merkle_tree.py <input_csv> <output_json>')
        print('')
        print('Example:')
        print('  python generate_merkle_tree.py allocations.csv merkle-tree.json')
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    print('🌳 KAMIYO Airdrop Merkle Tree Generator (Python)')
    print('')

    # Parse allocations
    print(f'📄 Reading allocations from: {input_path}')
    allocations = parse_allocations_csv(input_path)
    print(f'✅ Loaded {len(allocations)} allocations')

    # Validate allocations
    print('')
    print('🔍 Validating allocations...')
    total_tokens = sum(alloc['amount'] for alloc in allocations)
    print(f'   Total tokens: {total_tokens:,.0f} KAMIYO')

    max_allocation = max(alloc['amount'] for alloc in allocations)
    min_allocation = min(alloc['amount'] for alloc in allocations)
    print(f'   Range: {min_allocation:.0f} - {max_allocation:.0f} KAMIYO')

    # Check caps
    exceeds_max = [a for a in allocations if a['amount'] > 10_000]
    if exceeds_max:
        print(f'⚠️  Warning: {len(exceeds_max)} allocations exceed 10,000 KAMIYO cap')

    below_min = [a for a in allocations if a['amount'] < 100]
    if below_min:
        print(f'⚠️  Warning: {len(below_min)} allocations below 100 KAMIYO minimum')

    # Generate merkle tree
    print('')
    print('🌲 Generating merkle tree...')
    tree = MerkleTree(allocations)
    root = tree.get_root()
    print(f'✅ Merkle root: {root}')
    print(f'   Tree height: {tree.get_height()} levels')

    # Generate proofs
    print('')
    print('🔑 Generating proofs for all wallets...')
    proofs = tree.get_all_proofs()
    print(f'✅ Generated {len(proofs)} proofs')

    # Create output
    output = {
        'merkleRoot': root,
        'totalAllocations': len(allocations),
        'totalTokens': str(int(total_tokens * 1_000_000_000)),
        'totalTokensKamiyo': total_tokens,
        'treeHeight': tree.get_height(),
        'leaves': tree.leaves,
        'proofs': proofs,
        'generatedAt': datetime.utcnow().isoformat() + 'Z'
    }

    # Write output
    print('')
    print(f'💾 Writing output to: {output_path}')
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)
    print('✅ Done!')

    # Summary
    print('')
    print('📊 Summary:')
    print(f'   Merkle Root: {root}')
    print(f'   Total Allocations: {len(allocations)}')
    print(f'   Total Tokens: {total_tokens:,.0f} KAMIYO')
    print(f'   Tree Height: {tree.get_height()} levels')
    print('')
    print('🚀 Next steps:')
    print('   1. Review the generated merkle tree JSON')
    print('   2. Initialize airdrop program with merkle root')
    print('   3. Fund vault with tokens')
    print('   4. Users can claim using their proof from the JSON file')


if __name__ == '__main__':
    main()
