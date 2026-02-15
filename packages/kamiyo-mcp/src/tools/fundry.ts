import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

type FundryToolResult = {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
};

type ProgramContext = {
  fundryEndpoint?: string;
  wallet: {
    publicKey: PublicKey;
    signTransaction(
      tx: Transaction | VersionedTransaction
    ): Promise<Transaction | VersionedTransaction>;
  };
  connection: {
    sendRawTransaction(
      rawTransaction: Uint8Array,
      opts?: {
        maxRetries?: number;
      }
    ): Promise<string>;
    confirmTransaction(
      signature: string,
      commitment?: 'processed' | 'confirmed' | 'finalized'
    ): Promise<unknown> | unknown;
  };
  pda?: {
    deriveAgentPDA?(owner: PublicKey): [PublicKey];
  };
  getAgentAccount?(agent: PublicKey): Promise<unknown>;
  createTrustedLaunch?(args: {
    mint: string;
    fundryCoinId: string;
    configType: string;
    escrowAmountSol: number;
  }): Promise<string>;
};

export const FUNDRY_TOOL_DEFINITIONS: Tool[] = [
  {
    name: 'secure_launch_token',
    description:
      'Launch a token via Fundry with KAMIYO trust verification. Agent posts SOL escrow, tracked on-chain with LaunchRecord PDA.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Token name' },
        ticker: { type: 'string', description: 'Token ticker symbol' },
        description: { type: 'string', description: 'Token description' },
        imageUrl: { type: 'string', description: 'Token image URL' },
        configType: {
          type: 'string',
          description:
            'Fundry bonding curve config: community, preseed, seriesa, toly, indie, music, whitewhale, retardchy, illuminati, presales, aiagents, nitro',
        },
        escrowAmountSol: {
          type: 'number',
          description: 'SOL escrow amount (default 0.5, min 0.001, max 1000)',
        },
      },
      required: ['name', 'ticker', 'description', 'imageUrl', 'configType'],
    },
  },
  {
    name: 'check_launch_status',
    description: 'Check if an agent has an existing trusted launch for a token mint',
    inputSchema: {
      type: 'object',
      properties: {
        agentAddress: { type: 'string', description: 'Agent PDA address' },
        mintAddress: { type: 'string', description: 'Token mint address' },
      },
      required: ['agentAddress', 'mintAddress'],
    },
  },
  {
    name: 'list_fundry_configs',
    description: 'List available Fundry bonding curve configurations',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

const VALID_CONFIG_TYPES = [
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
];

export async function secureLaunchToken(
  params: {
    name: string;
    ticker: string;
    description: string;
    imageUrl: string;
    configType: string;
    escrowAmountSol?: number;
  },
  program: ProgramContext
): Promise<FundryToolResult> {
  try {
    if (!VALID_CONFIG_TYPES.includes(params.configType)) {
      return {
        success: false,
        error: `Invalid config type "${params.configType}". Valid: ${VALID_CONFIG_TYPES.join(', ')}`,
      };
    }

    const escrowSol = params.escrowAmountSol ?? 0.5;
    if (escrowSol < 0.001 || escrowSol > 1000) {
      return {
        success: false,
        error: 'Escrow must be between 0.001 and 1000 SOL',
      };
    }

    if (!params.imageUrl.trim()) {
      return { success: false, error: 'imageUrl is required for Fundry token creation' };
    }

    const agentPda = program.pda?.deriveAgentPDA?.(program.wallet.publicKey)?.[0] ?? null;

    if (agentPda) {
      const agent = await program.getAgentAccount?.(agentPda);
      const agentObj = asRecord(agent);
      if (!agentObj || agentObj.isActive !== true) {
        return {
          success: false,
          error: 'No active KAMIYO agent found. Use create_agent first.',
        };
      }
    }

    let createResult: unknown;
    try {
      createResult = await callFundryMCP(program.fundryEndpoint, 'create_token', {
        name: params.name,
        ticker: params.ticker,
        description: params.description,
        imageUrl: params.imageUrl,
        configType: params.configType,
        creatorAddress: program.wallet.publicKey.toBase58(),
      });
    } catch (err: unknown) {
      return {
        success: false,
        error: `Fundry create_token failed: ${errorMessage(err)}`,
      };
    }

    const createObj = asRecord(createResult) ?? {};
    const createData = asRecord(createObj.data);

    const coinId = stringish(createData?.coinId ?? createObj.coinId ?? createObj.coin_id);
    if (!coinId) {
      return { success: false, error: 'No coinId in Fundry response' };
    }

    const txB64 = stringish(createData?.transaction ?? createObj.transaction);
    if (!txB64) {
      return { success: false, error: 'No transaction in Fundry response' };
    }

    const fundryTxSignature = await signAndSendFundryTx(program, txB64);

    let warning: string | undefined;
    try {
      await callFundryMCP(program.fundryEndpoint, 'confirm_launch', {
        coinId,
        transactionSignature: fundryTxSignature,
      });
    } catch (err: unknown) {
      warning = `Fundry confirm_launch failed: ${errorMessage(err)}`;
    }

    let mint = stringish(
      createData?.mintAddress ?? createData?.mint ?? createObj.mintAddress ?? createObj.mint
    );
    if (!mint) {
      try {
        const tokenInfo = await callFundryMCP(program.fundryEndpoint, 'get_token', { coinId });
        const tokenObj = asRecord(tokenInfo) ?? {};
        const tokenData = asRecord(tokenObj.data);
        mint = stringish(
          tokenData?.mintAddress ?? tokenData?.mint ?? tokenObj.mintAddress ?? tokenObj.mint
        );
      } catch {
        // Handled below.
      }
    }

    if (mint && program.createTrustedLaunch) {
      try {
        const launchRecordSig = await program.createTrustedLaunch({
          mint,
          fundryCoinId: coinId,
          configType: params.configType,
          escrowAmountSol: escrowSol,
        });

        return {
          success: true,
          data: {
            coinId,
            mint,
            txSignature: launchRecordSig,
            fundryTxSignature,
            agentPda: agentPda?.toBase58(),
            escrowSol,
            configType: params.configType,
            badge: 'KAMIYO Trusted',
            ...(warning ? { warning } : {}),
          },
        };
      } catch (err: unknown) {
        return {
          success: true,
          data: {
            coinId,
            mint,
            fundryTxSignature,
            agentPda: agentPda?.toBase58(),
            configType: params.configType,
            warning: warning ?? `Token created but on-chain record failed: ${errorMessage(err)}`,
          },
        };
      }
    }

    return {
      success: true,
      data: {
        coinId,
        mint: mint || 'pending',
        fundryTxSignature,
        configType: params.configType,
        ...(warning ? { warning } : {}),
      },
    };
  } catch (err: unknown) {
    return { success: false, error: errorMessage(err) };
  }
}

export function listFundryConfigs(): FundryToolResult {
  return {
    success: true,
    data: {
      configs: VALID_CONFIG_TYPES.map(name => ({
        name,
        category: ['community', 'indie', 'music'].includes(name) ? 'builder' : 'monkes',
      })),
    },
  };
}

async function callFundryMCP(
  endpoint: string | undefined,
  tool: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const url = (endpoint || 'https://fundry.collaterize.com/api/mcp/mcp').replace(/\/+$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  let response: Response;
  try {
    response = await fetch(url, {
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
    throw new Error('Fundry API ' + response.status + (detail ? ': ' + detail.slice(0, 200) : ''));
  }

  const rpc = parseMcpJsonRpc(raw);
  const content = rpc?.result?.content?.[0]?.text;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('Empty Fundry response content');
  }

  return JSON.parse(content);
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
    throw new Error('No data in Fundry response');
  }

  return JSON.parse(dataLine.slice(6));
}

async function signAndSendFundryTx(program: ProgramContext, txB64: string): Promise<string> {
  const bytes = Buffer.from(txB64, 'base64');

  let tx: Transaction | VersionedTransaction;
  try {
    tx = VersionedTransaction.deserialize(bytes);
  } catch {
    tx = Transaction.from(bytes);
  }

  const sigTx = await program.wallet.signTransaction(tx);
  const sig = await program.connection.sendRawTransaction(sigTx.serialize(), { maxRetries: 3 });

  try {
    const confirm = Promise.resolve(program.connection.confirmTransaction(sig, 'confirmed'));
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timed out confirming Fundry transaction')), 30_000)
    );
    await Promise.race([confirm, timeout]);
  } catch {
    // Best-effort confirmation.
  }

  return sig;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringish(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
