import bs58 from 'bs58';
import { Keypair } from '@solana/web3.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getVisibleToolDefinitions, executeHostedTool } from '../mcp/server';
import { OOBE_ALLOWED_TOOL_NAMES } from '../oobe';

const auth = {
  clientId: 'client-1',
  token: 'token-1',
  scopes: ['mcp:tools', 'mcp:tools:x402', 'mcp:tools:escrow'],
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
};

describe('OOBE MCP tool filtering', () => {
  const previousProgramId = process.env.MCP_PROGRAM_ID;
  const previousPrivateKey = process.env.MCP_AGENT_KEYPAIR;
  const previousRpcUrl = process.env.SOLANA_RPC_URL;

  beforeEach(() => {
    const keypair = Keypair.generate();
    process.env.MCP_PROGRAM_ID = Keypair.generate().publicKey.toBase58();
    process.env.MCP_AGENT_KEYPAIR = bs58.encode(keypair.secretKey);
    process.env.SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
  });

  afterEach(() => {
    if (previousProgramId === undefined) delete process.env.MCP_PROGRAM_ID;
    else process.env.MCP_PROGRAM_ID = previousProgramId;

    if (previousPrivateKey === undefined) delete process.env.MCP_AGENT_KEYPAIR;
    else process.env.MCP_AGENT_KEYPAIR = previousPrivateKey;

    if (previousRpcUrl === undefined) delete process.env.SOLANA_RPC_URL;
    else process.env.SOLANA_RPC_URL = previousRpcUrl;
  });

  it('limits the partner-visible tool list to the OOBE allowlist', () => {
    const tools = getVisibleToolDefinitions(auth, {
      allowedTools: OOBE_ALLOWED_TOOL_NAMES,
    });

    expect(tools.map((tool) => tool.name)).toEqual([
      'meishi_verify_agent',
      'meishi_get_passport',
      'meishi_get_mandate',
      'meishi_get_audit',
      'assess_data_quality',
      'estimate_refund',
      'get_api_reputation',
      'x402_check_pricing',
      'x402_fetch',
    ]);
  });

  it('keeps the public tool surface broader than the OOBE pack', () => {
    const tools = getVisibleToolDefinitions(auth);
    const names = tools.map((tool) => tool.name);

    expect(names).toContain('meishi_verify_agent');
    expect(names).toContain('file_dispute_truth_court');
    expect(names.length).toBeGreaterThan(OOBE_ALLOWED_TOOL_NAMES.length);
  });

  it('rejects disallowed target hosts before any x402 network call', async () => {
    await expect(
      executeHostedTool(
        'x402_check_pricing',
        { url: 'https://evil.example/api' },
        {
          allowedTools: OOBE_ALLOWED_TOOL_NAMES,
          allowedX402Hosts: ['api.kamiyo.ai', 'x402.kamiyo.ai'],
        }
      )
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'target url not allowed',
    });
  });
});
