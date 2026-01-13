const { expect } = require('chai');
const path = require('path');
const wasm_tester = require('circom_tester').wasm;
const { buildPoseidon } = require('circomlibjs');

describe('AgentIdentity Circuit', function () {
  this.timeout(100000);

  let circuit;
  let poseidon;
  let F;

  before(async () => {
    circuit = await wasm_tester(
      path.join(__dirname, '../agent_identity.circom'),
      { include: [path.join(__dirname, '../../node_modules')] }
    );
    poseidon = await buildPoseidon();
    F = poseidon.F;
  });

  function toField(n) {
    return F.toObject(F.e(n));
  }

  function poseidonHash(inputs) {
    return F.toObject(poseidon(inputs));
  }

  it('should verify valid agent identity proof', async () => {
    // Generate test values
    const ownerSecret = BigInt('12345678901234567890');
    const agentId = BigInt('98765432109876543210');
    const registrationSecret = BigInt('11111111111111111111');
    const epoch = BigInt(1);

    // Compute commitment
    const commitment = poseidonHash([ownerSecret, agentId, registrationSecret]);

    // For single-leaf tree, merkle path is all zeros
    const merkleProof = Array(20).fill(BigInt(0));
    const pathIndices = Array(20).fill(0);

    // Compute root (single leaf = commitment hashed up the tree)
    let currentHash = commitment;
    for (let i = 0; i < 20; i++) {
      currentHash = poseidonHash([currentHash, BigInt(0)]);
    }
    const agentsRoot = currentHash;

    // Compute nullifier
    const nullifier = poseidonHash([agentId, registrationSecret, epoch]);

    const input = {
      agents_root: agentsRoot.toString(),
      nullifier: nullifier.toString(),
      epoch: epoch.toString(),
      owner_secret: ownerSecret.toString(),
      agent_id: agentId.toString(),
      registration_secret: registrationSecret.toString(),
      merkle_path: merkleProof.map(p => p.toString()),
      path_indices: pathIndices,
    };

    const witness = await circuit.calculateWitness(input, true);
    await circuit.checkConstraints(witness);
  });

  it('should reject invalid nullifier', async () => {
    const ownerSecret = BigInt('12345678901234567890');
    const agentId = BigInt('98765432109876543210');
    const registrationSecret = BigInt('11111111111111111111');
    const epoch = BigInt(1);

    const commitment = poseidonHash([ownerSecret, agentId, registrationSecret]);
    const merkleProof = Array(20).fill(BigInt(0));
    const pathIndices = Array(20).fill(0);

    let currentHash = commitment;
    for (let i = 0; i < 20; i++) {
      currentHash = poseidonHash([currentHash, BigInt(0)]);
    }
    const agentsRoot = currentHash;

    // Wrong nullifier
    const wrongNullifier = BigInt(999999);

    const input = {
      agents_root: agentsRoot.toString(),
      nullifier: wrongNullifier.toString(),
      epoch: epoch.toString(),
      owner_secret: ownerSecret.toString(),
      agent_id: agentId.toString(),
      registration_secret: registrationSecret.toString(),
      merkle_path: merkleProof.map(p => p.toString()),
      path_indices: pathIndices,
    };

    try {
      await circuit.calculateWitness(input, true);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.message).to.include('Assert Failed');
    }
  });

  it('should reject invalid merkle root', async () => {
    const ownerSecret = BigInt('12345678901234567890');
    const agentId = BigInt('98765432109876543210');
    const registrationSecret = BigInt('11111111111111111111');
    const epoch = BigInt(1);

    const merkleProof = Array(20).fill(BigInt(0));
    const pathIndices = Array(20).fill(0);

    // Wrong root
    const wrongRoot = BigInt(123456789);
    const nullifier = poseidonHash([agentId, registrationSecret, epoch]);

    const input = {
      agents_root: wrongRoot.toString(),
      nullifier: nullifier.toString(),
      epoch: epoch.toString(),
      owner_secret: ownerSecret.toString(),
      agent_id: agentId.toString(),
      registration_secret: registrationSecret.toString(),
      merkle_path: merkleProof.map(p => p.toString()),
      path_indices: pathIndices,
    };

    try {
      await circuit.calculateWitness(input, true);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.message).to.include('Assert Failed');
    }
  });
});
