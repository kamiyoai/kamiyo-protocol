const { expect } = require('chai');
const path = require('path');
const wasm_tester = require('circom_tester').wasm;
const { buildPoseidon } = require('circomlibjs');

describe('PrivateSignal Circuit', function () {
  this.timeout(100000);

  let circuit;
  let poseidon;
  let F;

  before(async () => {
    circuit = await wasm_tester(
      path.join(__dirname, '../private_signal.circom'),
      { include: [path.join(__dirname, '../../node_modules')] }
    );
    poseidon = await buildPoseidon();
    F = poseidon.F;
  });

  function poseidonHash(inputs) {
    return F.toObject(poseidon(inputs));
  }

  it('should verify valid private signal proof', async () => {
    const signalType = BigInt(0); // price signal
    const direction = BigInt(1); // long
    const confidence = BigInt(75);
    const magnitude = BigInt(50);
    const stakeAmount = BigInt('1000000000'); // 1 SOL in lamports
    const secret = BigInt('99999999999999999999');
    const agentNullifier = BigInt('12345678901234567890');

    const minStake = BigInt('500000000'); // 0.5 SOL
    const minConfidence = BigInt(50);

    // Compute signal commitment
    const signalCommitment = poseidonHash([
      signalType,
      direction,
      confidence,
      magnitude,
      stakeAmount,
      secret,
      agentNullifier,
    ]);

    const input = {
      signal_commitment: signalCommitment.toString(),
      min_stake: minStake.toString(),
      min_confidence: minConfidence.toString(),
      agent_nullifier: agentNullifier.toString(),
      signal_type: signalType.toString(),
      direction: direction.toString(),
      confidence: confidence.toString(),
      magnitude: magnitude.toString(),
      stake_amount: stakeAmount.toString(),
      secret: secret.toString(),
    };

    const witness = await circuit.calculateWitness(input, true);
    await circuit.checkConstraints(witness);
  });

  it('should reject stake below minimum', async () => {
    const signalType = BigInt(0);
    const direction = BigInt(1);
    const confidence = BigInt(75);
    const magnitude = BigInt(50);
    const stakeAmount = BigInt('100000000'); // 0.1 SOL - below min
    const secret = BigInt('99999999999999999999');
    const agentNullifier = BigInt('12345678901234567890');

    const minStake = BigInt('500000000'); // 0.5 SOL
    const minConfidence = BigInt(50);

    const signalCommitment = poseidonHash([
      signalType,
      direction,
      confidence,
      magnitude,
      stakeAmount,
      secret,
      agentNullifier,
    ]);

    const input = {
      signal_commitment: signalCommitment.toString(),
      min_stake: minStake.toString(),
      min_confidence: minConfidence.toString(),
      agent_nullifier: agentNullifier.toString(),
      signal_type: signalType.toString(),
      direction: direction.toString(),
      confidence: confidence.toString(),
      magnitude: magnitude.toString(),
      stake_amount: stakeAmount.toString(),
      secret: secret.toString(),
    };

    try {
      await circuit.calculateWitness(input, true);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.message).to.include('Assert Failed');
    }
  });

  it('should reject confidence below minimum', async () => {
    const signalType = BigInt(0);
    const direction = BigInt(1);
    const confidence = BigInt(25); // below min
    const magnitude = BigInt(50);
    const stakeAmount = BigInt('1000000000');
    const secret = BigInt('99999999999999999999');
    const agentNullifier = BigInt('12345678901234567890');

    const minStake = BigInt('500000000');
    const minConfidence = BigInt(50);

    const signalCommitment = poseidonHash([
      signalType,
      direction,
      confidence,
      magnitude,
      stakeAmount,
      secret,
      agentNullifier,
    ]);

    const input = {
      signal_commitment: signalCommitment.toString(),
      min_stake: minStake.toString(),
      min_confidence: minConfidence.toString(),
      agent_nullifier: agentNullifier.toString(),
      signal_type: signalType.toString(),
      direction: direction.toString(),
      confidence: confidence.toString(),
      magnitude: magnitude.toString(),
      stake_amount: stakeAmount.toString(),
      secret: secret.toString(),
    };

    try {
      await circuit.calculateWitness(input, true);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.message).to.include('Assert Failed');
    }
  });

  it('should reject invalid direction', async () => {
    const signalType = BigInt(0);
    const direction = BigInt(5); // invalid - must be 0, 1, or 2
    const confidence = BigInt(75);
    const magnitude = BigInt(50);
    const stakeAmount = BigInt('1000000000');
    const secret = BigInt('99999999999999999999');
    const agentNullifier = BigInt('12345678901234567890');

    const minStake = BigInt('500000000');
    const minConfidence = BigInt(50);

    const signalCommitment = poseidonHash([
      signalType,
      direction,
      confidence,
      magnitude,
      stakeAmount,
      secret,
      agentNullifier,
    ]);

    const input = {
      signal_commitment: signalCommitment.toString(),
      min_stake: minStake.toString(),
      min_confidence: minConfidence.toString(),
      agent_nullifier: agentNullifier.toString(),
      signal_type: signalType.toString(),
      direction: direction.toString(),
      confidence: confidence.toString(),
      magnitude: magnitude.toString(),
      stake_amount: stakeAmount.toString(),
      secret: secret.toString(),
    };

    try {
      await circuit.calculateWitness(input, true);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.message).to.include('Assert Failed');
    }
  });

  it('should reject wrong signal commitment', async () => {
    const signalType = BigInt(0);
    const direction = BigInt(1);
    const confidence = BigInt(75);
    const magnitude = BigInt(50);
    const stakeAmount = BigInt('1000000000');
    const secret = BigInt('99999999999999999999');
    const agentNullifier = BigInt('12345678901234567890');

    const minStake = BigInt('500000000');
    const minConfidence = BigInt(50);

    // Wrong commitment
    const wrongCommitment = BigInt(123456789);

    const input = {
      signal_commitment: wrongCommitment.toString(),
      min_stake: minStake.toString(),
      min_confidence: minConfidence.toString(),
      agent_nullifier: agentNullifier.toString(),
      signal_type: signalType.toString(),
      direction: direction.toString(),
      confidence: confidence.toString(),
      magnitude: magnitude.toString(),
      stake_amount: stakeAmount.toString(),
      secret: secret.toString(),
    };

    try {
      await circuit.calculateWitness(input, true);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.message).to.include('Assert Failed');
    }
  });
});
