// OAuth Clients Store

import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import { getMcpOAuthClient, createMcpOAuthClient, type McpOAuthClient } from '../../db.js';

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function parseScopes(scope: string | undefined): string[] {
  return (scope ?? '').split(' ').map((s) => s.trim()).filter(Boolean);
}

function parseJsonStringArray(value: string, fieldName: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`invalid ${fieldName}`);
  }
  if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === 'string')) {
    throw new Error(`invalid ${fieldName}`);
  }
  return parsed;
}

// Allowed redirect URI schemes and patterns
const ALLOWED_SCHEMES = ['https', 'http'];
const LOCALHOST_PATTERNS = ['localhost', '127.0.0.1', '[::1]'];
const ALLOWED_AUTH_METHODS = new Set(['client_secret_basic', 'client_secret_post', 'none']);

function isValidRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);

    // Must be http or https
    if (!ALLOWED_SCHEMES.includes(parsed.protocol.replace(':', ''))) {
      return false;
    }

    // http only allowed for localhost (development)
    if (parsed.protocol === 'http:') {
      const isLocalhost = LOCALHOST_PATTERNS.some(
        (p) => parsed.hostname === p || parsed.hostname.endsWith('.localhost')
      );
      if (!isLocalhost) {
        return false;
      }
    }

    // No fragments allowed in redirect URIs (OAuth spec)
    if (parsed.hash) {
      return false;
    }

    // No credentials in URI
    if (parsed.username || parsed.password) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function toClientInfo(row: McpOAuthClient): OAuthClientInformationFull {
  const redirectUris = parseJsonStringArray(row.redirect_uris, 'redirect_uris');
  const grantTypes = parseJsonStringArray(row.grant_types, 'grant_types');
  const responseTypes = parseJsonStringArray(row.response_types, 'response_types');
  const scopes = parseJsonStringArray(row.scopes, 'scopes');
  const normalizedScopes = scopes.length > 0 ? scopes : ['mcp:tools'];

  if (redirectUris.some((uri) => !isValidRedirectUri(uri))) {
    throw new Error('invalid redirect_uris');
  }
  if (!ALLOWED_AUTH_METHODS.has(row.token_endpoint_auth_method)) {
    throw new Error('invalid token_endpoint_auth_method');
  }

  return {
    client_id: row.client_id,
    client_secret: undefined,
    client_secret_expires_at: row.client_secret_expires_at ?? undefined,
    client_name: row.client_name,
    redirect_uris: redirectUris,
    grant_types: grantTypes,
    response_types: responseTypes,
    scope: normalizedScopes.join(' '),
    token_endpoint_auth_method: row.token_endpoint_auth_method as 'client_secret_basic' | 'client_secret_post' | 'none',
    client_id_issued_at: row.created_at,
  };
}

export class KamiyoOAuthClientsStore implements OAuthRegisteredClientsStore {
  getClient(clientId: string): OAuthClientInformationFull | undefined {
    const row = getMcpOAuthClient(clientId);
    if (!row) return undefined;
    try {
      return toClientInfo(row);
    } catch {
      return undefined;
    }
  }

  registerClient(
    client: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>
  ): OAuthClientInformationFull {
    // Validate redirect URIs
    const redirectUris = client.redirect_uris || [];
    if (redirectUris.length === 0) {
      throw new Error('At least one redirect_uri is required');
    }

    for (const uri of redirectUris) {
      if (!isValidRedirectUri(uri)) {
        throw new Error(`Invalid redirect_uri: ${uri}. Must be https (or http for localhost), no fragments or credentials.`);
      }
    }

    const clientId = randomUUID();
    const clientSecret = randomBytes(32).toString('hex');
    const scopes = parseScopes(client.scope);
    const normalizedScopes = scopes.length > 0 ? scopes : ['mcp:tools'];
    const grantTypes = client.grant_types || ['authorization_code', 'refresh_token'];
    const responseTypes = client.response_types || ['code'];
    const tokenAuthMethod = client.token_endpoint_auth_method || 'client_secret_basic';
    if (!ALLOWED_AUTH_METHODS.has(tokenAuthMethod)) {
      throw new Error(`Invalid token_endpoint_auth_method: ${tokenAuthMethod}`);
    }

    createMcpOAuthClient({
      client_id: clientId,
      client_secret_hash: hashSecret(clientSecret),
      client_name: client.client_name || 'MCP Client',
      redirect_uris: JSON.stringify(client.redirect_uris || []),
      grant_types: JSON.stringify(grantTypes),
      response_types: JSON.stringify(responseTypes),
      scopes: JSON.stringify(normalizedScopes),
      token_endpoint_auth_method: tokenAuthMethod,
      client_secret_expires_at: client.client_secret_expires_at ?? null,
    });

    return {
      client_id: clientId,
      client_secret: clientSecret,
      client_secret_expires_at: client.client_secret_expires_at,
      client_name: client.client_name,
      redirect_uris: client.redirect_uris || [],
      grant_types: grantTypes,
      response_types: responseTypes,
      scope: normalizedScopes.join(' '),
      token_endpoint_auth_method: tokenAuthMethod,
      client_id_issued_at: Math.floor(Date.now() / 1000),
    };
  }

  verifyClientSecret(clientId: string, secret: string): boolean {
    const row = getMcpOAuthClient(clientId);
    return row ? safeEqual(row.client_secret_hash, hashSecret(secret)) : false;
  }
}
