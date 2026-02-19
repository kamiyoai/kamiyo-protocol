import * as anchor from '@coral-xyz/anchor';
import { Ed25519Program, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import BN from 'bn.js';
import crypto from 'crypto';
import nacl from 'tweetnacl';

import { MEISHI_IDL } from './idl/meishi-idl.js';
import type {
  CreatePassportParams,
  MeishiConfig,
  RecordAuditParams,
  UpdateMandateParams,
} from './types.js';

const DEFAULT_PROGRAM_ID = '6uejE3hDz3ZNHW7P4uHQEHS6fHAQ4vLJg7rx4VBYwpyK';
const DEFAULT_KAMIYO_PROGRAM_ID = '3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr';

function u32le(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value >>> 0, 0);
  return buf;
}

function bnU64(value: number): BN {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('u64 values must be non-negative safe integers');
  }
  return new BN(value);
}

function bnI64(value: number): BN {
  if (!Number.isSafeInteger(value)) {
    throw new Error('i64 values must be safe integers');
  }
  return new BN(value);
}

function fixedBytes(name: string, value: number[], len: number): Buffer {
  if (!Array.isArray(value) || value.length !== len) {
    throw new Error(`${name} must be a byte array of length ${len}`);
  }
  for (const b of value) {
    if (!Number.isInteger(b) || b < 0 || b > 255) {
      throw new Error(`${name} must be a byte array`);
    }
  }
  return Buffer.from(value);
}

function computeMandateMessageHash(params: {
  passport: PublicKey;
  version: number;
  spendingLimitUsd: number;
  dailyLimitUsd: number;
  monthlyLimitUsd: number;
  categoryWhitelist: number[];
  merchantWhitelistHash: number[];
  requiresHumanApprovalAbove: number;
  geoRestrictions: number;
  validFrom: number;
  validUntil: number;
}): Buffer {
  const parts = [
    Buffer.from('meishi-mandate-v1'),
    params.passport.toBuffer(),
    u32le(params.version),
    bnU64(params.spendingLimitUsd).toArrayLike(Buffer, 'le', 8),
    bnU64(params.dailyLimitUsd).toArrayLike(Buffer, 'le', 8),
    bnU64(params.monthlyLimitUsd).toArrayLike(Buffer, 'le', 8),
    fixedBytes('categoryWhitelist', params.categoryWhitelist, 32),
    fixedBytes('merchantWhitelistHash', params.merchantWhitelistHash, 32),
    bnU64(params.requiresHumanApprovalAbove).toArrayLike(Buffer, 'le', 8),
    Buffer.from([params.geoRestrictions & 0xff]),
    bnI64(params.validFrom).toTwos(64).toArrayLike(Buffer, 'le', 8),
    bnI64(params.validUntil).toTwos(64).toArrayLike(Buffer, 'le', 8),
  ];

  return crypto.createHash('sha256').update(Buffer.concat(parts)).digest();
}

export class MeishiWriter {
  readonly programId: PublicKey;
  readonly kamiyoProgramId: PublicKey;
  private readonly keypair: anchor.web3.Keypair;
  private readonly provider: anchor.AnchorProvider;
  private readonly program: anchor.Program;

  constructor(config: MeishiConfig) {
    this.programId = new PublicKey(config.programId ?? DEFAULT_PROGRAM_ID);
    this.kamiyoProgramId = new PublicKey(config.kamiyoProgramId ?? DEFAULT_KAMIYO_PROGRAM_ID);
    this.keypair = config.keypair;
    this.provider = new anchor.AnchorProvider(
      config.connection,
      new anchor.Wallet(config.keypair),
      { commitment: 'confirmed' }
    );
    const idl = { ...(MEISHI_IDL as unknown as anchor.Idl), address: this.programId.toBase58() };
    this.program = new anchor.Program(idl, this.provider);
  }

  getPassportPDA(agentIdentity: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('meishi'), agentIdentity.toBuffer()],
      this.programId
    );
  }

  getMandatePDA(passportAddress: PublicKey, version: number): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('mandate'), passportAddress.toBuffer(), u32le(version)],
      this.programId
    );
  }

  getAuditPDA(passportAddress: PublicKey, nonce: number): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('audit'), passportAddress.toBuffer(), u32le(nonce)],
      this.programId
    );
  }

  getOracleRegistryPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('oracle_registry')],
      this.kamiyoProgramId
    );
  }

  async createPassport(params: CreatePassportParams): Promise<{
    passportAddress: string;
    signature: string;
  }> {
    const [passport] = this.getPassportPDA(params.agentIdentity);
    const signature = await this.program.methods
      .createMeishi(params.jurisdiction)
      .accounts({
        owner: this.provider.wallet.publicKey,
        agentIdentity: params.agentIdentity,
        passport,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return { passportAddress: passport.toBase58(), signature };
  }

  async updateMandate(params: UpdateMandateParams): Promise<{
    mandateAddress: string;
    signature: string;
    mandateHash: number[];
  }> {
    const principal = this.provider.wallet.publicKey;
    const passportState = await (this.program.account as any).meishiPassport.fetch(params.passportAddress);
    const nextVersion = Number(passportState.mandateVersion) + 1;

    const categoryWhitelist = Array.from(
      fixedBytes('categoryWhitelist', params.categoryWhitelist, 32)
    );
    const merchantWhitelistHash = Array.from(
      fixedBytes('merchantWhitelistHash', params.merchantWhitelistHash, 32)
    );

    const messageHash = computeMandateMessageHash({
      passport: params.passportAddress,
      version: nextVersion,
      spendingLimitUsd: params.spendingLimitUsd,
      dailyLimitUsd: params.dailyLimitUsd,
      monthlyLimitUsd: params.monthlyLimitUsd,
      categoryWhitelist,
      merchantWhitelistHash,
      requiresHumanApprovalAbove: params.requiresHumanApprovalAbove,
      geoRestrictions: params.geoRestrictions,
      validFrom: params.validFrom,
      validUntil: params.validUntil,
    });

    const signatureBytes = nacl.sign.detached(messageHash, this.keypair.secretKey);
    const edIx = Ed25519Program.createInstructionWithPublicKey({
      publicKey: principal.toBytes(),
      message: messageHash,
      signature: signatureBytes,
    });

    const [mandate] = this.getMandatePDA(params.passportAddress, nextVersion);

    const mandateIx = await this.program.methods
      .updateMandate(
        bnU64(params.spendingLimitUsd),
        bnU64(params.dailyLimitUsd),
        bnU64(params.monthlyLimitUsd),
        categoryWhitelist,
        merchantWhitelistHash,
        bnU64(params.requiresHumanApprovalAbove),
        params.geoRestrictions,
        bnI64(params.validFrom),
        bnI64(params.validUntil),
        Array.from(signatureBytes)
      )
      .accounts({
        principal,
        passport: params.passportAddress,
        mandate,
        instructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const tx = new Transaction().add(edIx, mandateIx);
    const signature = await this.provider.sendAndConfirm(tx, [], { commitment: 'confirmed' });

    return { mandateAddress: mandate.toBase58(), signature, mandateHash: Array.from(messageHash) };
  }

  async recordAudit(params: RecordAuditParams): Promise<{
    auditAddress: string;
    signature: string;
  }> {
    const passportState = await (this.program.account as any).meishiPassport.fetch(params.passportAddress);
    const nonce = Number(passportState.auditNonce);
    const [audit] = this.getAuditPDA(params.passportAddress, nonce);
    const [oracleRegistry] = this.getOracleRegistryPDA();

    const findingsHash = Array.from(fixedBytes('findingsHash', params.findingsHash, 32));

    const signature = await this.program.methods
      .recordAudit(
        params.auditType,
        params.complianceScoreAfter,
        findingsHash,
        params.findingsUal,
        params.passed
      )
      .accounts({
        oracle: this.provider.wallet.publicKey,
        passport: params.passportAddress,
        audit,
        oracleRegistry,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return { auditAddress: audit.toBase58(), signature };
  }
}
