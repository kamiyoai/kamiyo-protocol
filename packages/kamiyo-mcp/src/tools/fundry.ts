import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

type FundryToolResult = {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
};

type ProgramContext = {
  fundryEndpoint?: string;
  programId?: PublicKey;
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
    getAccountInfo(address: PublicKey): Promise<unknown> | unknown;
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
    migrationTargetSol?: number;
    creatorAllocationBps?: number;
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
            'Fundry bonding curve config: community, preseed, seriesa, toly, indie, music, whitewhale, kamiyo, retardchy, illuminati, presales, aiagents, nitro',
        },
        initialBuySol: {
          type: 'number',
          description: 'Optional initial buy in SOL on the bonding curve (must be positive)',
        },
        escrowAmountSol: {
          type: 'number',
          description: 'SOL escrow amount (default 0.5, min 0.001, max 1000)',
        },
        creatorAddress: {
          type: 'string',
          description:
            'Creator wallet address for Fundry (defaults to the configured wallet). Use a multisig/lock wallet when routing dev allocation.',
        },
        migrationTargetSol: {
          type: 'number',
          description: 'Migration target in SOL for on-chain record (default 40)',
        },
        creatorAllocationBps: {
          type: 'number',
          description: 'Creator allocation in basis points for on-chain record (default 500)',
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
  'kamiyo',
  'retardchy',
  'illuminati',
  'presales',
  'aiagents',
  'nitro',
];

const DEFAULT_MIGRATION_TARGET_SOL = 40;
const DEFAULT_FUNDRY_TX_ALLOWED_PROGRAM_IDS = [
  '11111111111111111111111111111111', // System Program
  'ComputeBudget111111111111111111111111111111',
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // SPL Token
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s', // Metaplex Token Metadata
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
  'AddressLookupTab1e1111111111111111111111111',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', // Token-2022 (only if used)
];

export async function secureLaunchToken(
  params: {
    name: string;
    ticker: string;
    description: string;
    imageUrl: string;
    configType: string;
    initialBuySol?: number;
    escrowAmountSol?: number;
    creatorAddress?: string;
    migrationTargetSol?: number;
    creatorAllocationBps?: number;
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

    if (params.initialBuySol !== undefined) {
      if (!Number.isFinite(params.initialBuySol) || params.initialBuySol <= 0) {
        return { success: false, error: 'initialBuySol must be a positive number' };
      }
    }

    if (params.migrationTargetSol !== undefined) {
      if (!Number.isFinite(params.migrationTargetSol) || params.migrationTargetSol <= 0) {
        return { success: false, error: 'migrationTargetSol must be a positive number' };
      }
    }

    if (params.creatorAllocationBps !== undefined) {
      if (
        !Number.isInteger(params.creatorAllocationBps) ||
        params.creatorAllocationBps < 0 ||
        params.creatorAllocationBps > 10_000
      ) {
        return {
          success: false,
          error: 'creatorAllocationBps must be an integer between 0 and 10000',
        };
      }
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

    let creatorAddress = program.wallet.publicKey.toBase58();
    if (params.creatorAddress !== undefined) {
      try {
        creatorAddress = new PublicKey(params.creatorAddress).toBase58();
      } catch {
        return { success: false, error: 'Invalid creatorAddress (must be a Solana public key)' };
      }
    }
    if (creatorAddress !== program.wallet.publicKey.toBase58()) {
      return {
        success: false,
        error: 'creatorAddress must match the signing wallet (Fundry requires the creator to sign the launch tx)',
      };
    }

    let createResult: unknown;
    try {
      createResult = await callFundryMCP(program.fundryEndpoint, 'create_token', {
        name: params.name,
        ticker: params.ticker,
        description: params.description,
        imageUrl: params.imageUrl,
        configType: params.configType,
        creatorAddress,
        ...(params.initialBuySol !== undefined ? { initialBuySOL: params.initialBuySol } : {}),
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
    if (!isUuid36(coinId)) {
      return { success: false, error: 'Fundry response coinId is not a valid UUID' };
    }

    const txB64 = stringish(createData?.transaction ?? createObj.transaction);
    if (!txB64) {
      return { success: false, error: 'No transaction in Fundry response' };
    }

    const sent = await signAndSendFundryTx(program, txB64);
    const fundryTxSignature = sent.signature;

    let warning = sent.warning;
    try {
      await callFundryMCP(program.fundryEndpoint, 'confirm_launch', {
        coinId,
        transactionSignature: fundryTxSignature,
      });
    } catch (err: unknown) {
      warning = joinWarnings(warning, `Fundry confirm_launch failed: ${errorMessage(err)}`);
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
        // Best-effort mint discovery.
      }
    }

    if (mint && program.createTrustedLaunch) {
      try {
        const launchRecordSig = await program.createTrustedLaunch({
          mint,
          fundryCoinId: coinId,
          configType: params.configType,
          escrowAmountSol: escrowSol,
          migrationTargetSol: params.migrationTargetSol ?? DEFAULT_MIGRATION_TARGET_SOL,
          creatorAllocationBps: params.creatorAllocationBps ?? 500,
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
            warning: joinWarnings(
              warning,
              `Token created but on-chain record failed: ${errorMessage(err)}`
            ),
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
        category: ['community', 'indie', 'music', 'kamiyo'].includes(name) ? 'builder' : 'monkes',
      })),
    },
  };
}

export async function checkLaunchStatus(
  params: { agentAddress: string; mintAddress: string },
  program: ProgramContext
): Promise<FundryToolResult> {
  let agent: PublicKey;
  let mint: PublicKey;
  try {
    agent = new PublicKey(params.agentAddress);
    mint = new PublicKey(params.mintAddress);
  } catch {
    return { success: false, error: 'Invalid agentAddress or mintAddress' };
  }

  if (!program.programId) {
    return { success: false, error: 'programId not configured for launch status checks' };
  }

  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('launch'), agent.toBuffer(), mint.toBuffer()],
    program.programId
  );
  const info = await program.connection.getAccountInfo(pda);

  return { success: true, data: { exists: info !== null, pda: pda.toBase58() } };
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

async function signAndSendFundryTx(
  program: ProgramContext,
  txB64: string
): Promise<{ signature: string; warning?: string }> {
  const bytes = Buffer.from(txB64, 'base64');

  let tx: Transaction | VersionedTransaction;
  try {
    tx = VersionedTransaction.deserialize(bytes);
  } catch {
    tx = Transaction.from(bytes);
  }

  const allowlistWarning = checkTxAllowlist(tx);
  if (allowlistWarning && process.env.FUNDRY_TX_ALLOWLIST_ENFORCE === 'true') {
    throw new Error(allowlistWarning);
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

  return { signature: sig, warning: allowlistWarning };
}

function checkTxAllowlist(tx: Transaction | VersionedTransaction): string | undefined {
  if (process.env.FUNDRY_TX_ALLOWLIST_DISABLE === 'true') return;

  const raw = process.env.FUNDRY_TX_ALLOWED_PROGRAM_IDS;
  if (!raw) {
    const allow = new Set(DEFAULT_FUNDRY_TX_ALLOWED_PROGRAM_IDS);
    return checkTxProgramIds(tx, allow);
  }

  const allow = new Set(
    raw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  );
  if (allow.size === 0) return;

  return checkTxProgramIds(tx, allow);
}

function checkTxProgramIds(
  tx: Transaction | VersionedTransaction,
  allow: Set<string>
): string | undefined {
  const programIds = getProgramIds(tx);
  if (programIds.length === 0) return 'Fundry transaction contains no instructions';

  const disallowed = programIds.filter(id => !allow.has(id));
  if (disallowed.length === 0) return;

  return `Fundry transaction contains disallowed program IDs: ${disallowed.join(', ')}`;
}

type VersionedMessageLike = {
  staticAccountKeys?: PublicKey[];
  accountKeys?: PublicKey[];
  compiledInstructions?: Array<{ programIdIndex: number }>;
  instructions?: Array<{ programIdIndex: number }>;
};

function getProgramIds(tx: Transaction | VersionedTransaction): string[] {
  if (tx instanceof Transaction) {
    return uniq(tx.instructions.map(ix => ix.programId.toBase58()));
  }

  const msg = (tx as unknown as { message?: unknown }).message;
  if (!msg || typeof msg !== 'object') return [];

  const parsed = msg as VersionedMessageLike;
  const keys: PublicKey[] = parsed.staticAccountKeys ?? parsed.accountKeys ?? [];
  const compiled = parsed.compiledInstructions ?? parsed.instructions ?? [];
  const ids = compiled
    .map(ix => {
      const idx = ix.programIdIndex;
      const key = keys[idx];
      return key ? key.toBase58() : null;
    })
    .filter((v): v is string => typeof v === 'string');

  return uniq(ids);
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values));
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

function joinWarnings(existing: string | undefined, next: string | undefined): string | undefined {
  if (!next) return existing;
  if (!existing) return next;
  return `${existing}; ${next}`;
}

function isUuid36(value: string): boolean {
  if (value.length !== 36) return false;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      if (c !== 45) return false;
      continue;
    }
    const isDigit = c >= 48 && c <= 57;
    const isLowerHex = c >= 97 && c <= 102;
    const isUpperHex = c >= 65 && c <= 70;
    if (!isDigit && !isLowerHex && !isUpperHex) return false;
  }
  return true;
}
