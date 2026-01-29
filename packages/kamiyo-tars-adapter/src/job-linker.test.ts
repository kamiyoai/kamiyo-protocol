import { describe, it, expect, beforeEach } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import {
  deriveAgentPda,
  deriveJobPda,
  deriveFeedbackPda,
} from './job-linker';
import { TARS_PROGRAM_ID } from './types';

describe('PDA derivation', () => {
  const testWallet = new PublicKey('4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofM');
  const testPaymentTx = new PublicKey('5oNDL3swdJJF1g9DzJiZ4ynHXgszjAEpUkxVYejchzrY');
  const testJobRecord = new PublicKey('6FPrRHxCDQQ2pqYbCj9NX9vEqQDKSi4h1tHGaVBPV1y1');

  describe('deriveAgentPda', () => {
    it('derives deterministic agent PDA', () => {
      const [pda1, bump1] = deriveAgentPda(testWallet);
      const [pda2, bump2] = deriveAgentPda(testWallet);

      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
    });

    it('derives different PDAs for different wallets', () => {
      const otherWallet = new PublicKey('7njCsebKdqwqBM7vHmJqGfKtP5xkYRf4G1bJ9X2a3Qv5');
      const [pda1] = deriveAgentPda(testWallet);
      const [pda2] = deriveAgentPda(otherWallet);

      expect(pda1.toBase58()).not.toBe(pda2.toBase58());
    });

    it('uses correct seeds', () => {
      const [pda] = deriveAgentPda(testWallet, TARS_PROGRAM_ID);
      const [expected] = PublicKey.findProgramAddressSync(
        [Buffer.from('agent'), testWallet.toBuffer()],
        TARS_PROGRAM_ID
      );

      expect(pda.toBase58()).toBe(expected.toBase58());
    });

    it('accepts custom program ID', () => {
      const customProgramId = new PublicKey('8AphYWPbhRbjF3qyR8jJwJDKQr77fgvhLkHsKFWt8qKt');
      const [pda1] = deriveAgentPda(testWallet, TARS_PROGRAM_ID);
      const [pda2] = deriveAgentPda(testWallet, customProgramId);

      expect(pda1.toBase58()).not.toBe(pda2.toBase58());
    });
  });

  describe('deriveJobPda', () => {
    it('derives deterministic job PDA', () => {
      const [pda1, bump1] = deriveJobPda(testPaymentTx);
      const [pda2, bump2] = deriveJobPda(testPaymentTx);

      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
    });

    it('uses correct seeds', () => {
      const [pda] = deriveJobPda(testPaymentTx, TARS_PROGRAM_ID);
      const [expected] = PublicKey.findProgramAddressSync(
        [Buffer.from('job'), testPaymentTx.toBuffer()],
        TARS_PROGRAM_ID
      );

      expect(pda.toBase58()).toBe(expected.toBase58());
    });
  });

  describe('deriveFeedbackPda', () => {
    it('derives deterministic feedback PDA', () => {
      const [pda1, bump1] = deriveFeedbackPda(testJobRecord);
      const [pda2, bump2] = deriveFeedbackPda(testJobRecord);

      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
    });

    it('uses correct seeds', () => {
      const [pda] = deriveFeedbackPda(testJobRecord, TARS_PROGRAM_ID);
      const [expected] = PublicKey.findProgramAddressSync(
        [Buffer.from('feedback'), testJobRecord.toBuffer()],
        TARS_PROGRAM_ID
      );

      expect(pda.toBase58()).toBe(expected.toBase58());
    });
  });

  describe('PDA uniqueness', () => {
    it('agent, job, and feedback PDAs are distinct for same input', () => {
      const testKey = new PublicKey('9BRNNhPDf9HGfXgvYXRjfgKPkLJuYjwbGxhB2zGhQGJ3');

      const [agentPda] = deriveAgentPda(testKey);
      const [jobPda] = deriveJobPda(testKey);
      const [feedbackPda] = deriveFeedbackPda(testKey);

      expect(agentPda.toBase58()).not.toBe(jobPda.toBase58());
      expect(agentPda.toBase58()).not.toBe(feedbackPda.toBase58());
      expect(jobPda.toBase58()).not.toBe(feedbackPda.toBase58());
    });
  });
});

describe('JobEscrowLinker', () => {
  it('validates TARS program ID constant', () => {
    expect(TARS_PROGRAM_ID.toBase58()).toBe('GPd4z3N25UfjrkgfgSxsjoyG7gwYF8Fo7Emvp9TKsDeW');
  });
});
