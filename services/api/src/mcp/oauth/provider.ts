/**
 * OAuth Server Provider
 * Implements OAuthServerProvider interface from MCP SDK
 */

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

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const ACCESS_TOKEN_EXPIRY = 60 * 60; // 1 hour in seconds
const REFRESH_TOKEN_EXPIRY = 30 * 24 * 60 * 60; // 30 days in seconds
const AUTH_CODE_EXPIRY = 10 * 60; // 10 minutes in seconds

export class KamiyoOAuthProvider implements OAuthServerProvider {
  private _clientsStore: KamiyoOAuthClientsStore;

  constructor() {
    this._clientsStore = new KamiyoOAuthClientsStore();
  }

  get clientsStore(): KamiyoOAuthClientsStore {
    return this._clientsStore;
  }

  /**
   * Begin authorization flow.
   * For MCP, we auto-authorize and redirect back with code.
   * In production, this could integrate with wallet signing.
   */
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    // Generate authorization code
    const code = randomBytes(32).toString('hex');
    const now = Math.floor(Date.now() / 1000);

    createMcpOAuthCode({
      code,
      client_id: client.client_id,
      redirect_uri: params.redirectUri,
      code_challenge: params.codeChallenge,
      code_challenge_method: 'S256',
      scopes: JSON.stringify(params.scopes || ['mcp:tools']),
      user_wallet: null, // Could be populated from wallet auth
      resource: params.resource?.toString() || null,
      expires_at: now + AUTH_CODE_EXPIRY,
    });

    // Redirect back with code
    const redirectUrl = new URL(params.redirectUri);
    redirectUrl.searchParams.set('code', code);
    if (params.state) {
      redirectUrl.searchParams.set('state', params.state);
    }

    res.redirect(redirectUrl.toString());
  }

  /**
   * Get code challenge for PKCE verification
   */
  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {
    const record = getMcpOAuthCode(authorizationCode);
    if (!record) {
      throw new Error('Invalid authorization code');
    }
    if (record.client_id !== client.client_id) {
      throw new Error('Client mismatch');
    }
    return record.code_challenge;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    _redirectUri?: string,
    resource?: URL
  ): Promise<OAuthTokens> {
    const record = getMcpOAuthCode(authorizationCode);
    if (!record) {
      throw new Error('Invalid authorization code');
    }
    if (record.client_id !== client.client_id) {
      throw new Error('Client mismatch');
    }

    const now = Math.floor(Date.now() / 1000);
    if (record.expires_at < now) {
      deleteMcpOAuthCode(authorizationCode);
      throw new Error('Authorization code expired');
    }

    // Delete used code (single use)
    deleteMcpOAuthCode(authorizationCode);

    // Generate tokens
    const accessToken = randomBytes(32).toString('hex');
    const refreshToken = randomBytes(32).toString('hex');
    const scopes = JSON.parse(record.scopes) as string[];
    const resourceStr = resource?.toString() || record.resource;

    // Store access token
    createMcpOAuthToken({
      token_hash: hashToken(accessToken),
      token_type: 'access',
      client_id: client.client_id,
      user_wallet: record.user_wallet,
      scopes: record.scopes,
      resource: resourceStr,
      expires_at: now + ACCESS_TOKEN_EXPIRY,
    });

    // Store refresh token
    createMcpOAuthToken({
      token_hash: hashToken(refreshToken),
      token_type: 'refresh',
      client_id: client.client_id,
      user_wallet: record.user_wallet,
      scopes: record.scopes,
      resource: resourceStr,
      expires_at: now + REFRESH_TOKEN_EXPIRY,
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_EXPIRY,
      refresh_token: refreshToken,
      scope: scopes.join(' '),
    };
  }

  /**
   * Exchange refresh token for new access token
   */
  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    resource?: URL
  ): Promise<OAuthTokens> {
    const tokenHash = hashToken(refreshToken);
    const record = getMcpOAuthToken(tokenHash);

    if (!record || record.token_type !== 'refresh') {
      throw new Error('Invalid refresh token');
    }
    if (record.client_id !== client.client_id) {
      throw new Error('Client mismatch');
    }
    if (record.revoked) {
      throw new Error('Token revoked');
    }

    const now = Math.floor(Date.now() / 1000);
    if (record.expires_at < now) {
      throw new Error('Refresh token expired');
    }

    // Use provided scopes or original scopes
    const tokenScopes = scopes || (JSON.parse(record.scopes) as string[]);
    const resourceStr = resource?.toString() || record.resource;

    // Generate new access token
    const accessToken = randomBytes(32).toString('hex');

    createMcpOAuthToken({
      token_hash: hashToken(accessToken),
      token_type: 'access',
      client_id: client.client_id,
      user_wallet: record.user_wallet,
      scopes: JSON.stringify(tokenScopes),
      resource: resourceStr,
      expires_at: now + ACCESS_TOKEN_EXPIRY,
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_EXPIRY,
      scope: tokenScopes.join(' '),
    };
  }

  /**
   * Verify access token and return auth info
   */
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const tokenHash = hashToken(token);
    const record = getMcpOAuthToken(tokenHash);

    if (!record || record.token_type !== 'access') {
      throw new Error('Invalid access token');
    }
    if (record.revoked) {
      throw new Error('Token revoked');
    }

    const now = Math.floor(Date.now() / 1000);
    if (record.expires_at < now) {
      throw new Error('Token expired');
    }

    return {
      token,
      clientId: record.client_id,
      scopes: JSON.parse(record.scopes) as string[],
      expiresAt: record.expires_at,
      resource: record.resource ? new URL(record.resource) : undefined,
      extra: record.user_wallet ? { wallet: record.user_wallet } : undefined,
    };
  }

  /**
   * Revoke a token
   */
  async revokeToken(
    client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest
  ): Promise<void> {
    const tokenHash = hashToken(request.token);
    revokeMcpOAuthToken(tokenHash, client.client_id);
  }
}
