import { PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { MeishiClient } from './client.js';
import type {
  CreatePassportParams,
  MeishiPassport,
  Jurisdiction,
} from './types.js';

export class PassportManager {
  constructor(private client: MeishiClient) {}

  async create(params: CreatePassportParams): Promise<{
    passportAddress: PublicKey;
    signature: string;
  }> {
    const [passportPDA] = this.client.getPassportPDA(params.agentIdentity);

    // Build instruction data: discriminator + jurisdiction
    const data = Buffer.alloc(9);
    // Anchor discriminator for create_meishi (sha256("global:create_meishi")[:8])
    const discriminator = Buffer.from([53, 24, 81, 209, 227, 131, 160, 214]);
    discriminator.copy(data, 0);
    data.writeUInt8(params.jurisdiction, 8);

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: this.client.keypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: params.agentIdentity, isSigner: false, isWritable: false },
        { pubkey: passportPDA, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.client.programId,
      data,
    });

    const tx = new Transaction().add(instruction);
    tx.feePayer = this.client.keypair.publicKey;
    tx.recentBlockhash = (await this.client.connection.getLatestBlockhash()).blockhash;

    tx.sign(this.client.keypair);
    const signature = await this.client.connection.sendRawTransaction(tx.serialize());
    await this.client.connection.confirmTransaction(signature);

    return { passportAddress: passportPDA, signature };
  }

  async get(agentIdentity: PublicKey): Promise<MeishiPassport | null> {
    return this.client.getPassport(agentIdentity);
  }

  async getByAddress(passportAddress: PublicKey): Promise<MeishiPassport | null> {
    return this.client.fetchPassport(passportAddress);
  }

  async verify(agentIdentity: PublicKey) {
    return this.client.verifyPassport(agentIdentity);
  }

  getAddress(agentIdentity: PublicKey): PublicKey {
    const [pda] = this.client.getPassportPDA(agentIdentity);
    return pda;
  }

  isActive(passport: MeishiPassport): boolean {
    return !passport.suspended && passport.complianceScore > -500;
  }

  isCompliant(passport: MeishiPassport): boolean {
    const now = Math.floor(Date.now() / 1000);
    return (
      !passport.suspended &&
      passport.complianceScore > 0 &&
      passport.mandateExpires.toNumber() > now &&
      !passport.mandateHash.every((b) => b === 0)
    );
  }

  getDisputeRate(passport: MeishiPassport): number {
    const total = passport.totalTransactions.toNumber();
    if (total === 0) return 0;
    return passport.disputesFiled / total;
  }

  getDisputeLossRate(passport: MeishiPassport): number {
    if (passport.disputesFiled === 0) return 0;
    return passport.disputesLost / passport.disputesFiled;
  }

  getTrustTier(passport: MeishiPassport): string {
    const score = passport.complianceScore;
    if (score >= 800) return 'trusted';
    if (score >= 600) return 'excellent';
    if (score >= 400) return 'good';
    if (score >= 200) return 'basic';
    if (score >= 0) return 'new';
    return 'untrusted';
  }
}
