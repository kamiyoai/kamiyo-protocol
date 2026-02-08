import { Connection, Keypair } from '@solana/web3.js';
import {
  MeishiClient,
  MeishiExchange,
  type MeishiPresentation,
  type VerificationResult,
} from '@kamiyo/meishi';

export interface MeishiMiddlewareConfig {
  connection: Connection;
  keypair: Keypair;
  programId?: string;
  minComplianceScore?: number;
  requiredJurisdiction?: number;
  maxTransactionUsd?: number;
  productCategory?: number;
  /** If true, requests without Meishi headers are rejected. Default: true. */
  requireMeishi?: boolean;
  /** If true, warnings don't block the request. Default: true. */
  allowWarnings?: boolean;
  /** Maximum allowed signature age in seconds. Default: 300. */
  maxSignatureAgeSec?: number;
  /** Allowed future clock skew in seconds. Default: 60. */
  allowedClockSkewSec?: number;
  /** Optional nonce replay guard callback. Return false when nonce is already used. */
  nonceReplayGuard?: (params: {
    passportAddress: string;
    nonce: string;
    timestamp: number;
  }) => Promise<boolean> | boolean;
  /** Require a DKG assertion UAL in Meishi headers. Default: false. */
  requireAssertionReference?: boolean;
  /** Require a SHA-256 assertion hash when assertion UALs are used. Default: false. */
  requireAssertionHash?: boolean;
  /** Allowed assertion UAL prefixes. Default: ['did:dkg:'] */
  allowedAssertionUalPrefixes?: string[];
  /** Allow deprecated compliance-proof-only headers. Default: false. */
  allowLegacyComplianceProof?: boolean;
}

export interface MeishiVerificationContext {
  presentation: MeishiPresentation | null;
  result: VerificationResult | null;
  verified: boolean;
}

/**
 * Core verification logic shared between Express and Fastify middleware.
 */
export function createVerifier(config: MeishiMiddlewareConfig) {
  const client = new MeishiClient({
    connection: config.connection,
    keypair: config.keypair,
    programId: config.programId,
  });
  const exchange = new MeishiExchange(client);
  const requireMeishi = config.requireMeishi ?? true;
  const allowWarnings = config.allowWarnings ?? true;

  return {
    async verify(
      headers: Record<string, string | undefined>,
      requestContext?: {
        method?: string;
        path?: string;
        body?: Buffer | string;
      }
    ): Promise<MeishiVerificationContext> {
      const presentation = MeishiExchange.fromHeaders(headers);

      if (!presentation) {
        if (requireMeishi) {
          return {
            presentation: null,
            result: { valid: false, errors: ['Missing Meishi headers'], warnings: [] },
            verified: false,
          };
        }
        return { presentation: null, result: null, verified: true };
      }

      const result = await exchange.verify(presentation, {
        minComplianceScore: config.minComplianceScore,
        requiredJurisdiction: config.requiredJurisdiction,
        maxTransactionUsd: config.maxTransactionUsd,
        productCategory: config.productCategory,
        maxSignatureAgeSec: config.maxSignatureAgeSec,
        allowedClockSkewSec: config.allowedClockSkewSec,
        expectedMethod: requestContext?.method,
        expectedPath: requestContext?.path,
        expectedBody: requestContext?.body,
        requireAssertionReference: config.requireAssertionReference,
        requireAssertionHash: config.requireAssertionHash,
        allowedAssertionUalPrefixes: config.allowedAssertionUalPrefixes,
        allowLegacyComplianceProof: config.allowLegacyComplianceProof,
        nonceReplayGuard: config.nonceReplayGuard,
      });

      const normalizedResult = (!allowWarnings && result.warnings.length > 0)
        ? {
            ...result,
            valid: false,
            errors: [
              ...result.errors,
              ...result.warnings.map((w) => `Warning promoted to error: ${w}`),
            ],
          }
        : result;

      return {
        presentation,
        result: normalizedResult,
        verified: normalizedResult.valid,
      };
    },
  };
}
