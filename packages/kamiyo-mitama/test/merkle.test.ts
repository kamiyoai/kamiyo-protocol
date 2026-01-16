import { describe, it, expect, beforeAll } from 'vitest';
import { MerkleTree, createMerkleTree } from '../src/merkle';

describe('MerkleTree', () => {
  describe('initialization', () => {
    it('should create tree with default depth', async () => {
      const tree = await createMerkleTree();
      expect(tree.getLeafCount()).toBe(0);
    });

    it('should create tree with custom depth', async () => {
      const tree = await createMerkleTree(10);
      expect(tree.getLeafCount()).toBe(0);
    });

    it('should return zero root for empty tree', async () => {
      const tree = await createMerkleTree(5);
      const root = await tree.getRoot();
      expect(root).toBeInstanceOf(Uint8Array);
      expect(root.length).toBe(32);
    });
  });

  describe('addLeaf', () => {
    it('should add leaf and return index', async () => {
      const tree = await createMerkleTree(5);
      const commitment = new Uint8Array(32).fill(1);

      const index = await tree.addLeaf(commitment);
      expect(index).toBe(0);
      expect(tree.getLeafCount()).toBe(1);
    });

    it('should add multiple leaves with sequential indices', async () => {
      const tree = await createMerkleTree(5);

      const idx0 = await tree.addLeaf(new Uint8Array(32).fill(1));
      const idx1 = await tree.addLeaf(new Uint8Array(32).fill(2));
      const idx2 = await tree.addLeaf(new Uint8Array(32).fill(3));

      expect(idx0).toBe(0);
      expect(idx1).toBe(1);
      expect(idx2).toBe(2);
      expect(tree.getLeafCount()).toBe(3);
    });

    it('should throw when tree is full', async () => {
      const tree = await createMerkleTree(2); // Max 4 leaves

      await tree.addLeaf(new Uint8Array(32).fill(1));
      await tree.addLeaf(new Uint8Array(32).fill(2));
      await tree.addLeaf(new Uint8Array(32).fill(3));
      await tree.addLeaf(new Uint8Array(32).fill(4));

      await expect(tree.addLeaf(new Uint8Array(32).fill(5))).rejects.toThrow(
        'Tree is full'
      );
    });
  });

  describe('getLeaf', () => {
    it('should return leaf at valid index', async () => {
      const tree = await createMerkleTree(5);
      const commitment = new Uint8Array(32).fill(42);

      await tree.addLeaf(commitment);
      const retrieved = tree.getLeaf(0);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.length).toBe(32);
    });

    it('should return null for invalid index', async () => {
      const tree = await createMerkleTree(5);
      expect(tree.getLeaf(0)).toBeNull();
      expect(tree.getLeaf(-1)).toBeNull();
      expect(tree.getLeaf(100)).toBeNull();
    });
  });

  describe('generateProof and verifyProof', () => {
    it('should generate valid proof for single leaf', async () => {
      const tree = await createMerkleTree(5);
      const commitment = new Uint8Array(32).fill(1);

      await tree.addLeaf(commitment);
      const { proof, pathIndices } = await tree.generateProof(0);

      expect(proof.length).toBe(5);
      expect(pathIndices.length).toBe(5);
      expect(pathIndices.every(i => i === 0 || i === 1)).toBe(true);
    });

    it('should verify valid proof', async () => {
      const tree = await createMerkleTree(5);
      const commitment = new Uint8Array(32).fill(99);

      await tree.addLeaf(commitment);
      const root = await tree.getRoot();
      const { proof, pathIndices } = await tree.generateProof(0);

      const isValid = await tree.verifyProof(commitment, proof, pathIndices, root);
      expect(isValid).toBe(true);
    });

    it('should reject proof with wrong commitment', async () => {
      const tree = await createMerkleTree(5);
      const commitment = new Uint8Array(32).fill(99);
      const wrongCommitment = new Uint8Array(32).fill(100);

      await tree.addLeaf(commitment);
      const root = await tree.getRoot();
      const { proof, pathIndices } = await tree.generateProof(0);

      const isValid = await tree.verifyProof(wrongCommitment, proof, pathIndices, root);
      expect(isValid).toBe(false);
    });

    it('should reject proof with wrong root', async () => {
      const tree = await createMerkleTree(5);
      const commitment = new Uint8Array(32).fill(99);
      const wrongRoot = new Uint8Array(32).fill(0);

      await tree.addLeaf(commitment);
      const { proof, pathIndices } = await tree.generateProof(0);

      const isValid = await tree.verifyProof(commitment, proof, pathIndices, wrongRoot);
      expect(isValid).toBe(false);
    });

    it('should handle multiple leaves correctly', async () => {
      const tree = await createMerkleTree(5);

      const commitments = [
        new Uint8Array(32).fill(1),
        new Uint8Array(32).fill(2),
        new Uint8Array(32).fill(3),
        new Uint8Array(32).fill(4),
      ];

      for (const c of commitments) {
        await tree.addLeaf(c);
      }

      const root = await tree.getRoot();

      // Verify proof for each leaf
      for (let i = 0; i < commitments.length; i++) {
        const { proof, pathIndices } = await tree.generateProof(i);
        const isValid = await tree.verifyProof(commitments[i], proof, pathIndices, root);
        expect(isValid).toBe(true);
      }
    });

    it('should throw for invalid leaf index', async () => {
      const tree = await createMerkleTree(5);
      await tree.addLeaf(new Uint8Array(32).fill(1));

      await expect(tree.generateProof(-1)).rejects.toThrow('Invalid leaf index');
      await expect(tree.generateProof(5)).rejects.toThrow('Invalid leaf index');
    });
  });

  describe('serialization', () => {
    it('should serialize and deserialize empty tree', async () => {
      const tree = await createMerkleTree(5);
      const data = tree.serialize();

      const restored = await MerkleTree.deserialize(data);
      expect(restored.getLeafCount()).toBe(0);

      const originalRoot = await tree.getRoot();
      const restoredRoot = await restored.getRoot();
      expect(restoredRoot).toEqual(originalRoot);
    });

    it('should serialize and deserialize tree with leaves', async () => {
      const tree = await createMerkleTree(5);
      await tree.addLeaf(new Uint8Array(32).fill(1));
      await tree.addLeaf(new Uint8Array(32).fill(2));
      await tree.addLeaf(new Uint8Array(32).fill(3));

      const originalRoot = await tree.getRoot();
      const data = tree.serialize();

      const restored = await MerkleTree.deserialize(data);
      expect(restored.getLeafCount()).toBe(3);

      const restoredRoot = await restored.getRoot();
      expect(restoredRoot).toEqual(originalRoot);
    });

    it('should preserve proof validity after deserialization', async () => {
      const tree = await createMerkleTree(5);
      const commitment = new Uint8Array(32).fill(42);
      await tree.addLeaf(commitment);

      const data = tree.serialize();
      const restored = await MerkleTree.deserialize(data);

      const root = await restored.getRoot();
      const { proof, pathIndices } = await restored.generateProof(0);
      const isValid = await restored.verifyProof(commitment, proof, pathIndices, root);

      expect(isValid).toBe(true);
    });
  });

  describe('root consistency', () => {
    it('should produce different roots for different leaves', async () => {
      const tree1 = await createMerkleTree(5);
      const tree2 = await createMerkleTree(5);

      await tree1.addLeaf(new Uint8Array(32).fill(1));
      await tree2.addLeaf(new Uint8Array(32).fill(2));

      const root1 = await tree1.getRoot();
      const root2 = await tree2.getRoot();

      expect(root1).not.toEqual(root2);
    });

    it('should produce same root for same leaves', async () => {
      const tree1 = await createMerkleTree(5);
      const tree2 = await createMerkleTree(5);

      await tree1.addLeaf(new Uint8Array(32).fill(1));
      await tree1.addLeaf(new Uint8Array(32).fill(2));

      await tree2.addLeaf(new Uint8Array(32).fill(1));
      await tree2.addLeaf(new Uint8Array(32).fill(2));

      const root1 = await tree1.getRoot();
      const root2 = await tree2.getRoot();

      expect(root1).toEqual(root2);
    });
  });
});
