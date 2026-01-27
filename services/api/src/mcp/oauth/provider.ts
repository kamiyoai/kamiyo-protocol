// OAuth Server Provider

import { createHash, randomBytes } from 'crypto';
import type { Response } from 'express';
import type { OAuthServerProvider, AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthClientInformationFull, OAuthTokenRevocationRequest, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { KamiyoOAuthClientsStore } from './clients-store.js';
import {
  getMcpOAuthCode,
  createMcpOAuthCode,
  deleteMcpOAuthCode,
  getMcpOAuthToken,
  createMcpOAuthToken,
  revokeMcpOAuthToken,
} from '../../db.js';
import { mcpOAuthTotal } from '../../metrics.js';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  const hash = createHash('sha256').update(codeVerifier).digest();
  const computed = hash.toString('base64url');
  return computed === codeChallenge;
}

const ACCESS_TOKEN_TTL = 60 * 60; // 1h
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60; // 30d
const AUTH_CODE_TTL = 10 * 60; // 10m

export class KamiyoOAuthProvider implements OAuthServerProvider {
  private _clientsStore: KamiyoOAuthClientsStore;

  constructor() {
    this._clientsStore = new KamiyoOAuthClientsStore();
  }

  get clientsStore(): KamiyoOAuthClientsStore {
    return this._clientsStore;
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    const code = randomBytes(32).toString('hex');
    const now = Math.floor(Date.now() / 1000);

    createMcpOAuthCode({
      code,
      client_id: client.client_id,
      redirect_uri: params.redirectUri,
      code_challenge: params.codeChallenge,
      code_challenge_method: 'S256',
      scopes: JSON.stringify(params.scopes || ['mcp:tools']),
      user_wallet: null,
      resource: params.resource?.toString() || null,
      expires_at: now + AUTH_CODE_TTL,
    });

    const redirectUrl = new URL(params.redirectUri);
    redirectUrl.searchParams.set('code', code);
    if (params.state) {
      redirectUrl.searchParams.set('state', params.state);
    }

    mcpOAuthTotal.inc({ operation: 'authorize', status: 'success' });
    res.redirect(redirectUrl.toString());
  }

  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {
    const record = getMcpOAuthCode(authorizationCode);
    if (!record) throw new Error('invalid code');
    if (record.client_id !== client.client_id) throw new Error('client mismatch');
    return record.code_challenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    codeVerifier?: string,
    redirectUri?: string,
    resource?: URL
  ): Promise<OAuthTokens> {
    const record = getMcpOAuthCode(authorizationCode);
    if (!record) throw new Error('invalid code');
    if (record.client_id !== client.client_id) throw new Error('client mismatch');

    const now = Math.floor(Date.now() / 1000);
    if (record.expires_at < now) {
      deleteMcpOAuthCode(authorizationCode);
      throw new Error('code expired');
    }

    // PKCE validation - required if code_challenge was provided
    if (record.code_challenge) {
      if (!codeVerifier) throw new Error('code_verifier required');
      if (!verifyPkce(codeVerifier, record.code_challenge)) {
        deleteMcpOAuthCode(authorizationCode);
        throw new Error('invalid code_verifier');
      }
    }

    // Redirect URI validation
    if (redirectUri && redirectUri !== record.redirect_uri) {
      deleteMcpOAuthCode(authorizationCode);
      throw new Error('redirect_uri mismatch');
    }

    deleteMcpOAuthCode(authorizationCode);

    const accessToken = randomBytes(32).toString('hex');
    const refreshToken = randomBytes(32).toString('hex');
    const scopes = JSON.parse(record.scopes) as string[];
    const resourceStr = resource?.toString() || record.resource;

    createMcpOAuthToken({
      token_hash: hashToken(accessToken),
      token_type: 'access',
      client_id: client.client_id,
      user_wallet: record.user_wallet,
      scopes: record.scopes,
      resource: resourceStr,
      expires_at: now + ACCESS_TOKEN_TTL,
    });

    createMcpOAuthToken({
      token_hash: hashToken(refreshToken),
      token_type: 'refresh',
      client_id: client.client_id,
      user_wallet: record.user_wallet,
      scopes: record.scopes,
      resource: resourceStr,
      expires_at: now + REFRESH_TOKEN_TTL,
    });

    mcpOAuthTotal.inc({ operation: 'token_exchange', status: 'success' });
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL,
      refresh_token: refreshToken,
      scope: scopes.join(' '),
    };
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    resource?: URL
  ): Promise<OAuthTokens> {
    const tokenHash = hashToken(refreshToken);
    const record = getMcpOAuthToken(tokenHash);

    if (!record || record.token_type !== 'refresh') throw new Error('invalid refresh token');
    if (record.client_id !== client.client_id) throw new Error('client mismatch');
    if (record.revoked) throw new Error('token revoked');

    const now = Math.floor(Date.now() / 1000);
    if (record.expires_at < now) throw new Error('token expired');

    const tokenScopes = scopes || (JSON.parse(record.scopes) as string[]);
    const resourceStr = resource?.toString() || record.resource;
    const accessToken = randomBytes(32).toString('hex');

    createMcpOAuthToken({
      token_hash: hashToken(accessToken),
      token_type: 'access',
      client_id: client.client_id,
      user_wallet: record.user_wallet,
      scopes: JSON.stringify(tokenScopes),
      resource: resourceStr,
      expires_at: now + ACCESS_TOKEN_TTL,
    });

    mcpOAuthTotal.inc({ operation: 'refresh', status: 'success' });
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL,
      scope: tokenScopes.join(' '),
    };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const tokenHash = hashToken(token);
    const record = getMcpOAuthToken(tokenHash);

    if (!record || record.token_type !== 'access') throw new Error('invalid token');
    if (record.revoked) throw new Error('token revoked');

    const now = Math.floor(Date.now() / 1000);
    if (record.expires_at < now) throw new Error('token expired');

    return {
      token,
      clientId: record.client_id,
      scopes: JSON.parse(record.scopes) as string[],
      expiresAt: record.expires_at,
      resource: record.resource ? new URL(record.resource) : undefined,
      extra: record.user_wallet ? { wallet: record.user_wallet } : undefined,
    };
  }

  async revokeToken(
    client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest
  ): Promise<void> {
    const tokenHash = hashToken(request.token);
    revokeMcpOAuthToken(tokenHash, client.client_id);
    mcpOAuthTotal.inc({ operation: 'revoke', status: 'success' });
  }
}
