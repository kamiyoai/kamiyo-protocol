import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { BN, Wallet } from '@coral-xyz/anchor';
import { KamiyoClient } from './client';

export const FUNDRY_CONFIG_TYPES = [
  'community',
  'preseed',
  'seriesa',
  'toly',
  'indie',
  'music',
  'whitewhale',
  'retardchy',
  'illuminati',
  'presales',
  'aiagents',
  'nitro',
] as const;

export type FundryConfigType = (typeof FUNDRY_CONFIG_TYPES)[number];

export interface SecureLaunchParams {
  name: string;
  ticker: string;
  description: string;
  imageUrl: string;
  configType: FundryConfigType;
  escrowAmountSol?: number;
  migrationTargetSol?: number;
  creatorAllocationBps?: number;
}

export interface SecureLaunchResult {
  success: boolean;
  fundryCoinId?: string;
  mint?: string;
  fundryTxSignature?: string;
  txSignature?: string;
  launchRecordPda?: string;
  agentPda?: string;
  warning?: string;
  error?: string;
}

export interface FundryManagerConfig {
  connection: Connection;
  wallet: Wallet;
  fundryMcpEndpoint?: string;
  programId?: PublicKey;
}

type FundryToolResponse = {
  success: boolean;
  data?: Record<string, unknown>;
  error?: unknown;
};

const DEFAULT_ESCROW_SOL = 0.5;
const MIN_ESCROW_SOL = 0.001;
const MAX_ESCROW_SOL = 1000;
const LAMPORTS_PER_SOL = 1_000_000_000;

export class FundryManager {
  private client: KamiyoClient;
  private fundryEndpoint: string;

  constructor(config: FundryManagerConfig) {
    this.client = new KamiyoClient({
      connection: config.connection,
      wallet: config.wallet,
      programId: config.programId,
    });

    this.fundryEndpoint = (config.fundryMcpEndpoint ?? 'https://fundry.collaterize.com/api/mcp/mcp')
      .trim()
      .replace(/\/+$/, '');
  }

  async secureLaunch(params: SecureLaunchParams): Promise<SecureLaunchResult> {
    const escrowSol = params.escrowAmountSol ?? DEFAULT_ESCROW_SOL;
    if (escrowSol < MIN_ESCROW_SOL || escrowSol > MAX_ESCROW_SOL) {
      return {
        success: false,
        error: `Escrow must be between ${MIN_ESCROW_SOL} and ${MAX_ESCROW_SOL} SOL`,
      };
    }

    if (!FUNDRY_CONFIG_TYPES.includes(params.configType)) {
      return {
        success: false,
        error: `Invalid config type. Valid: ${FUNDRY_CONFIG_TYPES.join(', ')}`,
      };
    }

    if (!params.imageUrl.trim()) {
      return {
        success: false,
        error: 'imageUrl is required for Fundry token creation',
      };
    }

    const owner = this.client.wallet.publicKey;
    const [agentPda] = this.client.getAgentPDA(owner);
    const agent = await this.client.getAgent(agentPda);
    if (!agent || !agent.isActive) {
      return {
        success: false,
        error: 'No active KAMIYO agent identity found. Create one first.',
      };
    }

    let fundryCoinId: string | undefined;
    let mintAddress = '';
    let fundryTxSignature: string | undefined;
    let warning: string | undefined;

    try {
      const created = await this.callFundry<FundryToolResponse>('create_token', {
        name: params.name,
        ticker: params.ticker,
        description: params.description,
        imageUrl: params.imageUrl,
        configType: params.configType,
        creatorAddress: owner.toBase58(),
      });

      if (!created?.success || !created.data) {
        return { success: false, error: this.describeToolFailure('create_token', created?.error) };
      }

      const coinId = created.data['coinId'];
      if (typeof coinId !== 'string' || coinId.length === 0) {
        return { success: false, error: 'Fundry response missing coinId' };
      }
      fundryCoinId = coinId;

      const txB64 = created.data['transaction'];
      if (typeof txB64 !== 'string' || txB64.length === 0) {
        return { success: false, fundryCoinId, error: 'Fundry response missing transaction' };
      }

      fundryTxSignature = await this.signAndSendFundryTx(txB64);

      try {
        await this.callFundry('confirm_launch', {
          coinId: fundryCoinId,
          transactionSignature: fundryTxSignature,
        });
      } catch (err: unknown) {
        warning = 'Fundry confirm_launch failed: ' + errorMessage(err);
      }

      const maybeMint =
        created.data['mintAddress'] ?? created.data['mint'] ?? created.data['mint_address'];
      mintAddress = typeof maybeMint === 'string' ? maybeMint : '';

      if (!mintAddress) {
        try {
          const token = await this.callFundry<FundryToolResponse>('get_token', {
            coinId: fundryCoinId,
          });
          const discoveredMint = token?.data?.['mintAddress'] ?? token?.data?.['mint'];
          mintAddress = typeof discoveredMint === 'string' ? discoveredMint : '';
        } catch {
          // Handled below.
        }
      }

      if (!mintAddress) {
        return {
          success: false,
          fundryCoinId,
          fundryTxSignature,
          warning,
          error: 'Unable to discover mint address',
        };
      }
    } catch (err: unknown) {
      return {
        success: false,
        fundryCoinId,
        fundryTxSignature,
        warning,
        error: `Fundry token creation failed: ${errorMessage(err)}`,
      };
    }

    if (!fundryCoinId) {
      return {
        success: false,
        fundryTxSignature,
        warning,
        error: 'Fundry response missing coinId',
      };
    }
    const escrowLamports = new BN(Math.floor(escrowSol * LAMPORTS_PER_SOL));
    const mint = new PublicKey(mintAddress);
    const migrationTarget = new BN(
      Math.floor((params.migrationTargetSol ?? 85) * LAMPORTS_PER_SOL)
    );

    try {
      const txSignature = await this.client.createTrustedLaunch({
        mint,
        fundryCoinId,
        configType: params.configType,
        escrowAmount: escrowLamports,
        migrationTargetSol: migrationTarget,
        creatorAllocationBps: params.creatorAllocationBps ?? 500,
      });

      const [launchRecordPda] = this.client.getLaunchRecordPDA(agentPda, mint);

      return {
        success: true,
        fundryCoinId,
        mint: mintAddress,
        fundryTxSignature,
        txSignature,
        launchRecordPda: launchRecordPda.toBase58(),
        agentPda: agentPda.toBase58(),
        warning,
      };
    } catch (err: unknown) {
      return {
        success: true,
        fundryCoinId,
        mint: mintAddress,
        fundryTxSignature,
        agentPda: agentPda.toBase58(),
        warning,
        error:
          'Token created but LaunchRecord failed: ' +
          errorMessage(err) +
          '. Manual record creation needed.',
      };
    }
  }

  async getLaunchRecord(
    agent: PublicKey,
    mint: PublicKey
  ): Promise<{ exists: boolean; pda: PublicKey }> {
    const [pda] = this.client.getLaunchRecordPDA(agent, mint);
    const accountInfo = await this.client.connection.getAccountInfo(pda);
    return { exists: accountInfo !== null, pda };
  }

  listConfigs(): { name: FundryConfigType; category: string }[] {
    return FUNDRY_CONFIG_TYPES.map(name => ({
      name,
      category: ['community', 'indie', 'music'].includes(name) ? 'builder' : 'monkes',
    }));
  }

  private async callFundry<T = unknown>(tool: string, args: Record<string, unknown>): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    let response: Response;
    try {
      response = await fetch(this.fundryEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: tool, arguments: args },
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const raw = await response.text();
    if (!response.ok) {
      const detail = raw.trim();
      throw new Error(`Fundry API ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
    }

    const rpc = parseMcpJsonRpc(raw);
    const content = rpc?.result?.content?.[0]?.text;
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new Error('Fundry response missing content');
    }

    return JSON.parse(content) as T;
  }

  private async signAndSendFundryTx(txB64: string): Promise<string> {
    const bytes = Buffer.from(txB64, 'base64');

    let tx: Transaction | VersionedTransaction;
    try {
      tx = VersionedTransaction.deserialize(bytes);
    } catch {
      tx = Transaction.from(bytes);
    }

    const signer = this.client.wallet as unknown as {
      signTransaction(
        tx: Transaction | VersionedTransaction
      ): Promise<Transaction | VersionedTransaction>;
    };
    const signed = await signer.signTransaction(tx);
    const sig = await this.client.connection.sendRawTransaction(signed.serialize(), {
      maxRetries: 3,
    });

    try {
      const confirm = this.client.connection.confirmTransaction(sig, 'confirmed');
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timed out confirming Fundry transaction')), 30_000)
      );
      await Promise.race([confirm, timeout]);
    } catch {
      // Best-effort confirmation.
    }

    return sig;
  }

  private describeToolFailure(tool: string, error: unknown): string {
    if (!error) return `Fundry ${tool} failed`;

    if (typeof error === 'string') return `Fundry ${tool} failed: ${error}`;
    if (error instanceof Error) return `Fundry ${tool} failed: ${error.message}`;

    try {
      return `Fundry ${tool} failed: ${JSON.stringify(error)}`;
    } catch {
      return `Fundry ${tool} failed`;
    }
  }
}

type McpJsonRpcResponse = {
  result?: {
    content?: Array<{ text?: string }>;
  };
};

function parseMcpJsonRpc(raw: string): McpJsonRpcResponse {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed);
  }

  const dataLine = trimmed
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.startsWith('data: '))
    .at(-1);

  if (!dataLine) {
    throw new Error('Fundry response missing data frame');
  }

  return JSON.parse(dataLine.slice(6));
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
