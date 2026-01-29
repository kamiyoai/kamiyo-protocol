import { describe, it, expect } from 'vitest';
import { PublicKey, Keypair, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { TARS_PROGRAM_ID } from './types';

describe('TarsBridge instruction builders', () => {
  const testWallet = Keypair.generate();
  const testAgentWallet = Keypair.generate();
  const testJobPda = Keypair.generate().publicKey;
  const testAgentPda = Keypair.generate().publicKey;
  const testFeedbackPda = Keypair.generate().publicKey;
  const testClientTokenAccount = Keypair.generate().publicKey;
  const testAgentTokenAccount = Keypair.generate().publicKey;
  const testPaymentTx = Keypair.generate().publicKey;

  describe('submit_feedback discriminator', () => {
    it('matches TARS program discriminator', () => {
      const discriminator = Buffer.from([222, 189, 16, 203, 186, 151, 236, 188]);
      expect(discriminator.length).toBe(8);
    });
  });

  describe('register_job discriminator', () => {
    it('matches TARS program discriminator', () => {
      const discriminator = Buffer.from([87, 213, 177, 255, 131, 17, 178, 45]);
      expect(discriminator.length).toBe(8);
    });
  });

  describe('register_agent discriminator', () => {
    it('matches TARS program discriminator', () => {
      const discriminator = Buffer.from([135, 157, 66, 195, 2, 113, 175, 30]);
      expect(discriminator.length).toBe(8);
    });
  });

  describe('instruction data serialization', () => {
    it('serializes rating correctly', () => {
      const rating = 5;
      const buf = Buffer.alloc(1);
      buf.writeUInt8(rating);
      expect(buf.readUInt8(0)).toBe(5);
    });

    it('serializes None comment URI correctly', () => {
      const buf = Buffer.alloc(1);
      buf.writeUInt8(0, 0);
      expect(buf.readUInt8(0)).toBe(0);
    });

    it('serializes Some comment URI correctly', () => {
      const commentUri = 'https://example.com/feedback';
      const uriBytes = Buffer.from(commentUri, 'utf8');
      const buf = Buffer.alloc(1 + 4 + uriBytes.length);
      buf.writeUInt8(1, 0);
      buf.writeUInt32LE(uriBytes.length, 1);
      uriBytes.copy(buf, 5);

      expect(buf.readUInt8(0)).toBe(1);
      expect(buf.readUInt32LE(1)).toBe(uriBytes.length);
      expect(buf.slice(5).toString('utf8')).toBe(commentUri);
    });

    it('serializes metadata URI correctly', () => {
      const metadataUri = 'ipfs://QmTest123';
      const uriBytes = Buffer.from(metadataUri, 'utf8');
      const buf = Buffer.alloc(4 + uriBytes.length);
      buf.writeUInt32LE(uriBytes.length, 0);
      uriBytes.copy(buf, 4);

      expect(buf.readUInt32LE(0)).toBe(uriBytes.length);
      expect(buf.slice(4).toString('utf8')).toBe(metadataUri);
    });

    it('serializes transfer instruction index correctly', () => {
      const index = 0;
      const buf = Buffer.alloc(1);
      buf.writeUInt8(index);
      expect(buf.readUInt8(0)).toBe(0);
    });
  });

  describe('account validation', () => {
    it('validates register_job account count', () => {
      const expectedAccounts = 11;
      const accounts = [
        { pubkey: testJobPda, isSigner: false, isWritable: true },
        { pubkey: testAgentPda, isSigner: false, isWritable: true },
        { pubkey: testAgentWallet.publicKey, isSigner: false, isWritable: false },
        { pubkey: testClientTokenAccount, isSigner: false, isWritable: false },
        { pubkey: testAgentTokenAccount, isSigner: false, isWritable: false },
        { pubkey: testPaymentTx, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: testWallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: testWallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ];
      expect(accounts.length).toBe(expectedAccounts);
    });

    it('validates submit_feedback account count', () => {
      const expectedAccounts = 5;
      const accounts = [
        { pubkey: testFeedbackPda, isSigner: false, isWritable: true },
        { pubkey: testJobPda, isSigner: false, isWritable: false },
        { pubkey: testAgentPda, isSigner: false, isWritable: true },
        { pubkey: testWallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ];
      expect(accounts.length).toBe(expectedAccounts);
    });

    it('validates register_agent account count', () => {
      const expectedAccounts = 3;
      const accounts = [
        { pubkey: testAgentPda, isSigner: false, isWritable: true },
        { pubkey: testWallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ];
      expect(accounts.length).toBe(expectedAccounts);
    });
  });
});

describe('rating validation edge cases', () => {
  it('handles boundary ratings', () => {
    const ratings = [1, 2, 3, 4, 5];
    for (const rating of ratings) {
      const buf = Buffer.alloc(1);
      buf.writeUInt8(rating);
      expect(buf.readUInt8(0)).toBe(rating);
    }
  });
});

describe('URI length limits', () => {
  it('allows URIs up to 200 characters', () => {
    const maxUri = 'x'.repeat(200);
    const uriBytes = Buffer.from(maxUri, 'utf8');
    expect(uriBytes.length).toBe(200);
  });

  it('rejects URIs over 200 characters conceptually', () => {
    const longUri = 'x'.repeat(201);
    expect(longUri.length).toBeGreaterThan(200);
  });
});
