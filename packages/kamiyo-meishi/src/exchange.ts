import { PublicKey, Keypair } from '@solana/web3.js';
import * as nacl from 'tweetnacl';
import crypto from 'crypto';
import { MeishiClient } from './client.js';
import { PassportManager } from './passport.js';
import { MandateManager } from './mandate.js';
import { sha256HexCanonicalJson } from './dkg/integrity.js';
import type {
  MeishiPresentation,
  MeishiHeaders,
  VerificationResult,
  ExchangeResult,
} from './types.js';

function isStrictBase64(value: string): boolean {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  return value.length % 4 === 0;
}

function sha256Hex(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function buildCanonicalSignatureMessage(presentation: {
  passportAddress: string;
  mandateVersion: number;
  signatureTimestamp: number;
  signatureNonce: string;
  signatureMethod: string;
  signaturePath: string;
  signatureBodyHash: string;
}): string {
  return [
    'meishi-signature-v1',
    `passport=${presentation.passportAddress}`,
    `mandateVersion=${presentation.mandateVersion}`,
    `timestamp=${presentation.signatureTimestamp}`,
    `nonce=${presentation.signatureNonce}`,
    `method=${presentation.signatureMethod.toUpperCase()}`,
    `path=${presentation.signaturePath}`,
    `bodySha256=${presentation.signatureBodyHash}`,
  ].join('\n');
}

function isValidHex64(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

function isValidNonce(value: string): boolean {
  return /^[a-zA-Z0-9_-]{8,128}$/.test(value);
}

function isValidAssertionUal(value: string): boolean {
  if (value.length < 8 || value.length > 512) return false;
  if (/\s/.test(value)) return false;
  return (
    value.startsWith('did:dkg:') ||
    value.startsWith('urn:') ||
    value.startsWith('https://') ||
    value.startsWith('http://')
  );
}

/**
 * Meishi credential presentation and verification for HTTP exchanges.
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
    requestBody?: Buffer,
    context?: {
      method?: string;
      path?: string;
      timestamp?: number;
      nonce?: string;
      bodyHash?: string;
      signatureMessage?: Buffer | string;
      assertionUal?: string;
      assertionHash?: string;
      privateAssertionUal?: string;
    }
  ): Promise<MeishiPresentation> {
    const [passportPDA] = this.client.getPassportPDA(agentIdentity);
    const passport = await this.client.fetchPassport(passportPDA);

    if (!passport) {
      throw new Error('Passport not found');
    }

    const signatureTimestamp = context?.timestamp ?? Math.floor(Date.now() / 1000);
    const signatureNonce =
      context?.nonce ?? crypto.randomBytes(16).toString('base64url');
    const signatureMethod = (context?.method ?? 'POST').toUpperCase();
    const signaturePath = context?.path ?? '/';
    const signatureBodyHash =
      context?.bodyHash ??
      sha256Hex(requestBody ?? Buffer.alloc(0));
    const canonicalMessage = buildCanonicalSignatureMessage({
      passportAddress: passportPDA.toBase58(),
      mandateVersion: passport.mandateVersion,
      signatureTimestamp,
      signatureNonce,
      signatureMethod,
      signaturePath,
      signatureBodyHash,
    });
    const message =
      typeof context?.signatureMessage === 'string'
        ? Buffer.from(context.signatureMessage)
        : context?.signatureMessage ?? Buffer.from(canonicalMessage);
    const signature = nacl.sign.detached(message, this.client.keypair.secretKey);

    return {
      passportAddress: passportPDA.toBase58(),
      mandateVersion: passport.mandateVersion,
      signature: Buffer.from(signature).toString('base64'),
      assertionUal: context?.assertionUal,
      assertionHash: context?.assertionHash?.toLowerCase(),
      privateAssertionUal: context?.privateAssertionUal,
      signatureTimestamp,
      signatureNonce,
      signatureMethod,
      signaturePath,
      signatureBodyHash,
    };
  }

  /**
   * Convert a presentation to HTTP headers for x402 integration.
   */
  toHeaders(
    presentation: MeishiPresentation,
    options: { includeLegacyComplianceProof?: boolean } = {}
  ): MeishiHeaders {
    const headers: MeishiHeaders = {
      'x-meishi-passport': presentation.passportAddress,
      'x-meishi-mandate-version': String(presentation.mandateVersion),
      'x-meishi-signature': presentation.signature,
    };

    if (options.includeLegacyComplianceProof && presentation.complianceProof) {
      headers['x-meishi-compliance-proof'] = presentation.complianceProof;
    }
    if (presentation.assertionUal) {
      headers['x-meishi-assertion-ual'] = presentation.assertionUal;
    }
    if (presentation.assertionHash) {
      headers['x-meishi-assertion-hash'] = presentation.assertionHash.toLowerCase();
    }
    if (presentation.privateAssertionUal) {
      headers['x-meishi-private-assertion-ual'] = presentation.privateAssertionUal;
    }
    if (presentation.signatureTimestamp !== undefined) {
      headers['x-meishi-signature-ts'] = String(presentation.signatureTimestamp);
    }
    if (presentation.signatureNonce) {
      headers['x-meishi-signature-nonce'] = presentation.signatureNonce;
    }
    if (presentation.signatureMethod) {
      headers['x-meishi-signature-method'] = presentation.signatureMethod;
    }
    if (presentation.signaturePath) {
      headers['x-meishi-signature-path'] = presentation.signaturePath;
    }
    if (presentation.signatureBodyHash) {
      headers['x-meishi-signature-body-sha256'] = presentation.signatureBodyHash;
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

    const parsedVersion = Number(mandateVersion);
    if (!Number.isSafeInteger(parsedVersion) || parsedVersion < 0) {
      return null;
    }

    if (!isStrictBase64(signature)) {
      return null;
    }

    const signatureTimestampRaw = headers['x-meishi-signature-ts'];
    const signatureNonce = headers['x-meishi-signature-nonce'];
    const signatureMethod = headers['x-meishi-signature-method'];
    const signaturePath = headers['x-meishi-signature-path'];
    const signatureBodyHash = headers['x-meishi-signature-body-sha256'];
    const assertionUal = headers['x-meishi-assertion-ual'];
    const assertionHash = headers['x-meishi-assertion-hash'];
    const privateAssertionUal = headers['x-meishi-private-assertion-ual'];

    if (assertionUal && !isValidAssertionUal(assertionUal)) return null;
    if (assertionHash && !isValidHex64(assertionHash)) return null;
    if (privateAssertionUal && !isValidAssertionUal(privateAssertionUal)) return null;
    if ((assertionHash || privateAssertionUal) && !assertionUal) return null;

    const hasAnyReplayField = Boolean(
      signatureTimestampRaw || signatureNonce || signatureMethod || signaturePath || signatureBodyHash
    );

    let signatureTimestamp: number | undefined;
    if (hasAnyReplayField) {
      if (
        !signatureTimestampRaw ||
        !signatureNonce ||
        !signatureMethod ||
        !signaturePath ||
        !signatureBodyHash
      ) {
        return null;
      }

      const parsedTs = Number(signatureTimestampRaw);
      if (!Number.isSafeInteger(parsedTs) || parsedTs <= 0) {
        return null;
      }
      if (!isValidNonce(signatureNonce)) {
        return null;
      }
      if (!/^[A-Z]+$/i.test(signatureMethod)) {
        return null;
      }
      if (!signaturePath.startsWith('/')) {
        return null;
      }
      if (!isValidHex64(signatureBodyHash)) {
        return null;
      }
      signatureTimestamp = parsedTs;
    }

    return {
      passportAddress: passport,
      mandateVersion: parsedVersion,
      complianceProof: headers['x-meishi-compliance-proof'],
      assertionUal,
      assertionHash: assertionHash?.toLowerCase(),
      privateAssertionUal,
      signature,
      signatureTimestamp,
      signatureNonce,
      signatureMethod,
      signaturePath,
      signatureBodyHash,
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
      signatureMessage?: Buffer | string;
      nowTimestamp?: number;
      maxSignatureAgeSec?: number;
      allowedClockSkewSec?: number;
      expectedMethod?: string;
      expectedPath?: string;
      expectedBody?: Buffer | string;
      requireAssertionReference?: boolean;
      requireAssertionHash?: boolean;
      allowedAssertionUalPrefixes?: string[];
      allowLegacyComplianceProof?: boolean;
      resolveAssertion?: (ual: string) => Promise<unknown>;
      nonceReplayGuard?: (params: {
        passportAddress: string;
        nonce: string;
        timestamp: number;
      }) => Promise<boolean> | boolean;
    } = {}
  ): Promise<VerificationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const passportAddress = new PublicKey(presentation.passportAddress);
    const passport = await this.client.fetchPassport(passportAddress);

    if (!passport) {
      return { valid: false, errors: ['Passport not found'], warnings };
    }

    // Verify detached ed25519 signature against principal or issuer key.
    let signatureBytes: Buffer;
    try {
      signatureBytes = Buffer.from(presentation.signature, 'base64');
    } catch {
      return { valid: false, errors: ['Invalid signature encoding'], warnings };
    }

    if (signatureBytes.length !== nacl.sign.signatureLength) {
      return { valid: false, errors: ['Invalid signature length'], warnings };
    }

    let message: Buffer;
    if (options.signatureMessage !== undefined) {
      message =
        typeof options.signatureMessage === 'string'
          ? Buffer.from(options.signatureMessage)
          : options.signatureMessage;
    } else if (
      presentation.signatureTimestamp !== undefined &&
      presentation.signatureNonce &&
      presentation.signatureMethod &&
      presentation.signaturePath &&
      presentation.signatureBodyHash
    ) {
      if (!isValidNonce(presentation.signatureNonce)) {
        errors.push('Invalid signature nonce');
      }
      if (!isValidHex64(presentation.signatureBodyHash)) {
        errors.push('Invalid signature body hash');
      }

      const now = options.nowTimestamp ?? Math.floor(Date.now() / 1000);
      const maxAge = options.maxSignatureAgeSec ?? 300;
      const skew = options.allowedClockSkewSec ?? 60;
      if (presentation.signatureTimestamp > now + skew) {
        errors.push('Signature timestamp is in the future');
      } else if (now - presentation.signatureTimestamp > maxAge) {
        errors.push('Signature expired');
      }

      if (options.expectedMethod) {
        if (presentation.signatureMethod.toUpperCase() !== options.expectedMethod.toUpperCase()) {
          errors.push('Signed method does not match request method');
        }
      }
      if (options.expectedPath) {
        if (presentation.signaturePath !== options.expectedPath) {
          errors.push('Signed path does not match request path');
        }
      }
      if (options.expectedBody !== undefined) {
        const expectedBodyBuffer =
          typeof options.expectedBody === 'string'
            ? Buffer.from(options.expectedBody)
            : options.expectedBody;
        const expectedHash = sha256Hex(expectedBodyBuffer);
        if (expectedHash !== presentation.signatureBodyHash) {
          errors.push('Signed body hash mismatch');
        }
      }

      if (options.nonceReplayGuard) {
        const fresh = await options.nonceReplayGuard({
          passportAddress: presentation.passportAddress,
          nonce: presentation.signatureNonce,
          timestamp: presentation.signatureTimestamp,
        });
        if (!fresh) {
          errors.push('Replay detected: nonce has already been used');
        }
      } else {
        warnings.push('No nonce replay guard configured');
      }

      const canonicalMessage = buildCanonicalSignatureMessage({
        passportAddress: presentation.passportAddress,
        mandateVersion: presentation.mandateVersion,
        signatureTimestamp: presentation.signatureTimestamp,
        signatureNonce: presentation.signatureNonce,
        signatureMethod: presentation.signatureMethod,
        signaturePath: presentation.signaturePath,
        signatureBodyHash: presentation.signatureBodyHash,
      });
      message = Buffer.from(canonicalMessage);
    } else {
      errors.push('Missing replay-safe signature fields');
      message = Buffer.from(presentation.passportAddress);
    }
    const principalOk = nacl.sign.detached.verify(
      message,
      signatureBytes,
      passport.principal.toBytes()
    );
    const issuerOk = nacl.sign.detached.verify(
      message,
      signatureBytes,
      passport.issuer.toBytes()
    );
    if (!principalOk && !issuerOk) {
      errors.push('Signature verification failed');
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

    const allowLegacyComplianceProof = options.allowLegacyComplianceProof ?? false;
    if (presentation.complianceProof) {
      if (allowLegacyComplianceProof) {
        warnings.push('Deprecated compliance proof header used; prefer DKG assertion references');
      } else {
        errors.push('Legacy compliance proof header is not accepted; use DKG assertion references');
      }
    }

    const requireAssertionReference = options.requireAssertionReference ?? false;
    const requireAssertionHash = options.requireAssertionHash ?? false;
    const allowedPrefixes = options.allowedAssertionUalPrefixes ?? ['did:dkg:'];

    if (requireAssertionReference && !presentation.assertionUal) {
      errors.push('Missing compliance assertion reference');
    }
    if (presentation.assertionUal) {
      if (!isValidAssertionUal(presentation.assertionUal)) {
        errors.push('Invalid compliance assertion UAL');
      } else if (!allowedPrefixes.some((prefix) => presentation.assertionUal!.startsWith(prefix))) {
        warnings.push('Compliance assertion UAL uses unexpected prefix');
      }
    }
    if ((presentation.assertionHash || presentation.privateAssertionUal) && !presentation.assertionUal) {
      errors.push('Assertion hash/private assertion requires a public assertion UAL');
    }
    if (requireAssertionHash && !presentation.assertionHash) {
      errors.push('Missing compliance assertion hash');
    }
    if (presentation.assertionHash && !isValidHex64(presentation.assertionHash)) {
      errors.push('Invalid compliance assertion hash');
    }
    if (presentation.privateAssertionUal && !isValidAssertionUal(presentation.privateAssertionUal)) {
      errors.push('Invalid private assertion UAL');
    }

    if (presentation.assertionUal && presentation.assertionHash) {
      if (options.resolveAssertion) {
        try {
          const resolved = await options.resolveAssertion(presentation.assertionUal);
          const content = resolved && typeof resolved === 'object' && 'content' in (resolved as any)
            ? (resolved as any).content
            : resolved;
          const publicAssertion = content && typeof content === 'object' && 'public' in (content as any)
            ? (content as any).public
            : content;
          const computed = sha256HexCanonicalJson(publicAssertion).toLowerCase();
          if (computed !== presentation.assertionHash.toLowerCase()) {
            errors.push('Compliance assertion hash mismatch');
          }
        } catch {
          errors.push('Failed to resolve compliance assertion');
        }
      } else {
        warnings.push('Compliance assertion reference not verified (no resolver configured)');
      }
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
