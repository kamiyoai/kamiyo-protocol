import { describe, it, expect } from 'vitest';
import { PublicKey, Keypair } from '@solana/web3.js';
import { HiveClient, SWARMTEAMS_PROGRAM_ID } from '../src';

describe('HiveClient', () => {
  describe('PDA Derivation', () => {
    it('should derive registry PDA consistently', () => {
      const [pda1, bump1] = HiveClient.getRegistryPDA();
      const [pda2, bump2] = HiveClient.getRegistryPDA();

      expect(pda1.equals(pda2)).toBe(true);
      expect(bump1).toBe(bump2);
    });

    it('should derive agent PDA from identity commitment', () => {
      const commitment = new Uint8Array(32).fill(1);
      const [pda, bump] = HiveClient.getAgentPDA(commitment);

      expect(pda).toBeInstanceOf(PublicKey);
      expect(bump).toBeLessThanOrEqual(255);
    });

    it('should derive different agent PDAs for different commitments', () => {
      const commitment1 = new Uint8Array(32).fill(1);
      const commitment2 = new Uint8Array(32).fill(2);

      const [pda1] = HiveClient.getAgentPDA(commitment1);
      const [pda2] = HiveClient.getAgentPDA(commitment2);

      expect(pda1.equals(pda2)).toBe(false);
    });

    describe('Identity Link PDAs', () => {
      it('should derive identity link PDA from ZK agent', () => {
        const zkAgent = Keypair.generate().publicKey;
        const [pda, bump] = HiveClient.getIdentityLinkPDA(zkAgent);

        expect(pda).toBeInstanceOf(PublicKey);
        expect(bump).toBeLessThanOrEqual(255);
      });

      it('should derive different link PDAs for different agents', () => {
        const agent1 = Keypair.generate().publicKey;
        const agent2 = Keypair.generate().publicKey;

        const [pda1] = HiveClient.getIdentityLinkPDA(agent1);
        const [pda2] = HiveClient.getIdentityLinkPDA(agent2);

        expect(pda1.equals(pda2)).toBe(false);
      });

      it('should derive stake position PDA from staking program', () => {
        const stakingProgramId = new PublicKey('Stake11111111111111111111111111111111111111');
        const owner = Keypair.generate().publicKey;

        const [pda, bump] = HiveClient.getStakePositionPDA(stakingProgramId, owner);

        expect(pda).toBeInstanceOf(PublicKey);
        expect(bump).toBeLessThanOrEqual(255);
      });

      it('should derive different stake PDAs for different owners', () => {
        const stakingProgramId = new PublicKey('Stake11111111111111111111111111111111111111');
        const owner1 = Keypair.generate().publicKey;
        const owner2 = Keypair.generate().publicKey;

        const [pda1] = HiveClient.getStakePositionPDA(stakingProgramId, owner1);
        const [pda2] = HiveClient.getStakePositionPDA(stakingProgramId, owner2);

        expect(pda1.equals(pda2)).toBe(false);
      });
    });
  });

  describe('Program ID', () => {
    it('should export the correct program ID', () => {
      expect(SWARMTEAMS_PROGRAM_ID.toBase58()).toBe(
        'DqEHULYq79diHGa4jKNdBnnQR4Ge8zAfYiRYzPHhF5Km'
      );
    });
  });
});
