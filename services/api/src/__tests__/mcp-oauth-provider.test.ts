import { createHash } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const oauthCodes = new Map<string, any>();
const oauthTokens = new Map<string, any>();
const oauthClients = new Map<string, any>();

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

vi.mock('../db.js', () => {
  return {
    getMcpOAuthClient: (clientId: string) => oauthClients.get(clientId) ?? null,
    createMcpOAuthClient: (client: any) => {
      const now = nowSeconds();
      oauthClients.set(client.client_id, { ...client, created_at: now, updated_at: now });
    },

    getMcpOAuthCode: (code: string) => oauthCodes.get(code) ?? null,
    createMcpOAuthCode: (record: any) => {
      const now = nowSeconds();
      oauthCodes.set(record.code, { ...record, created_at: now });
    },
    deleteMcpOAuthCode: (code: string) => {
      oauthCodes.delete(code);
    },

    getMcpOAuthToken: (tokenHash: string) => oauthTokens.get(tokenHash) ?? null,
    createMcpOAuthToken: (token: any) => {
      const now = nowSeconds();
      oauthTokens.set(token.token_hash, { ...token, revoked: 0, created_at: now });
    },
    revokeMcpOAuthToken: (tokenHash: string, clientId: string) => {
      const record = oauthTokens.get(tokenHash);
      if (!record || record.client_id !== clientId) return;
      oauthTokens.set(tokenHash, { ...record, revoked: 1 });
    },
  };
});

import { KamiyoOAuthProvider } from '../mcp/oauth/provider';

describe('KamiyoOAuthProvider', () => {
  beforeEach(() => {
    oauthCodes.clear();
    oauthTokens.clear();
    oauthClients.clear();
  });

  it('requires PKCE code_challenge in authorize', async () => {
    const provider = new KamiyoOAuthProvider();
    const res = { redirect: vi.fn() };

    const client = {
      client_id: 'c1',
      redirect_uris: ['https://example.com/cb'],
      scope: 'mcp:tools',
    } as any;

    await expect(
      provider.authorize(
        client,
        {
          redirectUri: 'https://example.com/cb',
          codeChallenge: undefined,
          scopes: ['mcp:tools'],
        } as any,
        res
      )
    ).rejects.toThrow('code_challenge required');
  });

  it('rejects unregistered redirect_uri', async () => {
    const provider = new KamiyoOAuthProvider();
    const res = { redirect: vi.fn() };

    const client = {
      client_id: 'c1',
      redirect_uris: ['https://example.com/cb'],
      scope: 'mcp:tools',
    } as any;

    await expect(
      provider.authorize(
        client,
        {
          redirectUri: 'https://attacker.example/cb',
          codeChallenge: 'x',
          scopes: ['mcp:tools'],
        } as any,
        res
      )
    ).rejects.toThrow('redirect_uri not registered');
  });

  it('rejects scopes outside client scope on authorize', async () => {
    const provider = new KamiyoOAuthProvider();
    const res = { redirect: vi.fn() };

    const client = {
      client_id: 'c1',
      redirect_uris: ['https://example.com/cb'],
      scope: 'mcp:tools:escrow',
    } as any;

    await expect(
      provider.authorize(
        client,
        {
          redirectUri: 'https://example.com/cb',
          codeChallenge: 'x',
          scopes: ['mcp:tools:x402'],
        } as any,
        res
      )
    ).rejects.toThrow('invalid scope');
  });

  it('prevents refresh token scope escalation', async () => {
    const provider = new KamiyoOAuthProvider();
    const refreshToken = 'refresh';
    const tokenHash = sha256Hex(refreshToken);

    oauthTokens.set(tokenHash, {
      token_hash: tokenHash,
      token_type: 'refresh',
      client_id: 'c1',
      user_wallet: null,
      scopes: JSON.stringify(['mcp:tools:x402']),
      resource: null,
      expires_at: nowSeconds() + 3600,
      revoked: 0,
      created_at: nowSeconds(),
    });

    const client = { client_id: 'c1' } as any;
    await expect(
      provider.exchangeRefreshToken(client, refreshToken, ['mcp:tools'])
    ).rejects.toThrow('invalid scope');
  });

  it('allows refresh token scope narrowing', async () => {
    const provider = new KamiyoOAuthProvider();
    const refreshToken = 'refresh';
    const tokenHash = sha256Hex(refreshToken);

    oauthTokens.set(tokenHash, {
      token_hash: tokenHash,
      token_type: 'refresh',
      client_id: 'c1',
      user_wallet: null,
      scopes: JSON.stringify(['mcp:tools', 'mcp:tools:x402']),
      resource: null,
      expires_at: nowSeconds() + 3600,
      revoked: 0,
      created_at: nowSeconds(),
    });

    const client = { client_id: 'c1' } as any;
    const tokens = await provider.exchangeRefreshToken(client, refreshToken, ['mcp:tools:x402']);
    expect(tokens.scope).toBe('mcp:tools:x402');
  });

  it('enforces resource binding on refresh token exchange', async () => {
    const provider = new KamiyoOAuthProvider();
    const refreshToken = 'refresh';
    const tokenHash = sha256Hex(refreshToken);

    oauthTokens.set(tokenHash, {
      token_hash: tokenHash,
      token_type: 'refresh',
      client_id: 'c1',
      user_wallet: null,
      scopes: JSON.stringify(['mcp:tools']),
      resource: 'https://api.example.com/mcp',
      expires_at: nowSeconds() + 3600,
      revoked: 0,
      created_at: nowSeconds(),
    });

    const client = { client_id: 'c1' } as any;
    await expect(
      provider.exchangeRefreshToken(client, refreshToken, undefined, new URL('https://other.example/mcp'))
    ).rejects.toThrow('resource mismatch');
  });
});
