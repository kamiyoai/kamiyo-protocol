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

  return {
    async verify(headers: Record<string, string | undefined>): Promise<MeishiVerificationContext> {
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
      });

      return {
        presentation,
        result,
        verified: result.valid,
      };
    },
  };
}
