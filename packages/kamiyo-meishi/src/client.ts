import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import type {
  MeishiConfig,
  MeishiPassport,
  MeishiMandate,
  MeishiAudit,
  LiabilityAllocation,
} from './types.js';

const DEFAULT_PROGRAM_ID = '6uejE3hDz3ZNHW7P4uHQEHS6fHAQ4vLJg7rx4VBYwpyK';

// TODO(anchor): validate 8-byte account discriminators before deserializing.
// Currently only owner is checked. Add discriminator validation once IDL is generated.

export class MeishiClient {
  readonly connection: Connection;
  readonly keypair: Keypair;
  readonly programId: PublicKey;

  constructor(config: MeishiConfig) {
    this.connection = config.connection;
    this.keypair = config.keypair;
    this.programId = new PublicKey(config.programId ?? DEFAULT_PROGRAM_ID);
  }


  getPassportPDA(agentIdentity: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('meishi'), agentIdentity.toBuffer()],
      this.programId
    );
  }

  getMandatePDA(passportAddress: PublicKey, version: number): [PublicKey, number] {
    const versionBuf = Buffer.alloc(4);
    versionBuf.writeUInt32LE(version);
    return PublicKey.findProgramAddressSync(
      [Buffer.from('mandate'), passportAddress.toBuffer(), versionBuf],
      this.programId
    );
  }

  getAuditPDA(passportAddress: PublicKey, nonce: number): [PublicKey, number] {
    const nonceBuf = Buffer.alloc(4);
    nonceBuf.writeUInt32LE(nonce);
    return PublicKey.findProgramAddressSync(
      [Buffer.from('audit'), passportAddress.toBuffer(), nonceBuf],
      this.programId
    );
  }

  getLiabilityPDA(passportAddress: PublicKey, counterparty: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('liability'), passportAddress.toBuffer(), counterparty.toBuffer()],
      this.programId
    );
  }


  async getPassport(agentIdentity: PublicKey): Promise<MeishiPassport | null> {
    const [pda] = this.getPassportPDA(agentIdentity);
    return this.fetchPassport(pda);
  }

  async fetchPassport(address: PublicKey): Promise<MeishiPassport | null> {
    const info = await this.connection.getAccountInfo(address);
    if (!info || !info.owner.equals(this.programId)) return null;
    return this.deserializePassport(info.data);
  }

  async getMandate(passportAddress: PublicKey, version: number): Promise<MeishiMandate | null> {
    const [pda] = this.getMandatePDA(passportAddress, version);
    const info = await this.connection.getAccountInfo(pda);
    if (!info || !info.owner.equals(this.programId)) return null;
    return this.deserializeMandate(info.data);
  }

  async getLatestMandate(passportAddress: PublicKey): Promise<MeishiMandate | null> {
    const passport = await this.fetchPassport(passportAddress);
    if (!passport || passport.mandateVersion === 0) return null;
    return this.getMandate(passportAddress, passport.mandateVersion);
  }

  async getAudit(passportAddress: PublicKey, nonce: number): Promise<MeishiAudit | null> {
    const [pda] = this.getAuditPDA(passportAddress, nonce);
    const info = await this.connection.getAccountInfo(pda);
    if (!info || !info.owner.equals(this.programId)) return null;
    return this.deserializeAudit(info.data);
  }

  async getLiability(
    passportAddress: PublicKey,
    counterparty: PublicKey
  ): Promise<LiabilityAllocation | null> {
    const [pda] = this.getLiabilityPDA(passportAddress, counterparty);
    const info = await this.connection.getAccountInfo(pda);
    if (!info || !info.owner.equals(this.programId)) return null;
    return this.deserializeLiability(info.data);
  }


  async verifyPassport(agentIdentity: PublicKey): Promise<{
    exists: boolean;
    active: boolean;
    compliant: boolean;
    score: number;
    suspended: boolean;
    mandateValid: boolean;
    errors: string[];
  }> {
    const passport = await this.getPassport(agentIdentity);
    const errors: string[] = [];
    const now = Math.floor(Date.now() / 1000);

    if (!passport) {
      return {
        exists: false,
        active: false,
        compliant: false,
        score: 0,
        suspended: false,
        mandateValid: false,
        errors: ['Passport not found'],
      };
    }

    if (passport.suspended) {
      errors.push(`Suspended: reason ${passport.suspensionReason}`);
    }

    const mandateValid =
      passport.mandateExpires.toNumber() > now &&
      !passport.mandateHash.every((b) => b === 0);

    if (!mandateValid) {
      errors.push('No valid mandate');
    }

    const compliant = passport.complianceScore > 0 && !passport.suspended && mandateValid;

    return {
      exists: true,
      active: !passport.suspended,
      compliant,
      score: passport.complianceScore,
      suspended: passport.suspended,
      mandateValid,
      errors,
    };
  }

  async verifyMandateLimits(
    passportAddress: PublicKey,
    transactionAmountUsd: number,
    productCategory: number
  ): Promise<{
    withinLimits: boolean;
    categoryAuthorized: boolean;
    requiresHumanApproval: boolean;
    errors: string[];
  }> {
    const passport = await this.fetchPassport(passportAddress);
    if (!passport) {
      return {
        withinLimits: false,
        categoryAuthorized: false,
        requiresHumanApproval: false,
        errors: ['Passport not found'],
      };
    }

    const mandate = await this.getLatestMandate(passportAddress);
    if (!mandate || mandate.revoked) {
      return {
        withinLimits: false,
        categoryAuthorized: false,
        requiresHumanApproval: false,
        errors: ['No valid mandate'],
      };
    }

    const errors: string[] = [];
    const amountMicroUsd = BigInt(Math.floor(transactionAmountUsd * 1_000_000));
    const spendingLimit = mandate.spendingLimitUsd.toNumber();

    const withinLimits = amountMicroUsd <= BigInt(spendingLimit);
    if (!withinLimits) {
      errors.push(`Amount $${transactionAmountUsd} exceeds per-tx limit`);
    }

    // Check category bitmap
    const byteIndex = Math.floor(productCategory / 8);
    const bitIndex = productCategory % 8;
    const categoryAuthorized =
      byteIndex < mandate.categoryWhitelist.length &&
      (mandate.categoryWhitelist[byteIndex] & (1 << bitIndex)) !== 0;

    if (!categoryAuthorized) {
      errors.push(`Category ${productCategory} not authorized`);
    }

    const requiresHumanApproval =
      amountMicroUsd > BigInt(mandate.requiresHumanApprovalAbove.toNumber());

    return {
      withinLimits,
      categoryAuthorized,
      requiresHumanApproval,
      errors,
    };
  }


  private deserializePassport(data: Buffer): MeishiPassport | null {
    try {
      // Skip 8-byte discriminator
      const offset = 8;
      // Minimum size: 8 (discriminator) + 231 (fields) = 239
      if (data.length < 239) return null;
      const agentIdentity = new PublicKey(data.subarray(offset, offset + 32));
      const issuer = new PublicKey(data.subarray(offset + 32, offset + 64));
      const principal = new PublicKey(data.subarray(offset + 64, offset + 96));
      const kamonHash = Array.from(data.subarray(offset + 96, offset + 128));
      const complianceClass = data[offset + 128];
      const complianceScore = data.readInt16LE(offset + 129);
      const jurisdiction = data[offset + 131];
      const mandateHash = Array.from(data.subarray(offset + 132, offset + 164));
      const mandateExpires = new BN(data.subarray(offset + 164, offset + 172), 'le');
      const mandateVersion = data.readUInt32LE(offset + 172);
      const totalTransactions = new BN(data.subarray(offset + 176, offset + 184), 'le');
      const totalVolumeUsd = new BN(data.subarray(offset + 184, offset + 192), 'le');
      const disputesFiled = data.readUInt32LE(offset + 192);
      const disputesLost = data.readUInt32LE(offset + 196);
      const lastAudit = new BN(data.subarray(offset + 200, offset + 208), 'le');
      const auditNonce = data.readUInt32LE(offset + 208);
      const suspended = data[offset + 212] === 1;
      const suspensionReason = data[offset + 213];
      const createdAt = new BN(data.subarray(offset + 214, offset + 222), 'le');
      const updatedAt = new BN(data.subarray(offset + 222, offset + 230), 'le');
      const bump = data[offset + 230];

      return {
        agentIdentity,
        issuer,
        principal,
        kamonHash,
        complianceClass,
        complianceScore,
        jurisdiction,
        mandateHash,
        mandateExpires,
        mandateVersion,
        totalTransactions,
        totalVolumeUsd,
        disputesFiled,
        disputesLost,
        lastAudit,
        auditNonce,
        suspended,
        suspensionReason,
        createdAt,
        updatedAt,
        bump,
      };
    } catch {
      return null;
    }
  }

  private deserializeMandate(data: Buffer): MeishiMandate | null {
    try {
      const offset = 8;
      if (data.length < 231) return null;
      const meishi = new PublicKey(data.subarray(offset, offset + 32));
      const version = data.readUInt32LE(offset + 32);
      const principalSignature = Array.from(data.subarray(offset + 36, offset + 100));
      const spendingLimitUsd = new BN(data.subarray(offset + 100, offset + 108), 'le');
      const dailyLimitUsd = new BN(data.subarray(offset + 108, offset + 116), 'le');
      const monthlyLimitUsd = new BN(data.subarray(offset + 116, offset + 124), 'le');
      const categoryWhitelist = Array.from(data.subarray(offset + 124, offset + 156));
      const merchantWhitelistHash = Array.from(data.subarray(offset + 156, offset + 188));
      const requiresHumanApprovalAbove = new BN(data.subarray(offset + 188, offset + 196), 'le');
      const geoRestrictions = data[offset + 196];
      const validFrom = new BN(data.subarray(offset + 197, offset + 205), 'le');
      const validUntil = new BN(data.subarray(offset + 205, offset + 213), 'le');
      const revoked = data[offset + 213] === 1;
      const revokedAt = new BN(data.subarray(offset + 214, offset + 222), 'le');
      const bump = data[offset + 222];

      return {
        meishi,
        version,
        principalSignature,
        spendingLimitUsd,
        dailyLimitUsd,
        monthlyLimitUsd,
        categoryWhitelist,
        merchantWhitelistHash,
        requiresHumanApprovalAbove,
        geoRestrictions,
        validFrom,
        validUntil,
        revoked,
        revokedAt,
        bump,
      };
    } catch {
      return null;
    }
  }

  private deserializeAudit(data: Buffer): MeishiAudit | null {
    try {
      const offset = 8;
      // min: 8 disc + 32 meishi + 32 auditor + 1 type + 2+2 scores + 32 hash + 4 strlen + 0 str + 1 bool + 8 ts + 1 bump = 123
      if (data.length < 123) return null;
      const meishi = new PublicKey(data.subarray(offset, offset + 32));
      const auditor = new PublicKey(data.subarray(offset + 32, offset + 64));
      const auditType = data[offset + 64];
      const complianceScoreBefore = data.readInt16LE(offset + 65);
      const complianceScoreAfter = data.readInt16LE(offset + 67);
      const findingsHash = Array.from(data.subarray(offset + 69, offset + 101));
      // String has 4-byte length prefix
      const ualLen = data.readUInt32LE(offset + 101);
      if (ualLen > 256 || offset + 105 + ualLen > data.length) return null;
      const findingsUal = data.subarray(offset + 105, offset + 105 + ualLen).toString('utf8');
      const nextOffset = offset + 105 + ualLen;
      const passed = data[nextOffset] === 1;
      const timestamp = new BN(data.subarray(nextOffset + 1, nextOffset + 9), 'le');
      const bump = data[nextOffset + 9];

      return {
        meishi,
        auditor,
        auditType,
        complianceScoreBefore,
        complianceScoreAfter,
        findingsHash,
        findingsUal,
        passed,
        timestamp,
        bump,
      };
    } catch {
      return null;
    }
  }

  private deserializeLiability(data: Buffer): LiabilityAllocation | null {
    try {
      const offset = 8;
      if (data.length < 137) return null; // 8 + 129 fields
      const meishi = new PublicKey(data.subarray(offset, offset + 32));
      const counterparty = new PublicKey(data.subarray(offset + 32, offset + 64));
      const consumerLiabilityBps = data.readUInt16LE(offset + 64);
      const developerLiabilityBps = data.readUInt16LE(offset + 66);
      const merchantLiabilityBps = data.readUInt16LE(offset + 68);
      const platformLiabilityBps = data.readUInt16LE(offset + 70);
      const maxLiabilityUsd = new BN(data.subarray(offset + 72, offset + 80), 'le');
      const arbitrationOracle = new PublicKey(data.subarray(offset + 80, offset + 112));
      const agreedAt = new BN(data.subarray(offset + 112, offset + 120), 'le');
      const expiresAt = new BN(data.subarray(offset + 120, offset + 128), 'le');
      const bump = data[offset + 128];

      return {
        meishi,
        counterparty,
        consumerLiabilityBps,
        developerLiabilityBps,
        merchantLiabilityBps,
        platformLiabilityBps,
        maxLiabilityUsd,
        arbitrationOracle,
        agreedAt,
        expiresAt,
        bump,
      };
    } catch {
      return null;
    }
  }
}
