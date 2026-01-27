// OAuth Clients Store

import { createHash, randomBytes, randomUUID } from 'crypto';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import { getMcpOAuthClient, createMcpOAuthClient, type McpOAuthClient } from '../../db.js';

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function toClientInfo(row: McpOAuthClient): OAuthClientInformationFull {
  return {
    client_id: row.client_id,
    client_secret: undefined,
    client_secret_expires_at: row.client_secret_expires_at ?? undefined,
    client_name: row.client_name,
    redirect_uris: JSON.parse(row.redirect_uris),
    grant_types: JSON.parse(row.grant_types),
    response_types: JSON.parse(row.response_types),
    scope: JSON.parse(row.scopes).join(' '),
    token_endpoint_auth_method: row.token_endpoint_auth_method as 'client_secret_basic' | 'client_secret_post' | 'none',
    client_id_issued_at: row.created_at,
  };
}

export class KamiyoOAuthClientsStore implements OAuthRegisteredClientsStore {
  getClient(clientId: string): OAuthClientInformationFull | undefined {
    const row = getMcpOAuthClient(clientId);
    return row ? toClientInfo(row) : undefined;
  }

  registerClient(
    client: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>
  ): OAuthClientInformationFull {
    const clientId = randomUUID();
    const clientSecret = randomBytes(32).toString('hex');
    const scopes = client.scope?.split(' ').filter(Boolean) || ['mcp:tools'];
    const grantTypes = client.grant_types || ['authorization_code', 'refresh_token'];
    const responseTypes = client.response_types || ['code'];

    createMcpOAuthClient({
      client_id: clientId,
      client_secret_hash: hashSecret(clientSecret),
      client_name: client.client_name || 'MCP Client',
      redirect_uris: JSON.stringify(client.redirect_uris || []),
      grant_types: JSON.stringify(grantTypes),
      response_types: JSON.stringify(responseTypes),
      scopes: JSON.stringify(scopes),
      token_endpoint_auth_method: client.token_endpoint_auth_method || 'client_secret_basic',
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
      scope: scopes.join(' '),
      token_endpoint_auth_method: client.token_endpoint_auth_method || 'client_secret_basic',
      client_id_issued_at: Math.floor(Date.now() / 1000),
    };
  }

  verifyClientSecret(clientId: string, secret: string): boolean {
    const row = getMcpOAuthClient(clientId);
    return row ? row.client_secret_hash === hashSecret(secret) : false;
  }
}
