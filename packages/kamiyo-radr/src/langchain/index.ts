/**
 * LangChain tools for Radr ShadowPay. Requires @langchain/core and zod.
 */

import { Connection, PublicKey, Keypair, Transaction } from '@solana/web3.js';
import { createShadowWireClient, ShadowWireWrapper } from '../client/shadow-wire';
import { createPrivateEscrowHandler, PrivateEscrowHandler } from '../escrow/private-escrow';
import { createShadowIdReputationGate, ShadowIdReputationGate, getTierBenefits } from '../reputation/shadow-id-gate';
import type { ShadowToken } from '../types';

interface SimpleWallet {
  publicKey: PublicKey;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
  signAllTransactions: (txs: Transaction[]) => Promise<Transaction[]>;
}

export interface RadrToolsConfig {
  connection: Connection;
  wallet: SimpleWallet;
  programId?: PublicKey;
}

const DEFAULT_PROGRAM_ID = new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');

export async function createRadrTools(config: RadrToolsConfig): Promise<unknown[]> {
  let DynamicStructuredTool: any;
  let z: any;

  try {
    const toolsModule = await import('@langchain/core/tools');
    const zodModule = await import('zod');
    DynamicStructuredTool = toolsModule.DynamicStructuredTool;
    z = zodModule.z;
  } catch (err) {
    throw new Error(
      'LangChain tools require @langchain/core and zod. ' +
      'Install with: npm install @langchain/core zod'
    );
  }

  const programId = config.programId ?? DEFAULT_PROGRAM_ID;

  let shadowWire: ShadowWireWrapper | null = null;
  let escrowHandler: PrivateEscrowHandler | null = null;
  let reputationGate: ShadowIdReputationGate | null = null;

  async function getShadowWire(): Promise<ShadowWireWrapper> {
    if (!shadowWire) {
      shadowWire = await createShadowWireClient(config.connection, { debug: false });
    }
    return shadowWire;
  }

  async function getEscrowHandler(): Promise<PrivateEscrowHandler> {
    if (!escrowHandler) {
      escrowHandler = await createPrivateEscrowHandler(config.connection, programId);
    }
    return escrowHandler;
  }

  function getReputationGate(): ShadowIdReputationGate {
    if (!reputationGate) {
      reputationGate = createShadowIdReputationGate(config.connection, programId);
    }
    return reputationGate;
  }

  const PrivateTransferSchema = z.object({
    recipient: z.string().describe("Recipient's Solana wallet address (base58)"),
    amount: z.number().positive().describe('Amount to transfer'),
    token: z.enum(['SOL', 'USDC', 'USDT', 'RADR', 'BONK']).describe('Token to transfer'),
  });

  const CheckBalanceSchema = z.object({
    token: z.enum(['SOL', 'USDC', 'USDT', 'RADR', 'BONK']).describe('Token to check balance for'),
  });

  const CreatePrivateEscrowSchema = z.object({
    provider: z.string().describe("Provider's Solana wallet address (base58)"),
    amount: z.number().positive().describe('Amount to escrow'),
    token: z.enum(['SOL', 'USDC', 'USDT', 'RADR', 'BONK']).describe('Token to escrow'),
    timeLockHours: z.number().min(1).max(720).default(24).describe('Time lock in hours before provider can claim'),
  });

  const CheckReputationSchema = z.object({
    threshold: z.number().min(0).max(100).default(50).describe('Reputation threshold to check against'),
  });

  const FileDisputeSchema = z.object({
    escrowPda: z.string().describe('Escrow PDA address'),
    transactionId: z.string().describe('Transaction ID of the escrow'),
    reason: z.string().describe('Reason for dispute'),
  });

  const DepositToPoolSchema = z.object({
    amount: z.number().positive().describe('Amount to deposit'),
    token: z.enum(['SOL', 'USDC', 'USDT', 'RADR', 'BONK']).describe('Token to deposit'),
  });

  const privateTransferTool = new DynamicStructuredTool({
    name: 'radr_private_transfer',
    description:
      'Send tokens privately via ShadowWire. Amount is hidden from blockchain observers. Internal transfers (both parties in ShadowWire) are fully private. External transfers hide sender identity.',
    schema: PrivateTransferSchema,
    func: async (input: { recipient: string; amount: number; token: string }): Promise<string> => {
      try {
        const { recipient, amount, token } = input;
        const client = await getShadowWire();

        const canInternal = await client.canReceiveInternal(recipient);
        const result = await client.transfer({
          sender: config.wallet.publicKey.toBase58(),
          recipient,
          amount,
          token: token as ShadowToken,
          type: canInternal ? 'internal' : 'external',
        });

        if (!result.success) {
          return JSON.stringify({ success: false, error: result.error });
        }

        return JSON.stringify({
          success: true,
          signature: result.signature,
          amount,
          token,
          recipient,
          privacyLevel: canInternal ? 'fully_private' : 'sender_anonymous',
          relayerFee: result.relayerFee,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return JSON.stringify({ success: false, error: message });
      }
    },
  });

  const checkBalanceTool = new DynamicStructuredTool({
    name: 'radr_check_shielded_balance',
    description: 'Check shielded token balance in ShadowWire pool. Returns available balance and pool address.',
    schema: CheckBalanceSchema,
    func: async (input: { token: string }): Promise<string> => {
      try {
        const { token } = input;
        const client = await getShadowWire();

        const balance = await client.getBalance(
          config.wallet.publicKey.toBase58(),
          token as ShadowToken
        );

        return JSON.stringify({
          success: true,
          token,
          available: balance.available,
          poolAddress: balance.poolAddress,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return JSON.stringify({ success: false, error: message });
      }
    },
  });

  const createPrivateEscrowTool = new DynamicStructuredTool({
    name: 'radr_create_private_escrow',
    description:
      'Create escrow with private funding via ShadowWire. Amount is hidden on-chain using cryptographic commitment. Includes dispute resolution protection.',
    schema: CreatePrivateEscrowSchema,
    func: async (input: { provider: string; amount: number; token: string; timeLockHours?: number }): Promise<string> => {
      try {
        const { provider, amount, token, timeLockHours = 24 } = input;
        const handler = await getEscrowHandler();

        const transactionId = `shadow_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        const result = await handler.createPrivateEscrow({
          wallet: {
            publicKey: config.wallet.publicKey,
            signTransaction: config.wallet.signTransaction as any,
          },
          provider,
          amount,
          token: token as ShadowToken,
          transactionId,
          config: {
            privateDeposit: true,
            privateSettlement: true,
            timeLockSeconds: timeLockHours * 3600,
          },
        });

        if (!result.success) {
          return JSON.stringify({ success: false, error: result.error });
        }

        return JSON.stringify({
          success: true,
          escrowPda: result.escrowPda,
          transactionId: result.transactionId,
          amount,
          token,
          provider,
          timeLockHours,
          privateDeposit: true,
          shadowProof: result.shadowProof,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return JSON.stringify({ success: false, error: message });
      }
    },
  });

  const checkReputationTool = new DynamicStructuredTool({
    name: 'radr_check_reputation_gate',
    description:
      'Check if wallet meets reputation threshold for ShadowWire pool access. Returns tier level and ZK proof if eligible.',
    schema: CheckReputationSchema,
    func: async (input: { threshold?: number }): Promise<string> => {
      try {
        const { threshold = 50 } = input;
        const gate = getReputationGate();

        const result = await gate.checkReputationGate(
          { publicKey: config.wallet.publicKey },
          threshold
        );

        return JSON.stringify({
          success: true,
          eligible: result.eligible,
          tier: result.tier,
          threshold,
          benefits: getTierBenefits(result.tier),
          hasProof: !!result.proof,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return JSON.stringify({ success: false, error: message });
      }
    },
  });

  const fileDisputeTool = new DynamicStructuredTool({
    name: 'radr_file_private_dispute',
    description:
      'File dispute for private escrow. Oracles evaluate service quality without revealing payment amount. Settlement preserves privacy.',
    schema: FileDisputeSchema,
    func: async (input: { escrowPda: string; transactionId: string; reason: string }): Promise<string> => {
      try {
        const { escrowPda, transactionId, reason } = input;
        const handler = await getEscrowHandler();

        const result = await handler.fileDispute({
          escrowPda,
          transactionId,
          reason,
          revealAmount: false,
        });

        if (!result.success) {
          return JSON.stringify({ success: false, error: result.error });
        }

        return JSON.stringify({
          success: true,
          disputeId: result.disputeId,
          oracleCommitDeadline: result.oracleCommitDeadline,
          reason,
          privateDispute: true,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return JSON.stringify({ success: false, error: message });
      }
    },
  });

  const depositToPoolTool = new DynamicStructuredTool({
    name: 'radr_deposit_to_pool',
    description: 'Deposit tokens to ShadowWire shielded pool. Required before making private transfers.',
    schema: DepositToPoolSchema,
    func: async (input: { amount: number; token: string }): Promise<string> => {
      try {
        const { amount, token } = input;
        const client = await getShadowWire();

        await client.deposit({
          wallet: config.wallet.publicKey.toBase58(),
          amount,
          token: token as ShadowToken,
        });

        return JSON.stringify({
          success: true,
          amount,
          token,
          message: 'Deposit transaction created. Sign and submit to complete.',
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return JSON.stringify({ success: false, error: message });
      }
    },
  });

  return [
    privateTransferTool,
    checkBalanceTool,
    createPrivateEscrowTool,
    checkReputationTool,
    fileDisputeTool,
    depositToPoolTool,
  ];
}

export async function createRadrToolsFromEnv(secretKey: Uint8Array): Promise<unknown[]> {
  const connection = new Connection(
    process.env.RPC_URL || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
  );
  const keypair = Keypair.fromSecretKey(secretKey);

  const programIdStr = process.env.KAMIYO_PROGRAM_ID;
  const programId = programIdStr ? new PublicKey(programIdStr) : undefined;

  return createRadrTools({
    connection,
    wallet: {
      publicKey: keypair.publicKey,
      signTransaction: async (tx: Transaction): Promise<Transaction> => {
        tx.sign(keypair);
        return tx;
      },
      signAllTransactions: async (txs: Transaction[]): Promise<Transaction[]> => {
        txs.forEach((tx) => tx.sign(keypair));
        return txs;
      },
    },
    programId,
  });
}
