// config/pricingPlans.js
/**
 * Centralized pricing configuration for MCP subscriptions and x402 API
 * Used across homepage and pricing page to ensure consistency
 */

export const mcpPlans = [
    {
        name: 'MCP Personal',
        price: '$19',
        priceDetail: '/mo',
        tier: 'personal',
        features: [
            'Unlimited security queries',
            'Claude Desktop integration',
            'Real-time exploit data (20+ sources)',
            '1 AI agent',
            'Email support'
        ]
    },
    {
        name: 'MCP Team',
        price: '$99',
        priceDetail: '/mo',
        tier: 'team',
        features: [
            'Everything in Personal',
            '5 AI agents',
            'Team workspace',
            'Webhook notifications',
            'Priority support'
        ]
    },
    {
        name: 'MCP Enterprise',
        price: '$299',
        priceDetail: '/mo',
        tier: 'enterprise',
        features: [
            'Everything in Team',
            'Unlimited AI agents',
            'Custom MCP tools',
            '99.9% SLA guarantee',
            'Dedicated support engineer'
        ]
    },
    {
        name: 'x402 API',
        price: '$0.01',
        priceDetail: '/query',
        tier: 'x402',
        features: [
            'Pay per query ($0.01 USDC)',
            'No subscription required',
            'No account or API keys needed',
            'Pay with USDC on Base/ETH/Solana',
            '100 queries per token (24h validity)'
        ]
    }
];

// For pricing page - separate out x402 from MCP tiers
export const mcpSubscriptionPlans = mcpPlans.slice(0, 3);
export const x402Plan = mcpPlans[3];
