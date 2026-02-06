import { PublicKey, Keypair } from '@solana/web3.js';
import * as nacl from 'tweetnacl';
import { MeishiClient } from './client.js';
import { PassportManager } from './passport.js';
import { MandateManager } from './mandate.js';
import type {
  MeishiPresentation,
  MeishiHeaders,
  VerificationResult,
  ExchangeResult,
} from './types.js';

/**
 * Meishi Exchange Protocol — the handshake between agent and counterparty.
 *
 * Before any transaction, both parties present and verify Meishi credentials.
 */
export class MeishiExchange {
  private passports: PassportManager;
  private mandates: MandateManager;

  constructor(private client: MeishiClient) {
    this.passports = new PassportManager(client);
    this.mandates = new MandateManager(client);
  }

  /**
   * Present your Meishi to a counterparty.
   * Generates a signed presentation object for HTTP or direct exchange.
   */
  async present(
    agentIdentity: PublicKey,
    requestBody?: Buffer
  ): Promise<MeishiPresentation> {
    const [passportPDA] = this.client.getPassportPDA(agentIdentity);
    const passport = await this.client.fetchPassport(passportPDA);

    if (!passport) {
      throw new Error('Passport not found');
    }

    // Sign the request body (or empty message) with keypair
    const message = requestBody ?? Buffer.from(passportPDA.toBase58());
    const signature = nacl.sign.detached(message, this.client.keypair.secretKey);

    return {
      passportAddress: passportPDA.toBase58(),
      mandateVersion: passport.mandateVersion,
      signature: Buffer.from(signature).toString('base64'),
    };
  }

  /**
   * Convert a presentation to HTTP headers for x402 integration.
   */
  toHeaders(presentation: MeishiPresentation): MeishiHeaders {
    const headers: MeishiHeaders = {
      'x-meishi-passport': presentation.passportAddress,
      'x-meishi-mandate-version': String(presentation.mandateVersion),
      'x-meishi-signature': presentation.signature,
    };

    if (presentation.complianceProof) {
      headers['x-meishi-compliance-proof'] = presentation.complianceProof;
    }
    if (presentation.liabilityRef) {
      headers['x-meishi-liability-ref'] = presentation.liabilityRef;
    }

    return headers;
  }

  /**
   * Parse Meishi headers from an incoming HTTP request.
   */
  static fromHeaders(headers: Record<string, string | undefined>): MeishiPresentation | null {
    const passport = headers['x-meishi-passport'];
    const mandateVersion = headers['x-meishi-mandate-version'];
    const signature = headers['x-meishi-signature'];

    if (!passport || !mandateVersion || !signature) {
      return null;
    }

    // Validate as a valid Solana public key
    try {
      new PublicKey(passport);
    } catch {
      return null;
    }

    const parsedVersion = parseInt(mandateVersion, 10);
    if (isNaN(parsedVersion) || parsedVersion < 0) {
      return null;
    }

    return {
      passportAddress: passport,
      mandateVersion: parsedVersion,
      complianceProof: headers['x-meishi-compliance-proof'],
      signature,
      liabilityRef: headers['x-meishi-liability-ref'],
    };
  }

  /**
   * Verify an incoming Meishi presentation.
   * Checks: passport exists, not suspended, mandate valid, score threshold.
   */
  async verify(
    presentation: MeishiPresentation,
    options: {
      minComplianceScore?: number;
      requiredJurisdiction?: number;
      maxTransactionUsd?: number;
      productCategory?: number;
    } = {}
  ): Promise<VerificationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    const passportAddress = new PublicKey(presentation.passportAddress);
    const passport = await this.client.fetchPassport(passportAddress);

    if (!passport) {
      return { valid: false, errors: ['Passport not found'], warnings };
    }

    if (passport.suspended) {
      errors.push(`Passport suspended: reason ${passport.suspensionReason}`);
    }

    // Check mandate validity
    const now = Math.floor(Date.now() / 1000);
    if (passport.mandateExpires.toNumber() <= now) {
      errors.push('Mandate expired');
    }
    if (passport.mandateHash.every((b) => b === 0)) {
      errors.push('No mandate configured');
    }

    // Check compliance score threshold
    const minScore = options.minComplianceScore ?? 0;
    if (passport.complianceScore < minScore) {
      errors.push(`Compliance score ${passport.complianceScore} below threshold ${minScore}`);
    }

    // Check jurisdiction
    if (options.requiredJurisdiction !== undefined) {
      if (passport.jurisdiction !== options.requiredJurisdiction) {
        warnings.push(`Jurisdiction mismatch: passport=${passport.jurisdiction}, required=${options.requiredJurisdiction}`);
      }
    }

    // Check mandate spending limits if transaction amount provided
    if (options.maxTransactionUsd !== undefined || options.productCategory !== undefined) {
      const mandate = await this.client.getMandate(
        passportAddress,
        passport.mandateVersion
      );

      if (mandate && !mandate.revoked) {
        if (options.maxTransactionUsd !== undefined) {
          const amountMicro = Math.floor(options.maxTransactionUsd * 1_000_000);
          if (!this.mandates.checkSpendingLimit(mandate, amountMicro)) {
            errors.push('Transaction exceeds spending limit');
          }
          if (this.mandates.requiresHumanApproval(mandate, amountMicro)) {
            warnings.push('Transaction requires human approval');
          }
        }

        if (options.productCategory !== undefined) {
          if (!this.mandates.checkCategory(mandate, options.productCategory)) {
            errors.push(`Category ${options.productCategory} not authorized`);
          }
        }
      }
    }

    // Dispute rate warning
    const disputeRate = this.passports.getDisputeRate(passport);
    if (disputeRate > 0.1) {
      warnings.push(`High dispute rate: ${(disputeRate * 100).toFixed(1)}%`);
    }

    return {
      valid: errors.length === 0,
      passport,
      errors,
      warnings,
    };
  }
}
