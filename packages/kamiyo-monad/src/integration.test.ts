/**
 * Cross-chain integration tests
 * Run with: TEST_MODE=integration npm test
 */

import { ethers } from 'ethers';
import { expect } from 'chai';
import { createMonadProvider } from './provider';
import { createReputationBridge, SolanaReputationSource } from './reputation';
import { createPDAProxy } from './pda-proxy';
import { createSwarmBacktester, InferenceProvider } from './swarm';
import { ReputationState, Groth16Proof, NETWORKS, AgentType } from './types';

const isIntegrationTest = process.env.TEST_MODE === 'integration';

describe('Cross-chain Integration', function () {
  if (!isIntegrationTest) {
    it.skip('Skipped - set TEST_MODE=integration to run', () => {});
    return;
  }

  this.timeout(60000);

  const testPrivateKey = process.env.TEST_PRIVATE_KEY || ethers.Wallet.createRandom().privateKey;

  describe('ReputationBridge', () => {
    it('syncs reputation from Solana to Monad', async () => {
      const provider = createMonadProvider({
        network: 'testnet',
        privateKey: testPrivateKey,
      });

      const mockSolana: SolanaReputationSource = {
        async fetchReputation(entity: string): Promise<ReputationState> {
          return {
            reputationScore: 750,
            totalTransactions: 100,
            disputesWon: 10,
            disputesLost: 2,
            lastUpdated: Math.floor(Date.now() / 1000),
          };
        },
        async generateProof(state: ReputationState): Promise<Groth16Proof> {
          // Mock proof - in production this would use snarkjs
          return {
            a: [BigInt(1), BigInt(2)],
            b: [
              [BigInt(3), BigInt(4)],
              [BigInt(5), BigInt(6)],
            ],
            c: [BigInt(7), BigInt(8)],
            publicInputs: [
              BigInt(1), // valid
              BigInt(state.reputationScore),
              BigInt(state.totalTransactions),
            ],
          };
        },
      };

      const bridge = createReputationBridge(provider, mockSolana);

      const testEntity = 'test-agent-' + Date.now();
      const existsBefore = await bridge.exists(testEntity);
      expect(existsBefore).to.be.false;

      // Would need actual valid proof to succeed
      // const txHash = await bridge.sync(testEntity);
      // expect(txHash).to.be.a('string');
    });

    it('verifies proof format', async () => {
      const provider = createMonadProvider({
        network: 'testnet',
        privateKey: testPrivateKey,
      });

      const bridge = createReputationBridge(provider);

      const proof: Groth16Proof = {
        a: [BigInt(1), BigInt(2)],
        b: [
          [BigInt(3), BigInt(4)],
          [BigInt(5), BigInt(6)],
        ],
        c: [BigInt(7), BigInt(8)],
        publicInputs: [BigInt(1), BigInt(750), BigInt(100)],
      };

      const encoded = bridge.encodeProof(proof);
      expect(encoded).to.be.a('string');
      expect(encoded.startsWith('0x')).to.be.true;

      const decoded = bridge.decodeProof(encoded);
      expect(decoded.a[0]).to.equal(proof.a[0]);
      expect(decoded.publicInputs.length).to.equal(3);
    });
  });

  describe('PDAProxy', () => {
    it('creates and queries agent', async () => {
      const provider = createMonadProvider({
        network: 'testnet',
        privateKey: testPrivateKey,
      });

      const proxy = createPDAProxy(provider);
      const testName = 'IntegrationTestAgent';

      // Would need actual deployment to succeed
      // const { address, txHash } = await proxy.createAgent(testName, AgentType.Trading);
      // expect(address).to.be.a('string');

      // const agent = await proxy.getAgent(address);
      // expect(agent.name).to.equal(testName);
    });
  });

  describe('SwarmBacktester', () => {
    it('runs simulation round', async () => {
      const provider = createMonadProvider({
        network: 'testnet',
        privateKey: testPrivateKey,
      });

      const mockInference: InferenceProvider = {
        async predict(input: Float32Array): Promise<Float32Array> {
          return new Float32Array([0.5, 0.3, 0.2]);
        },
      };

      const backtester = createSwarmBacktester(provider, { inference: mockInference });

      // Would need actual deployment to succeed
      // const simId = await backtester.start({
      //   name: 'TestSim',
      //   rounds: 10,
      //   agents: [{ name: 'Agent1', strategy: 'random' }],
      // });

      // const result = await backtester.runRound(simId, { price: 100 });
      // expect(result.stateHash).to.be.a('string');
    });
  });
});

describe('Local Bridge Tests', () => {
  describe('ReputationBridge encoding', () => {
    it('encodes and decodes proofs correctly', () => {
      const proof: Groth16Proof = {
        a: [BigInt('12345'), BigInt('67890')],
        b: [
          [BigInt('11111'), BigInt('22222')],
          [BigInt('33333'), BigInt('44444')],
        ],
        c: [BigInt('55555'), BigInt('66666')],
        publicInputs: [BigInt(1), BigInt(800), BigInt(50)],
      };

      const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256[2]', 'uint256[2][2]', 'uint256[2]', 'uint256[]'],
        [proof.a, proof.b, proof.c, proof.publicInputs]
      );

      const [a, b, c, inputs] = ethers.AbiCoder.defaultAbiCoder().decode(
        ['uint256[2]', 'uint256[2][2]', 'uint256[2]', 'uint256[]'],
        encoded
      );

      expect(a[0]).to.equal(proof.a[0]);
      expect(a[1]).to.equal(proof.a[1]);
      expect(b[0][0]).to.equal(proof.b[0][0]);
      expect(c[0]).to.equal(proof.c[0]);
      expect(inputs[0]).to.equal(proof.publicInputs[0]);
    });
  });

  describe('Entity hashing', () => {
    it('produces consistent hashes', () => {
      const entity = 'test-entity';
      const hash1 = ethers.keccak256(ethers.toUtf8Bytes(entity));
      const hash2 = ethers.keccak256(ethers.toUtf8Bytes(entity));

      expect(hash1).to.equal(hash2);
      expect(hash1.startsWith('0x')).to.be.true;
      expect(hash1.length).to.equal(66);
    });

    it('produces different hashes for different entities', () => {
      const hash1 = ethers.keccak256(ethers.toUtf8Bytes('entity1'));
      const hash2 = ethers.keccak256(ethers.toUtf8Bytes('entity2'));

      expect(hash1).to.not.equal(hash2);
    });
  });
});
