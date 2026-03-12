import { createHash } from 'crypto';
import type { AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type StoredOAuthCode = {
  code: string;
  client_id: string;
  redirect_uri: string;
  code_challenge?: string;
  scopes: string;
  user_wallet: string | null;
  resource: string | null;
  expires_at: number;
  created_at: number;
};

type StoredOAuthToken = {
  token_hash: string;
  token_type: 'access' | 'refresh';
  client_id: string;
  user_wallet: string | null;
  scopes: string;
  resource: string | null;
  expires_at: number;
  revoked: number;
  created_at: number;
};

type StoredOAuthClient = OAuthClientInformationFull & {
  created_at: number;
  updated_at: number;
};

type RedirectResponse = {
  redirect: ReturnType<typeof vi.fn<(url: string) => void>>;
};

const oauthCodes = new Map<string, StoredOAuthCode>();
const oauthTokens = new Map<string, StoredOAuthToken>();
const oauthClients = new Map<string, StoredOAuthClient>();

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

vi.mock('../db.js', () => {
  return {
    getMcpOAuthClient: (clientId: string) => oauthClients.get(clientId) ?? null,
    createMcpOAuthClient: (client: OAuthClientInformationFull) => {
      const now = nowSeconds();
      oauthClients.set(client.client_id, { ...client, created_at: now, updated_at: now });
    },

    getMcpOAuthCode: (code: string) => oauthCodes.get(code) ?? null,
    createMcpOAuthCode: (record: Omit<StoredOAuthCode, 'created_at'>) => {
      const now = nowSeconds();
      oauthCodes.set(record.code, { ...record, created_at: now });
    },
    deleteMcpOAuthCode: (code: string) => {
      oauthCodes.delete(code);
    },

    getMcpOAuthToken: (tokenHash: string) => oauthTokens.get(tokenHash) ?? null,
    createMcpOAuthToken: (token: Omit<StoredOAuthToken, 'revoked' | 'created_at'>) => {
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

function createClient(scope: string): OAuthClientInformationFull {
  return {
    client_id: 'c1',
    client_secret: 'secret',
    redirect_uris: ['https://example.com/cb'],
    scope,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'client_secret_basic',
    client_name: 'test-client',
  } as OAuthClientInformationFull;
}

function createAuthorizationParams(overrides: Partial<AuthorizationParams> = {}): AuthorizationParams {
  return {
    redirectUri: 'https://example.com/cb',
    codeChallenge: 'x',
    scopes: ['mcp:tools'],
    ...overrides,
  } as AuthorizationParams;
}

function createRedirectResponse(): RedirectResponse {
  return {
    redirect: vi.fn<(url: string) => void>(),
  };
}

describe('KamiyoOAuthProvider', () => {
  beforeEach(() => {
    oauthCodes.clear();
    oauthTokens.clear();
    oauthClients.clear();
  });

  it('requires PKCE code_challenge in authorize', async () => {
    const provider = new KamiyoOAuthProvider();
    const res = createRedirectResponse();
    const client = createClient('mcp:tools');

    await expect(
      provider.authorize(
        client,
        createAuthorizationParams({
          codeChallenge: undefined,
        }),
        res
      )
    ).rejects.toThrow('code_challenge required');
  });

  it('rejects unregistered redirect_uri', async () => {
    const provider = new KamiyoOAuthProvider();
    const res = createRedirectResponse();
    const client = createClient('mcp:tools');

    await expect(
      provider.authorize(
        client,
        createAuthorizationParams({
          redirectUri: 'https://attacker.example/cb',
        }),
        res
      )
    ).rejects.toThrow('redirect_uri not registered');
  });

  it('rejects scopes outside client scope on authorize', async () => {
    const provider = new KamiyoOAuthProvider();
    const res = createRedirectResponse();
    const client = createClient('mcp:tools:escrow');

    await expect(
      provider.authorize(
        client,
        createAuthorizationParams({
          scopes: ['mcp:tools:x402'],
        }),
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

    const client = createClient('mcp:tools:x402');
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

    const client = createClient('mcp:tools mcp:tools:x402');
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

    const client = createClient('mcp:tools');
    await expect(
      provider.exchangeRefreshToken(client, refreshToken, undefined, new URL('https://other.example/mcp'))
    ).rejects.toThrow('resource mismatch');
  });

  it('rejects access token verification when the resource does not match', async () => {
    const provider = new KamiyoOAuthProvider();
    const accessToken = 'access';
    const tokenHash = sha256Hex(accessToken);

    oauthTokens.set(tokenHash, {
      token_hash: tokenHash,
      token_type: 'access',
      client_id: 'c1',
      user_wallet: null,
      scopes: JSON.stringify(['mcp:tools']),
      resource: 'https://api.example.com/partners/oobe/mcp',
      expires_at: nowSeconds() + 3600,
      revoked: 0,
      created_at: nowSeconds(),
    });

    await expect(
      provider.verifyAccessToken(accessToken, {
        expectedResource: 'https://api.example.com/mcp',
        requireResource: true,
      })
    ).rejects.toThrow('resource mismatch');
  });

  it('requires a bound resource when the caller asks for it', async () => {
    const provider = new KamiyoOAuthProvider();
    const accessToken = 'access';
    const tokenHash = sha256Hex(accessToken);

    oauthTokens.set(tokenHash, {
      token_hash: tokenHash,
      token_type: 'access',
      client_id: 'c1',
      user_wallet: null,
      scopes: JSON.stringify(['mcp:tools']),
      resource: null,
      expires_at: nowSeconds() + 3600,
      revoked: 0,
      created_at: nowSeconds(),
    });

    await expect(
      provider.verifyAccessToken(accessToken, {
        expectedResource: 'https://api.example.com/partners/oobe/mcp',
        requireResource: true,
      })
    ).rejects.toThrow('resource binding required');
  });

  it('allows access token verification when the bound resource matches', async () => {
    const provider = new KamiyoOAuthProvider();
    const accessToken = 'access';
    const tokenHash = sha256Hex(accessToken);

    oauthTokens.set(tokenHash, {
      token_hash: tokenHash,
      token_type: 'access',
      client_id: 'c1',
      user_wallet: 'wallet-1',
      scopes: JSON.stringify(['mcp:tools:x402']),
      resource: 'https://api.example.com/partners/oobe/mcp',
      expires_at: nowSeconds() + 3600,
      revoked: 0,
      created_at: nowSeconds(),
    });

    const auth = await provider.verifyAccessToken(accessToken, {
      expectedResource: 'https://api.example.com/partners/oobe/mcp',
      requireResource: true,
    });

    expect(auth.clientId).toBe('c1');
    expect(auth.resource?.toString()).toBe('https://api.example.com/partners/oobe/mcp');
    expect(auth.extra).toEqual({ wallet: 'wallet-1' });
  });
});
