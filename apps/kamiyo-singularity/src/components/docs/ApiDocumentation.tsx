'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

const API_BASE = 'https://api.kamiyo.ai/v1';

interface Endpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  summary: string;
  description?: string;
  auth: boolean;
  rateLimit?: string;
  params?: { name: string; type: string; required: boolean; description: string }[];
  body?: { example: string; schema: string };
  response?: { example: string; description?: string };
}

interface EndpointGroup {
  name: string;
  description: string;
  endpoints: Endpoint[];
}

const API_DOCS: EndpointGroup[] = [
  {
    name: 'Authentication',
    description: 'Wallet-based JWT authentication',
    endpoints: [
      {
        method: 'GET',
        path: '/auth/nonce',
        summary: 'Get authentication nonce',
        description: 'Request a nonce to sign with your wallet for authentication.',
        auth: false,
        rateLimit: '10 req/min per IP',
        params: [
          { name: 'wallet', type: 'string', required: true, description: 'Wallet public key (base58)' },
        ],
        response: {
          example: `{
  "nonce": "Sign this message to authenticate with KAMIYO Singularity: abc123...",
  "expiresAt": 1704067200
}`,
        },
      },
      {
        method: 'POST',
        path: '/auth/login',
        summary: 'Login with wallet signature',
        auth: false,
        rateLimit: '10 req/min per IP',
        body: {
          schema: 'LoginRequest',
          example: `{
  "wallet": "7xKXGNVBrpYWzLvMrEPvYxSYZJJcE6nQ8DKwVFSBdQhh",
  "signature": "base58-encoded-signature",
  "message": "Sign this message to authenticate..."
}`,
        },
        response: {
          example: `{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 900
}`,
        },
      },
      {
        method: 'POST',
        path: '/auth/refresh',
        summary: 'Refresh access token',
        auth: true,
        body: {
          schema: 'RefreshRequest',
          example: `{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}`,
        },
        response: {
          example: `{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 900
}`,
        },
      },
    ],
  },
  {
    name: 'Markets',
    description: 'Market data and operations',
    endpoints: [
      {
        method: 'GET',
        path: '/markets',
        summary: 'List markets',
        auth: false,
        params: [
          { name: 'status', type: 'string', required: false, description: 'Filter by status: active, paused, closed, resolved' },
          { name: 'category', type: 'string', required: false, description: 'Filter by category' },
          { name: 'sort', type: 'string', required: false, description: 'Sort by: volume, newest, ending' },
          { name: 'limit', type: 'integer', required: false, description: 'Results per page (default: 20, max: 100)' },
          { name: 'offset', type: 'integer', required: false, description: 'Pagination offset' },
        ],
        response: {
          example: `{
  "data": [
    {
      "id": "abc123",
      "question": "Will BTC reach $100k by 2025?",
      "yesPrice": 65.5,
      "noPrice": 34.5,
      "volume24h": 150000,
      "status": "active"
    }
  ],
  "total": 42,
  "hasMore": true
}`,
        },
      },
      {
        method: 'GET',
        path: '/markets/{id}',
        summary: 'Get market details',
        auth: false,
        params: [
          { name: 'id', type: 'string', required: true, description: 'Market ID' },
        ],
        response: {
          example: `{
  "id": "abc123",
  "address": "7xKXG...",
  "question": "Will BTC reach $100k by 2025?",
  "description": "Resolves YES if Bitcoin...",
  "category": "crypto",
  "status": "active",
  "yesPrice": 65.5,
  "noPrice": 34.5,
  "volume24h": 150000,
  "totalVolume": 2500000,
  "resolutionDeadline": "2025-12-31T23:59:59Z"
}`,
        },
      },
      {
        method: 'GET',
        path: '/markets/{id}/orderbook',
        summary: 'Get order book',
        auth: false,
        params: [
          { name: 'id', type: 'string', required: true, description: 'Market ID' },
          { name: 'outcome', type: 'string', required: true, description: 'yes or no' },
          { name: 'depth', type: 'integer', required: false, description: 'Number of levels (default: 20)' },
        ],
        response: {
          example: `{
  "marketId": "abc123",
  "outcome": "yes",
  "bids": [
    { "price": 65.0, "quantity": 1000, "orders": 5 }
  ],
  "asks": [
    { "price": 66.0, "quantity": 500, "orders": 3 }
  ],
  "lastUpdated": "2024-01-01T12:00:00Z"
}`,
        },
      },
    ],
  },
  {
    name: 'Orders',
    description: 'Order placement and management',
    endpoints: [
      {
        method: 'POST',
        path: '/orders',
        summary: 'Place order',
        auth: true,
        rateLimit: '10 req/min per user',
        body: {
          schema: 'PlaceOrderRequest',
          example: `{
  "marketId": "abc123",
  "side": "buy",
  "outcome": "yes",
  "orderType": "limit",
  "price": 65.0,
  "quantity": 100
}`,
        },
        response: {
          example: `{
  "orderId": "ord_xyz789",
  "status": "open",
  "txSignature": "5xKXG..."
}`,
        },
      },
      {
        method: 'GET',
        path: '/orders',
        summary: 'List user orders',
        auth: true,
        params: [
          { name: 'marketId', type: 'string', required: false, description: 'Filter by market' },
          { name: 'status', type: 'string', required: false, description: 'Filter by status' },
          { name: 'limit', type: 'integer', required: false, description: 'Results per page' },
        ],
        response: {
          example: `{
  "data": [
    {
      "id": "ord_xyz789",
      "marketId": "abc123",
      "side": "buy",
      "outcome": "yes",
      "price": 65.0,
      "quantity": 100,
      "filledQuantity": 50,
      "status": "partially_filled"
    }
  ],
  "total": 5,
  "hasMore": false
}`,
        },
      },
      {
        method: 'DELETE',
        path: '/orders/{id}',
        summary: 'Cancel order',
        auth: true,
        rateLimit: '10 req/min per user',
        params: [
          { name: 'id', type: 'string', required: true, description: 'Order ID' },
        ],
        response: {
          example: `{
  "success": true,
  "txSignature": "5xKXG..."
}`,
        },
      },
    ],
  },
  {
    name: 'Positions',
    description: 'User positions and claims',
    endpoints: [
      {
        method: 'GET',
        path: '/positions',
        summary: 'List user positions',
        auth: true,
        response: {
          example: `{
  "data": [
    {
      "marketId": "abc123",
      "marketQuestion": "Will BTC...",
      "yesBalance": 100,
      "noBalance": 0,
      "avgYesCost": 60.0,
      "currentYesPrice": 65.5,
      "unrealizedPnl": 5.50
    }
  ],
  "total": 3
}`,
        },
      },
      {
        method: 'POST',
        path: '/positions/{marketId}/claim',
        summary: 'Claim winnings',
        description: 'Redeem winning tokens after market resolution.',
        auth: true,
        rateLimit: '5 req/min per user',
        params: [
          { name: 'marketId', type: 'string', required: true, description: 'Market ID' },
        ],
        response: {
          example: `{
  "amount": 150.00,
  "txSignature": "5xKXG..."
}`,
        },
      },
    ],
  },
  {
    name: 'Wallet',
    description: 'Deposits and withdrawals',
    endpoints: [
      {
        method: 'GET',
        path: '/wallet/balance',
        summary: 'Get wallet balance',
        auth: true,
        response: {
          example: `{
  "available": 1000.00,
  "locked": 250.00,
  "total": 1250.00,
  "pendingDeposits": 0,
  "pendingWithdrawals": 0
}`,
        },
      },
      {
        method: 'POST',
        path: '/wallet/deposit',
        summary: 'Initiate deposit',
        auth: true,
        body: {
          schema: 'DepositRequest',
          example: `{
  "amount": 100.00,
  "source": "wallet",
  "txSignature": "5xKXG..."
}`,
        },
        response: {
          example: `{
  "transactionId": "tx_abc123",
  "status": "pending",
  "amount": 100.00
}`,
        },
      },
      {
        method: 'POST',
        path: '/wallet/withdraw',
        summary: 'Request withdrawal',
        auth: true,
        body: {
          schema: 'WithdrawRequest',
          example: `{
  "amount": 100.00,
  "destination": "7xKXG..."
}`,
        },
        response: {
          example: `{
  "transactionId": "tx_xyz789",
  "status": "pending",
  "amount": 100.00,
  "fee": 0.50,
  "netAmount": 99.50
}`,
        },
      },
    ],
  },
];

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-bid/20 text-bid',
  POST: 'bg-accent/20 text-accent',
  PUT: 'bg-yellow-500/20 text-yellow-500',
  DELETE: 'bg-ask/20 text-ask',
};

export function ApiDocumentation() {
  const [activeGroup, setActiveGroup] = useState(API_DOCS[0].name);
  const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>(null);

  const currentGroup = API_DOCS.find((g) => g.name === activeGroup);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-text-primary mb-2">API Documentation</h1>
        <p className="text-text-secondary">
          REST API for the KAMIYO Singularity prediction market platform
        </p>
      </div>

      {/* Quick Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardContent className="py-4">
            <h3 className="text-sm font-medium text-text-secondary mb-1">Base URL</h3>
            <code className="text-sm text-accent">{API_BASE}</code>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <h3 className="text-sm font-medium text-text-secondary mb-1">Authentication</h3>
            <code className="text-sm text-text-primary">Authorization: Bearer &lt;token&gt;</code>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <h3 className="text-sm font-medium text-text-secondary mb-1">Content Type</h3>
            <code className="text-sm text-text-primary">application/json</code>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-8">
        {/* Sidebar */}
        <div className="w-48 flex-shrink-0 hidden md:block">
          <nav className="sticky top-4 space-y-1">
            {API_DOCS.map((group) => (
              <button
                key={group.name}
                onClick={() => setActiveGroup(group.name)}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer',
                  activeGroup === group.name
                    ? 'bg-accent text-white'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
                )}
              >
                {group.name}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Mobile nav */}
          <div className="md:hidden mb-6">
            <select
              value={activeGroup}
              onChange={(e) => setActiveGroup(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-border text-text-primary"
            >
              {API_DOCS.map((group) => (
                <option key={group.name} value={group.name}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>

          {currentGroup && (
            <div>
              <h2 className="text-2xl font-bold text-text-primary mb-2">
                {currentGroup.name}
              </h2>
              <p className="text-text-secondary mb-6">{currentGroup.description}</p>

              <div className="space-y-4">
                {currentGroup.endpoints.map((endpoint) => {
                  const key = `${endpoint.method}-${endpoint.path}`;
                  const isExpanded = expandedEndpoint === key;

                  return (
                    <Card key={key}>
                      <button
                        onClick={() => setExpandedEndpoint(isExpanded ? null : key)}
                        className="w-full text-left cursor-pointer"
                      >
                        <CardContent className="py-4">
                          <div className="flex items-center gap-3">
                            <span
                              className={cn(
                                'px-2 py-0.5 rounded text-xs font-mono font-medium',
                                METHOD_COLORS[endpoint.method]
                              )}
                            >
                              {endpoint.method}
                            </span>
                            <code className="text-sm text-text-primary font-mono">
                              {endpoint.path}
                            </code>
                            {endpoint.auth && (
                              <Badge variant="default" className="text-xs">Auth</Badge>
                            )}
                            <span className="flex-1 text-sm text-text-secondary truncate">
                              {endpoint.summary}
                            </span>
                            <svg
                              className={cn(
                                'w-5 h-5 text-text-secondary transition-transform',
                                isExpanded && 'rotate-180'
                              )}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </CardContent>
                      </button>

                      {isExpanded && (
                        <CardContent className="pt-0 pb-4 border-t border-border">
                          {endpoint.description && (
                            <p className="text-sm text-text-secondary mb-4">
                              {endpoint.description}
                            </p>
                          )}

                          {endpoint.rateLimit && (
                            <p className="text-xs text-text-secondary mb-4">
                              Rate limit: {endpoint.rateLimit}
                            </p>
                          )}

                          {endpoint.params && endpoint.params.length > 0 && (
                            <div className="mb-4">
                              <h4 className="text-sm font-medium text-text-primary mb-2">
                                Parameters
                              </h4>
                              <div className="bg-bg-tertiary rounded-lg overflow-hidden">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b border-border">
                                      <th className="text-left px-3 py-2 text-text-secondary font-medium">Name</th>
                                      <th className="text-left px-3 py-2 text-text-secondary font-medium">Type</th>
                                      <th className="text-left px-3 py-2 text-text-secondary font-medium">Required</th>
                                      <th className="text-left px-3 py-2 text-text-secondary font-medium">Description</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {endpoint.params.map((param) => (
                                      <tr key={param.name} className="border-b border-border last:border-0">
                                        <td className="px-3 py-2 font-mono text-accent">{param.name}</td>
                                        <td className="px-3 py-2 text-text-secondary">{param.type}</td>
                                        <td className="px-3 py-2">
                                          {param.required ? (
                                            <span className="text-ask">Yes</span>
                                          ) : (
                                            <span className="text-text-secondary">No</span>
                                          )}
                                        </td>
                                        <td className="px-3 py-2 text-text-primary">{param.description}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {endpoint.body && (
                            <div className="mb-4">
                              <h4 className="text-sm font-medium text-text-primary mb-2">
                                Request Body
                              </h4>
                              <pre className="bg-bg-tertiary rounded-lg p-4 overflow-x-auto text-sm text-text-primary font-mono">
                                {endpoint.body.example}
                              </pre>
                            </div>
                          )}

                          {endpoint.response && (
                            <div>
                              <h4 className="text-sm font-medium text-text-primary mb-2">
                                Response
                              </h4>
                              <pre className="bg-bg-tertiary rounded-lg p-4 overflow-x-auto text-sm text-text-primary font-mono">
                                {endpoint.response.example}
                              </pre>
                            </div>
                          )}
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
