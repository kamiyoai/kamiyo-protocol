const { expect } = require('chai');
const path = require('path');
const wasm_tester = require('circom_tester').wasm;
const { buildPoseidon } = require('circomlibjs');

describe('SwarmVote Circuit', function () {
  this.timeout(100000);

  let circuit;
  let poseidon;
  let F;

  before(async () => {
    circuit = await wasm_tester(
      path.join(__dirname, '../swarm_vote.circom'),
      { include: [path.join(__dirname, '../../node_modules')] }
    );
    poseidon = await buildPoseidon();
    F = poseidon.F;
  });

  function poseidonHash(inputs) {
    return F.toObject(poseidon(inputs));
  }

  it('should verify valid approve vote', async () => {
    const ownerSecret = BigInt('12345678901234567890');
    const agentId = BigInt('98765432109876543210');
    const registrationSecret = BigInt('11111111111111111111');
    const actionHash = BigInt('55555555555555555555');
    const vote = BigInt(1); // approve
    const voteSalt = BigInt('77777777777777777777');

    // Compute commitment
    const commitment = poseidonHash([ownerSecret, agentId, registrationSecret]);

    // Single-leaf merkle tree
    const merkleProof = Array(20).fill(BigInt(0));
    const pathIndices = Array(20).fill(0);

    // Compute root
    let currentHash = commitment;
    for (let i = 0; i < 20; i++) {
      currentHash = poseidonHash([currentHash, BigInt(0)]);
    }
    const agentsRoot = currentHash;

    // Compute vote nullifier
    const voteNullifier = poseidonHash([agentId, registrationSecret, actionHash]);

    // Compute vote commitment
    const voteCommitment = poseidonHash([vote, voteSalt, actionHash]);

    const input = {
      agents_root: agentsRoot.toString(),
      action_hash: actionHash.toString(),
      vote_nullifier: voteNullifier.toString(),
      vote_commitment: voteCommitment.toString(),
      owner_secret: ownerSecret.toString(),
      agent_id: agentId.toString(),
      registration_secret: registrationSecret.toString(),
      merkle_path: merkleProof.map(p => p.toString()),
      path_indices: pathIndices,
      vote: vote.toString(),
      vote_salt: voteSalt.toString(),
    };

    const witness = await circuit.calculateWitness(input, true);
    await circuit.checkConstraints(witness);
  });

  it('should verify valid reject vote', async () => {
    const ownerSecret = BigInt('12345678901234567890');
    const agentId = BigInt('98765432109876543210');
    const registrationSecret = BigInt('11111111111111111111');
    const actionHash = BigInt('55555555555555555555');
    const vote = BigInt(0); // reject
    const voteSalt = BigInt('77777777777777777777');

    const commitment = poseidonHash([ownerSecret, agentId, registrationSecret]);

    const merkleProof = Array(20).fill(BigInt(0));
    const pathIndices = Array(20).fill(0);

    let currentHash = commitment;
    for (let i = 0; i < 20; i++) {
      currentHash = poseidonHash([currentHash, BigInt(0)]);
    }
    const agentsRoot = currentHash;

    const voteNullifier = poseidonHash([agentId, registrationSecret, actionHash]);
    const voteCommitment = poseidonHash([vote, voteSalt, actionHash]);

    const input = {
      agents_root: agentsRoot.toString(),
      action_hash: actionHash.toString(),
      vote_nullifier: voteNullifier.toString(),
      vote_commitment: voteCommitment.toString(),
      owner_secret: ownerSecret.toString(),
      agent_id: agentId.toString(),
      registration_secret: registrationSecret.toString(),
      merkle_path: merkleProof.map(p => p.toString()),
      path_indices: pathIndices,
      vote: vote.toString(),
      vote_salt: voteSalt.toString(),
    };

    const witness = await circuit.calculateWitness(input, true);
    await circuit.checkConstraints(witness);
  });

  it('should reject invalid vote value', async () => {
    const ownerSecret = BigInt('12345678901234567890');
    const agentId = BigInt('98765432109876543210');
    const registrationSecret = BigInt('11111111111111111111');
    const actionHash = BigInt('55555555555555555555');
    const vote = BigInt(2); // invalid - must be 0 or 1
    const voteSalt = BigInt('77777777777777777777');

    const commitment = poseidonHash([ownerSecret, agentId, registrationSecret]);

    const merkleProof = Array(20).fill(BigInt(0));
    const pathIndices = Array(20).fill(0);

    let currentHash = commitment;
    for (let i = 0; i < 20; i++) {
      currentHash = poseidonHash([currentHash, BigInt(0)]);
    }
    const agentsRoot = currentHash;

    const voteNullifier = poseidonHash([agentId, registrationSecret, actionHash]);
    const voteCommitment = poseidonHash([vote, voteSalt, actionHash]);

    const input = {
      agents_root: agentsRoot.toString(),
      action_hash: actionHash.toString(),
      vote_nullifier: voteNullifier.toString(),
      vote_commitment: voteCommitment.toString(),
      owner_secret: ownerSecret.toString(),
      agent_id: agentId.toString(),
      registration_secret: registrationSecret.toString(),
      merkle_path: merkleProof.map(p => p.toString()),
      path_indices: pathIndices,
      vote: vote.toString(),
      vote_salt: voteSalt.toString(),
    };

    try {
      await circuit.calculateWitness(input, true);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.message).to.include('Assert Failed');
    }
  });

  it('should reject wrong vote nullifier', async () => {
    const ownerSecret = BigInt('12345678901234567890');
    const agentId = BigInt('98765432109876543210');
    const registrationSecret = BigInt('11111111111111111111');
    const actionHash = BigInt('55555555555555555555');
    const vote = BigInt(1);
    const voteSalt = BigInt('77777777777777777777');

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
    const voteCommitment = poseidonHash([vote, voteSalt, actionHash]);

    const input = {
      agents_root: agentsRoot.toString(),
      action_hash: actionHash.toString(),
      vote_nullifier: wrongNullifier.toString(),
      vote_commitment: voteCommitment.toString(),
      owner_secret: ownerSecret.toString(),
      agent_id: agentId.toString(),
      registration_secret: registrationSecret.toString(),
      merkle_path: merkleProof.map(p => p.toString()),
      path_indices: pathIndices,
      vote: vote.toString(),
      vote_salt: voteSalt.toString(),
    };

    try {
      await circuit.calculateWitness(input, true);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.message).to.include('Assert Failed');
    }
  });

  it('should reject wrong vote commitment', async () => {
    const ownerSecret = BigInt('12345678901234567890');
    const agentId = BigInt('98765432109876543210');
    const registrationSecret = BigInt('11111111111111111111');
    const actionHash = BigInt('55555555555555555555');
    const vote = BigInt(1);
    const voteSalt = BigInt('77777777777777777777');

    const commitment = poseidonHash([ownerSecret, agentId, registrationSecret]);

    const merkleProof = Array(20).fill(BigInt(0));
    const pathIndices = Array(20).fill(0);

    let currentHash = commitment;
    for (let i = 0; i < 20; i++) {
      currentHash = poseidonHash([currentHash, BigInt(0)]);
    }
    const agentsRoot = currentHash;

    const voteNullifier = poseidonHash([agentId, registrationSecret, actionHash]);
    // Wrong vote commitment
    const wrongVoteCommitment = BigInt(888888);

    const input = {
      agents_root: agentsRoot.toString(),
      action_hash: actionHash.toString(),
      vote_nullifier: voteNullifier.toString(),
      vote_commitment: wrongVoteCommitment.toString(),
      owner_secret: ownerSecret.toString(),
      agent_id: agentId.toString(),
      registration_secret: registrationSecret.toString(),
      merkle_path: merkleProof.map(p => p.toString()),
      path_indices: pathIndices,
      vote: vote.toString(),
      vote_salt: voteSalt.toString(),
    };

    try {
      await circuit.calculateWitness(input, true);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.message).to.include('Assert Failed');
    }
  });

  it('should reject non-member agent', async () => {
    const ownerSecret = BigInt('12345678901234567890');
    const agentId = BigInt('98765432109876543210');
    const registrationSecret = BigInt('11111111111111111111');
    const actionHash = BigInt('55555555555555555555');
    const vote = BigInt(1);
    const voteSalt = BigInt('77777777777777777777');

    const merkleProof = Array(20).fill(BigInt(0));
    const pathIndices = Array(20).fill(0);

    // Wrong root - agent not in tree
    const wrongRoot = BigInt(123456789);

    const voteNullifier = poseidonHash([agentId, registrationSecret, actionHash]);
    const voteCommitment = poseidonHash([vote, voteSalt, actionHash]);

    const input = {
      agents_root: wrongRoot.toString(),
      action_hash: actionHash.toString(),
      vote_nullifier: voteNullifier.toString(),
      vote_commitment: voteCommitment.toString(),
      owner_secret: ownerSecret.toString(),
      agent_id: agentId.toString(),
      registration_secret: registrationSecret.toString(),
      merkle_path: merkleProof.map(p => p.toString()),
      path_indices: pathIndices,
      vote: vote.toString(),
      vote_salt: voteSalt.toString(),
    };

    try {
      await circuit.calculateWitness(input, true);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.message).to.include('Assert Failed');
    }
  });
});
