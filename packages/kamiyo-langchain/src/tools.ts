/**
 * LangChain Tools for Kamiyo Protocol
 *
 * Provides LangChain-compatible tools for:
 * - Creating payment agreements (escrows)
 * - Releasing funds to providers
 * - Disputing agreements for oracle arbitration
 * - Checking agreement status
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { Connection, PublicKey, Keypair, Transaction } from "@solana/web3.js";
import { KamiyoClient } from "@kamiyo/sdk";

// Simple wallet interface compatible with Anchor
interface SimpleWallet {
  publicKey: PublicKey;
  signTransaction: <T extends Transaction>(tx: T) => Promise<T>;
  signAllTransactions: <T extends Transaction>(txs: T[]) => Promise<T[]>;
}

export interface KamiyoToolsConfig {
  connection: Connection;
  wallet: SimpleWallet;
  programId?: PublicKey;
}

// Pre-define schemas at module level to avoid deep type instantiation
const CreateAgreementSchema = z.object({
  provider: z.string().describe("The provider's Solana wallet address (base58)"),
  amount: z.number().describe("Amount in SOL to escrow"),
  timeLockSeconds: z.number().describe("Time in seconds before provider can claim funds"),
  transactionId: z.string().describe("Unique identifier for this transaction"),
});

const ReleaseFundsSchema = z.object({
  transactionId: z.string().describe("The transaction ID of the agreement"),
  provider: z.string().describe("The provider's Solana wallet address (base58)"),
});

const DisputeAgreementSchema = z.object({
  transactionId: z.string().describe("The transaction ID of the agreement to dispute"),
});

const GetAgreementStatusSchema = z.object({
  transactionId: z.string().describe("The transaction ID of the agreement"),
});

const GetBalanceSchema = z.object({});

// Type aliases for schema inference
type CreateAgreementInput = z.infer<typeof CreateAgreementSchema>;
type ReleaseFundsInput = z.infer<typeof ReleaseFundsSchema>;
type DisputeAgreementInput = z.infer<typeof DisputeAgreementSchema>;
type GetAgreementStatusInput = z.infer<typeof GetAgreementStatusSchema>;

/**
 * Create all Kamiyo tools for use with LangChain agents
 */
export function createKamiyoTools(config: KamiyoToolsConfig) {
  const client = new KamiyoClient({
    connection: config.connection,
    wallet: config.wallet as any,
    programId: config.programId,
  });

  // Use explicit any typing to avoid deep type instantiation issues with DynamicStructuredTool
  const createAgreementTool = new (DynamicStructuredTool as any)({
    name: "kamiyo_create_agreement",
    description:
      "Create a payment agreement (escrow) with a service provider. Funds are locked until released or disputed. Use this when you need to pay for a service with protection.",
    schema: CreateAgreementSchema as z.ZodObject<any>,
    func: async (input: Record<string, any>): Promise<string> => {
      try {
        const { provider, amount, timeLockSeconds, transactionId } = input as CreateAgreementInput;
        const providerPubkey = new PublicKey(provider);
        const amountLamports = Math.floor(amount * 1e9);

        const tx = await client.createAgreement({
          provider: providerPubkey,
          amount: amountLamports,
          timeLockSeconds,
          transactionId,
        });

        const [agreementPDA] = (client as any).getAgreementPDA(
          config.wallet.publicKey,
          transactionId
        );

        return JSON.stringify({
          success: true,
          signature: tx,
          agreementAddress: agreementPDA.toBase58(),
          transactionId,
          amount,
          provider,
        });
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
        });
      }
    },
  });

  const releaseFundsTool = new (DynamicStructuredTool as any)({
    name: "kamiyo_release_funds",
    description:
      "Release escrowed funds to the service provider. Use this when the service was delivered satisfactorily.",
    schema: ReleaseFundsSchema as z.ZodObject<any>,
    func: async (input: Record<string, any>): Promise<string> => {
      const { transactionId, provider } = input as ReleaseFundsInput;
      try {
        const providerPubkey = new PublicKey(provider);

        const tx = await client.releaseFunds(transactionId, providerPubkey);

        return JSON.stringify({
          success: true,
          signature: tx,
          transactionId,
          action: "released",
        });
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
        });
      }
    },
  });

  const disputeAgreementTool = new (DynamicStructuredTool as any)({
    name: "kamiyo_dispute_agreement",
    description:
      "Dispute an agreement and request oracle arbitration. Use this when the service was not delivered as promised. Oracles will evaluate and determine fair settlement.",
    schema: DisputeAgreementSchema as z.ZodObject<any>,
    func: async (input: Record<string, any>): Promise<string> => {
      const { transactionId } = input as DisputeAgreementInput;
      try {
        const tx = await client.markDisputed(transactionId);

        return JSON.stringify({
          success: true,
          signature: tx,
          transactionId,
          action: "disputed",
          nextStep: "Oracles will evaluate and provide quality scores",
        });
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
        });
      }
    },
  });

  const getAgreementStatusTool = new (DynamicStructuredTool as any)({
    name: "kamiyo_get_agreement_status",
    description:
      "Check the current status of a payment agreement. Returns details about the escrow including amount, status, and parties involved.",
    schema: GetAgreementStatusSchema as z.ZodObject<any>,
    func: async (input: Record<string, any>): Promise<string> => {
      const { transactionId } = input as GetAgreementStatusInput;
      try {
        const [agreementPDA] = (client as any).getAgreementPDA(
          config.wallet.publicKey,
          transactionId
        );

        const agreement = await client.getAgreement(agreementPDA);

        if (!agreement) {
          return JSON.stringify({
            success: false,
            error: "Agreement not found",
          });
        }

        return JSON.stringify({
          success: true,
          address: agreementPDA.toBase58(),
          agent: agreement.agent.toBase58(),
          api: agreement.api.toBase58(),
          amount: agreement.amount.toNumber() / 1e9,
          status: Object.keys(agreement.status)[0],
          createdAt: agreement.createdAt.toNumber(),
          expiresAt: agreement.expiresAt.toNumber(),
        });
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
        });
      }
    },
  });

  const getBalanceTool = new (DynamicStructuredTool as any)({
    name: "kamiyo_get_balance",
    description: "Get the SOL balance of the current wallet.",
    schema: GetBalanceSchema as z.ZodObject<any>,
    func: async (_input: Record<string, any>): Promise<string> => {
      try {
        const balance = await config.connection.getBalance(config.wallet.publicKey);
        return JSON.stringify({
          success: true,
          balance: balance / 1e9,
          address: config.wallet.publicKey.toBase58(),
        });
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
        });
      }
    },
  });

  return [
    createAgreementTool,
    releaseFundsTool,
    disputeAgreementTool,
    getAgreementStatusTool,
    getBalanceTool,
  ];
}

/**
 * Convenience function to create tools from environment
 *
 * IMPORTANT: Defaults to devnet for safety. Set RPC_URL env var for mainnet:
 * RPC_URL=https://api.mainnet-beta.solana.com
 */
export function createKamiyoToolsFromEnv(secretKey: Uint8Array) {
  const connection = new Connection(
    process.env.RPC_URL || "https://api.devnet.solana.com"
  );
  const keypair = Keypair.fromSecretKey(secretKey);

  return createKamiyoTools({
    connection,
    wallet: {
      publicKey: keypair.publicKey,
      signTransaction: async <T extends Transaction>(tx: T): Promise<T> => {
        tx.sign(keypair);
        return tx;
      },
      signAllTransactions: async <T extends Transaction>(txs: T[]): Promise<T[]> => {
        txs.forEach((tx) => tx.sign(keypair));
        return txs;
      },
    },
  });
}
