import {
  PublicKey,
  Connection,
  Keypair,
  Transaction,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createTransferInstruction,
} from '@solana/spl-token';
import {
  PrepareRequest,
  PrepareResponse,
  VerifyRequest,
  VerifyResult,
  SettleRequest,
  SettleResult,
  FeedbackRequest,
  FeedbackResult,
  TarsAdapterConfig,
  DEFAULT_CONFIG,
  TARS_PROGRAM_ID,
  USDC_MAINNET,
  USDC_DEVNET,
  CombinedReputation,
  isValidTarsRating,
} from './types';
import { TarsBridge, createTarsBridge } from './bridge';
import { deriveAgentPda, deriveJobPda, deriveFeedbackPda } from './job-linker';

export interface UnifiedFacilitatorConfig {
  connection: Connection;
  payer: Keypair;
  tarsProgramId?: PublicKey;
  kamiyoProgramId?: PublicKey;
  config?: Partial<TarsAdapterConfig>;
}

export class UnifiedFacilitator {
  private connection: Connection;
  private payer: Keypair;
  private tarsProgramId: PublicKey;
  private kamiyoProgramId: PublicKey;
  private config: TarsAdapterConfig;
  private bridge: TarsBridge;

  constructor(facilitatorConfig: UnifiedFacilitatorConfig) {
    this.connection = facilitatorConfig.connection;
    this.payer = facilitatorConfig.payer;
    this.tarsProgramId = facilitatorConfig.tarsProgramId || TARS_PROGRAM_ID;
    this.kamiyoProgramId = facilitatorConfig.kamiyoProgramId || new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');
    this.config = { ...DEFAULT_CONFIG, ...facilitatorConfig.config };

    this.bridge = createTarsBridge({
      connection: this.connection,
      tarsProgramId: this.tarsProgramId,
      kamiyoProgramId: this.kamiyoProgramId,
      payer: this.payer,
      config: this.config,
    });
  }

  async prepare(request: PrepareRequest): Promise<PrepareResponse> {
    const { paymentRequirements, walletAddress, enableTrustless } = request;

    const network = paymentRequirements.network;
    if (network !== 'solana' && network !== 'solana-devnet') {
      throw new Error(`Unsupported network: ${network}`);
    }

    const isDevnet = network === 'solana-devnet';
    const usdcMint = isDevnet ? USDC_DEVNET : USDC_MAINNET;

    let clientWallet: PublicKey;
    let payTo: PublicKey;
    try {
      clientWallet = new PublicKey(walletAddress);
      payTo = new PublicKey(paymentRequirements.payTo);
    } catch {
      throw new Error('Invalid wallet address format');
    }

    const amount = BigInt(paymentRequirements.maxAmountRequired);
    if (amount <= 0n) {
      throw new Error('Payment amount must be positive');
    }
    if (amount > BigInt(4_294_000_000)) {
      throw new Error('Payment amount exceeds maximum (~4,294 USDC)');
    }

    const clientTokenAccount = await getAssociatedTokenAddress(usdcMint, clientWallet);
    const payToTokenAccount = await getAssociatedTokenAddress(usdcMint, payTo);

    const transaction = new Transaction();

    const transferInstruction = createTransferInstruction(
      clientTokenAccount,
      payToTokenAccount,
      clientWallet,
      amount
    );
    transaction.add(transferInstruction);

    let tarsJobPda: PublicKey | undefined;

    if (enableTrustless) {
      const paymentTxKeypair = Keypair.generate();
      const [jobPda] = deriveJobPda(paymentTxKeypair.publicKey, this.tarsProgramId);
      const [agentPda] = deriveAgentPda(payTo, this.tarsProgramId);

      const agentTokenAccount = await getAssociatedTokenAddress(usdcMint, payTo);

      const registerJobIx = this.bridge.createRegisterJobInstruction(
        jobPda,
        agentPda,
        payTo,
        clientTokenAccount,
        agentTokenAccount,
        paymentTxKeypair.publicKey,
        clientWallet,
        this.payer.publicKey,
        TOKEN_PROGRAM_ID,
        0
      );

      transaction.add(registerJobIx);
      tarsJobPda = jobPda;
    }

    const { blockhash } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.payer.publicKey;

    transaction.partialSign(this.payer);

    const serialized = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    const enrichedRequirements = {
      ...paymentRequirements,
      extra: {
        ...paymentRequirements.extra,
        feePayer: this.payer.publicKey.toBase58(),
      },
    };

    return {
      transaction: serialized.toString('base64'),
      paymentRequirements: enrichedRequirements,
      tarsJobPda: tarsJobPda?.toBase58(),
    };
  }

  async verify(request: VerifyRequest): Promise<VerifyResult> {
    const { paymentPayload, paymentRequirements } = request;

    try {
      if (!paymentPayload.payload.transaction) {
        return { isValid: false, invalidReason: 'Missing transaction in payload' };
      }

      const txBuffer = Buffer.from(paymentPayload.payload.transaction, 'base64');
      const transaction = Transaction.from(txBuffer);

      const simulation = await this.connection.simulateTransaction(transaction);

      if (simulation.value.err) {
        return {
          isValid: false,
          invalidReason: `Simulation failed: ${JSON.stringify(simulation.value.err)}`,
        };
      }

      const payTo = new PublicKey(paymentRequirements.payTo);
      const expectedAmount = BigInt(paymentRequirements.maxAmountRequired);

      const hasValidTransfer = transaction.instructions.some(ix => {
        if (!ix.programId.equals(TOKEN_PROGRAM_ID)) return false;
        if (ix.data[0] !== 3 && ix.data[0] !== 12) return false;

        const amount = ix.data.readBigUInt64LE(1);
        return amount >= expectedAmount;
      });

      if (!hasValidTransfer) {
        return { isValid: false, invalidReason: 'No valid transfer instruction found' };
      }

      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        invalidReason: error instanceof Error ? error.message : 'Verification failed',
      };
    }
  }

  async settle(request: SettleRequest): Promise<SettleResult> {
    const { paymentPayload } = request;

    try {
      if (!paymentPayload.payload.transaction) {
        return { success: false, errorReason: 'Missing transaction in payload' };
      }

      let txBuffer: Buffer;
      try {
        txBuffer = Buffer.from(paymentPayload.payload.transaction, 'base64');
      } catch {
        return { success: false, errorReason: 'Invalid base64 transaction encoding' };
      }

      let transaction: Transaction;
      try {
        transaction = Transaction.from(txBuffer);
      } catch {
        return { success: false, errorReason: 'Invalid transaction format' };
      }

      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();

      const signature = await this.connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      await this.connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      });

      let tarsJobId: string | undefined;

      for (const ix of transaction.instructions) {
        if (ix.programId.equals(this.tarsProgramId)) {
          const discriminator = ix.data.slice(0, 8);
          const registerJobDiscriminator = Buffer.from([87, 213, 177, 255, 131, 17, 178, 45]);

          if (discriminator.equals(registerJobDiscriminator)) {
            tarsJobId = ix.keys[0].pubkey.toBase58();
            break;
          }
        }
      }

      return {
        success: true,
        transaction: signature,
        tarsJobId,
      };
    } catch (error) {
      return {
        success: false,
        errorReason: error instanceof Error ? error.message : 'Settlement failed',
      };
    }
  }

  async feedback(request: FeedbackRequest, clientWallet: Keypair): Promise<FeedbackResult> {
    const { jobId, rating, commentUri } = request;

    if (!isValidTarsRating(rating)) {
      return { success: false, errorReason: `Invalid rating: ${rating}. Must be 1-5.` };
    }

    try {
      const jobPda = new PublicKey(jobId);
      const signature = await this.bridge.submitFeedback(jobPda, rating, clientWallet, commentUri);

      return { success: true, transaction: signature };
    } catch (error) {
      return {
        success: false,
        errorReason: error instanceof Error ? error.message : 'Feedback submission failed',
      };
    }
  }

  async getReputation(agentWallet: string): Promise<CombinedReputation> {
    let wallet: PublicKey;
    try {
      wallet = new PublicKey(agentWallet);
    } catch {
      throw new Error('Invalid agent wallet address');
    }
    return this.bridge.getCombinedReputation(wallet);
  }

  async supported(): Promise<{
    kinds: Array<{
      x402Version: number;
      scheme: string;
      network: string;
      extra: { feePayer: string; tarsEnabled: boolean };
    }>;
  }> {
    return {
      kinds: [
        {
          x402Version: 1,
          scheme: 'exact',
          network: 'solana',
          extra: {
            feePayer: this.payer.publicKey.toBase58(),
            tarsEnabled: true,
          },
        },
        {
          x402Version: 1,
          scheme: 'exact',
          network: 'solana-devnet',
          extra: {
            feePayer: this.payer.publicKey.toBase58(),
            tarsEnabled: true,
          },
        },
      ],
    };
  }

  linkJobToEscrow(kamiyoEscrowPda: string, tarsJobPda: string, paymentAmount: number): void {
    if (paymentAmount <= 0) {
      throw new Error('Payment amount must be positive');
    }

    let escrowPda: PublicKey;
    let jobPda: PublicKey;
    try {
      escrowPda = new PublicKey(kamiyoEscrowPda);
      jobPda = new PublicKey(tarsJobPda);
    } catch {
      throw new Error('Invalid PDA address format');
    }

    this.bridge.linkJobToEscrow(escrowPda, jobPda, paymentAmount);
  }

  getBridge(): TarsBridge {
    return this.bridge;
  }

  getConfig(): TarsAdapterConfig {
    return { ...this.config };
  }

  setConfig(config: Partial<TarsAdapterConfig>): void {
    this.config = { ...this.config, ...config };
    this.bridge.setConfig(config);
  }
}

export function createUnifiedFacilitator(config: UnifiedFacilitatorConfig): UnifiedFacilitator {
  return new UnifiedFacilitator(config);
}
