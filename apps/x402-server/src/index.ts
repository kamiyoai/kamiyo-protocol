import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors());
app.use(express.json());

// Serve static files (logo, favicon)
app.use('/public', express.static(path.join(__dirname, '../public')));

// Serve favicon
app.get('/favicon.ico', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/logo.png'));
});

// HTML homepage with OpenGraph metadata for x402scan scraper
app.get('/', (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KAMIYO</title>
  <meta name="description" content="Trustless infrastructure for autonomous AI agents. Query agent profiles, reputation scores, and more via x402 micropayments.">
  <link rel="icon" type="image/png" href="/public/logo.png">
  <link rel="apple-touch-icon" href="/public/logo.png">

  <!-- OpenGraph -->
  <meta property="og:title" content="KAMIYO">
  <meta property="og:description" content="Trustless infrastructure for autonomous AI agents. Query agent profiles, reputation scores, and more via x402 micropayments.">
  <meta property="og:image" content="https://x402.kamiyo.ai/public/logo.png">
  <meta property="og:url" content="https://x402.kamiyo.ai">
  <meta property="og:type" content="website">

  <!-- Twitter -->
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="KAMIYO">
  <meta name="twitter:description" content="Trustless infrastructure for autonomous AI agents">
  <meta name="twitter:image" content="https://x402.kamiyo.ai/public/logo.png">
</head>
<body style="font-family: system-ui, sans-serif; background: #0a0a0a; color: #fff; margin: 0; padding: 40px; max-width: 800px; margin: 0 auto;">
  <img src="/public/logo.png" alt="KAMIYO" style="width: 80px; height: 80px; margin-bottom: 20px;">
  <h1>KAMIYO</h1>
  <p>Trustless infrastructure for autonomous AI agents.</p>
  <h2>x402 API Endpoints</h2>
  <ul>
    <li><strong>/api/agents/:id</strong> - Query agent profile ($0.001 USDC)</li>
    <li><strong>/api/reputation/:id</strong> - Get reputation score ($0.0005 USDC)</li>
    <li><strong>/api/signals</strong> - Trading signals ($0.01 USDC)</li>
  </ul>
  <p>Networks: Base, Polygon, Arbitrum, Optimism, Avalanche, Solana</p>
  <p><a href="/.well-known/x402" style="color: #0cf;">Discovery Document</a> | <a href="/health" style="color: #0cf;">Health Check</a></p>
</body>
</html>`);
});

// Config
const PORT = parseInt(process.env.PORT || '3402', 10);
const HOST = process.env.HOST || '0.0.0.0';
const MERCHANT_ADDRESS = process.env.MERCHANT_ADDRESS || '';
const FACILITATOR_URL = process.env.PAYAI_FACILITATOR_URL || 'https://facilitator.payai.network';
const DKG_ENDPOINT = process.env.DKG_ENDPOINT || 'https://dkg.kamiyo.ai';
const ENABLE_REPUTATION_PRICING = process.env.ENABLE_REPUTATION_PRICING === 'true';
const SETTLEMENT_ENABLED = process.env.SETTLEMENT_ENABLED === 'true';

// Base pricing (in USDC)
const BASE_PRICES = {
  agentQuery: parseFloat(process.env.PRICE_AGENT_QUERY || '0.001'),
  reputationCheck: parseFloat(process.env.PRICE_REPUTATION_CHECK || '0.0005'),
  signal: parseFloat(process.env.PRICE_SIGNAL || '0.01'),
};

// Reputation-based pricing tiers
interface ReputationTier {
  name: string;
  minThreshold: number;
  discountPercent: number;
}

const REPUTATION_TIERS: ReputationTier[] = [
  { name: 'base', minThreshold: 0, discountPercent: 0 },
  { name: 'bronze', minThreshold: 40, discountPercent: 5 },
  { name: 'silver', minThreshold: 60, discountPercent: 15 },
  { name: 'gold', minThreshold: 80, discountPercent: 30 },
  { name: 'platinum', minThreshold: 95, discountPercent: 50 },
];

function getTierForThreshold(threshold: number): ReputationTier {
  const sorted = [...REPUTATION_TIERS].sort((a, b) => b.minThreshold - a.minThreshold);
  return sorted.find((t) => threshold >= t.minThreshold) || REPUTATION_TIERS[0];
}

function calculatePrice(basePrice: number, threshold: number | null): { price: number; discount: number; tier: ReputationTier } {
  if (threshold === null || !ENABLE_REPUTATION_PRICING) {
    return { price: basePrice, discount: 0, tier: REPUTATION_TIERS[0] };
  }
  const tier = getTierForThreshold(threshold);
  const discount = basePrice * (tier.discountPercent / 100);
  return { price: basePrice - discount, discount, tier };
}

// Network configs for USDC
const NETWORK_CONFIGS: Record<string, { chainId: string; usdc: string }> = {
  base: { chainId: 'eip155:8453', usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
  polygon: { chainId: 'eip155:137', usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' },
  arbitrum: { chainId: 'eip155:42161', usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' },
  optimism: { chainId: 'eip155:10', usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85' },
  avalanche: { chainId: 'eip155:43114', usdc: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E' },
  solana: { chainId: 'solana:mainnet', usdc: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
};

const SUPPORTED_NETWORKS = ['base', 'polygon', 'arbitrum', 'optimism', 'avalanche', 'solana'];

function toMicro(usdc: number): string {
  return String(Math.floor(usdc * 1_000_000));
}

// Settlement tracking (in-memory for demo, use Redis/DB in production)
interface SettlementRecord {
  paymentRef: string;
  resource: string;
  payer: string;
  amount: number;
  network: string;
  timestamp: number;
  slaTimeout: number;
  status: 'active' | 'completed' | 'disputed' | 'refunded';
}

const settlementStore = new Map<string, SettlementRecord>();

function create402Response(
  resource: string,
  basePrice: number,
  description: string,
  agentThreshold: number | null = null
) {
  const { price, tier } = calculatePrice(basePrice, agentThreshold);

  const accepts = SUPPORTED_NETWORKS.map((network) => ({
    scheme: 'exact',
    network: NETWORK_CONFIGS[network].chainId,
    amount: toMicro(price),
    asset: 'USDC',
    payTo: MERCHANT_ADDRESS,
    resource,
    description,
    maxTimeoutSeconds: 60,
    extra: {},
  }));

  const response: Record<string, unknown> = {
    x402Version: 2,
    accepts,
    error: 'Payment Required',
    facilitator: FACILITATOR_URL,
    resource: {
      url: resource,
      description,
      mimeType: 'application/json',
    },
    extensions: {
      bazaar: {
        info: {
          input: { agentId: 'string' },
          output: { data: 'object' },
        },
      },
    },
  };

  // Add tiered pricing info if reputation pricing is enabled
  if (ENABLE_REPUTATION_PRICING) {
    response.pricing = {
      basePrice,
      yourPrice: price,
      yourTier: tier.name,
      yourDiscount: tier.discountPercent,
      tiers: REPUTATION_TIERS.map((t) => ({
        name: t.name,
        minThreshold: t.minThreshold,
        price: basePrice * (1 - t.discountPercent / 100),
        discountPercent: t.discountPercent,
      })),
      reputationExtensionKey: 'kamiyo:reputation',
    };
  }

  // Add settlement info if enabled
  if (SETTLEMENT_ENABLED) {
    response.settlement = {
      enabled: true,
      endpoint: '/api/settlement',
      slaTimeoutMs: 5000,
      violations: ['timeout', 'serverError', 'latency', 'malformed'],
    };
  }

  return response;
}

async function verifyPayment(paymentHeader: string, requirement: Record<string, unknown>): Promise<{ valid: boolean; payer?: string; error?: string }> {
  try {
    const res = await fetch(`${FACILITATOR_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        x402Version: 2,
        paymentHeader,
        paymentRequirements: requirement,
      }),
    });

    const data = (await res.json()) as { isValid?: boolean; payer?: string; invalidReason?: string };
    return {
      valid: !!data.isValid,
      payer: data.payer,
      error: data.invalidReason,
    };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

async function settlePayment(paymentHeader: string, requirement: Record<string, unknown>): Promise<{ success: boolean; tx?: string; error?: string }> {
  try {
    const res = await fetch(`${FACILITATOR_URL}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        x402Version: 2,
        paymentHeader,
        paymentRequirements: requirement,
      }),
    });

    const data = (await res.json()) as { success?: boolean; transaction?: string; error?: string };
    return {
      success: !!data.success,
      tx: data.transaction,
      error: data.error,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// Extract reputation threshold from payment header extensions
function extractReputationThreshold(paymentHeader: string): number | null {
  try {
    const decoded = JSON.parse(Buffer.from(paymentHeader, 'base64').toString());
    if (decoded.extensions?.['kamiyo:reputation']?.threshold) {
      return decoded.extensions['kamiyo:reputation'].threshold;
    }
  } catch {
    // Not a JSON payload or no reputation extension
  }
  return null;
}

function x402Middleware(basePrice: number, description: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const resource = req.path;
    const paymentHeader = req.headers['x-payment'] as string;
    const requestStart = Date.now();

    if (!paymentHeader) {
      // Check if caller provided reputation proof for tiered pricing
      const reputationThreshold = req.headers['x-reputation-threshold']
        ? parseInt(req.headers['x-reputation-threshold'] as string, 10)
        : null;

      const body = create402Response(resource, basePrice, description, reputationThreshold);
      res.set({
        'WWW-Authenticate': 'X402',
        'X-Payment-Facilitator': FACILITATOR_URL,
      });
      return res.status(402).json(body);
    }

    // Extract reputation for tiered pricing
    const reputationThreshold = extractReputationThreshold(paymentHeader);
    const { price } = calculatePrice(basePrice, reputationThreshold);

    // Try to verify against each supported network
    for (const network of SUPPORTED_NETWORKS) {
      const requirement = {
        scheme: 'exact',
        network: NETWORK_CONFIGS[network].chainId,
        amount: toMicro(price),
        asset: 'USDC',
        payTo: MERCHANT_ADDRESS,
        resource,
        description,
        maxTimeoutSeconds: 60,
        extra: {},
      };

      const verifyResult = await verifyPayment(paymentHeader, requirement);
      if (verifyResult.valid) {
        const settleResult = await settlePayment(paymentHeader, requirement);
        if (settleResult.success) {
          const paymentRef = `${settleResult.tx || Date.now()}-${resource}`;

          // Track for settlement if enabled
          if (SETTLEMENT_ENABLED && settleResult.tx) {
            settlementStore.set(paymentRef, {
              paymentRef,
              resource,
              payer: verifyResult.payer || '',
              amount: price,
              network,
              timestamp: Date.now(),
              slaTimeout: 5000,
              status: 'active',
            });
          }

          (req as unknown as Record<string, unknown>).x402 = {
            payer: verifyResult.payer,
            network,
            tx: settleResult.tx,
            paymentRef,
            requestStart,
            priceUsd: price,
            reputationTier: reputationThreshold ? getTierForThreshold(reputationThreshold).name : 'base',
          };
          return next();
        }
      }
    }

    // Payment failed
    const body = create402Response(resource, basePrice, description);
    (body as Record<string, unknown>).verifyError = 'Payment verification failed';
    res.set({
      'WWW-Authenticate': 'X402',
      'X-Payment-Facilitator': FACILITATOR_URL,
    });
    return res.status(402).json(body);
  };
}

// ============ Data Sources ============

// Agent data source - fetches from DKG or returns structured mock
async function fetchAgentData(agentId: string): Promise<Record<string, unknown> | null> {
  // Try DKG first if configured
  if (DKG_ENDPOINT && DKG_ENDPOINT !== 'https://dkg.kamiyo.ai') {
    try {
      const res = await fetch(`${DKG_ENDPOINT}/agents/${agentId}`, {
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        return await res.json() as Record<string, unknown>;
      }
    } catch {
      // Fall through to mock data
    }
  }

  // Return structured agent data
  // In production, this would query on-chain registry or DKG
  return {
    agentId,
    name: `Agent ${agentId}`,
    type: 'autonomous',
    tier: 'gold',
    globalId: `eip155:8453:0x935D0CE617fb3123842fE739eD6FB8c0472dBD80:${agentId}`,
    registeredAt: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago
    lastActive: Date.now() - 60 * 1000, // 1 minute ago
    endpoints: {
      a2a: `https://a2a.kamiyo.ai/agents/${agentId}`,
      mcp: `https://mcp.kamiyo.ai/agents/${agentId}`,
    },
    capabilities: ['trade', 'analyze', 'communicate'],
    stake: {
      amount: '10.5',
      token: 'HYPE',
      chain: 'hyperliquid',
    },
  };
}

// Reputation data source
async function fetchReputationData(agentId: string): Promise<Record<string, unknown> | null> {
  // In production, this would:
  // 1. Query Solana for on-chain reputation
  // 2. Query Base for ZK reputation commitments
  // 3. Aggregate cross-chain attestations

  // Structured reputation data
  const score = 75 + Math.floor(Math.random() * 20); // 75-95 for demo
  const tier = getTierForThreshold(score);

  return {
    agentId,
    score,
    tier: tier.name,
    totalTransactions: 1000 + Math.floor(Math.random() * 5000),
    successRate: 0.92 + Math.random() * 0.07,
    averageResponseTime: 150 + Math.floor(Math.random() * 100),
    disputeRate: 0.01 + Math.random() * 0.02,
    verification: {
      type: 'zk_proof',
      commitment: `0x${Buffer.from(agentId).toString('hex').padEnd(64, '0')}`,
      threshold: score,
    },
    history: {
      last30Days: {
        transactions: 100 + Math.floor(Math.random() * 200),
        volume: 1000 + Math.floor(Math.random() * 5000),
        disputes: Math.floor(Math.random() * 3),
      },
    },
  };
}

// Trading signals data source
async function fetchSignals(): Promise<Record<string, unknown>[]> {
  // In production, this would aggregate signals from top-rated agents
  return [
    {
      agent: 'agent-001',
      agentTier: 'platinum',
      pair: 'ETH/USDC',
      direction: 'long',
      confidence: 0.82,
      entry: 3245.5,
      target: 3400.0,
      stop: 3150.0,
      timestamp: Date.now(),
    },
    {
      agent: 'agent-002',
      agentTier: 'gold',
      pair: 'BTC/USDC',
      direction: 'short',
      confidence: 0.71,
      entry: 98500,
      target: 94000,
      stop: 101000,
      timestamp: Date.now(),
    },
  ];
}

// ============ Routes ============

// Health check (free)
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    version: '2.0.0',
    facilitator: FACILITATOR_URL,
    merchant: MERCHANT_ADDRESS,
    networks: SUPPORTED_NETWORKS,
    features: {
      reputationPricing: ENABLE_REPUTATION_PRICING,
      settlement: SETTLEMENT_ENABLED,
      dkg: DKG_ENDPOINT !== 'https://dkg.kamiyo.ai',
    },
  });
});

// x402 discovery document
app.get('/.well-known/x402', (_req, res) => {
  res.json({
    version: '2.0',
    name: 'KAMIYO Protocol',
    description: 'Trustless infrastructure for autonomous AI agents',
    facilitator: FACILITATOR_URL,
    merchant: MERCHANT_ADDRESS,
    resources: [
      {
        path: '/api/agents/:agentId',
        method: 'GET',
        price: BASE_PRICES.agentQuery,
        asset: 'USDC',
        description: 'Query agent profile and metadata',
      },
      {
        path: '/api/reputation/:agentId',
        method: 'GET',
        price: BASE_PRICES.reputationCheck,
        asset: 'USDC',
        description: 'Get agent reputation and trust score',
      },
      {
        path: '/api/signals',
        method: 'GET',
        price: BASE_PRICES.signal,
        asset: 'USDC',
        description: 'Get trading signals from top agents',
      },
    ],
    networks: SUPPORTED_NETWORKS.map((n) => NETWORK_CONFIGS[n].chainId),
    features: {
      reputationPricing: ENABLE_REPUTATION_PRICING,
      settlement: SETTLEMENT_ENABLED,
      tiers: ENABLE_REPUTATION_PRICING ? REPUTATION_TIERS : undefined,
    },
  });
});

// Agent query endpoint
app.get(
  '/api/agents/:agentId',
  x402Middleware(BASE_PRICES.agentQuery, 'Query KAMIYO agent profile'),
  async (req, res) => {
    const agentId = req.params.agentId as string;
    const x402 = (req as unknown as Record<string, unknown>).x402 as Record<string, unknown>;

    const agentData = await fetchAgentData(agentId);
    if (!agentData) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Mark settlement as completed
    if (SETTLEMENT_ENABLED && x402.paymentRef) {
      const record = settlementStore.get(x402.paymentRef as string);
      if (record) {
        record.status = 'completed';
      }
    }

    res.json({
      ...agentData,
      payment: {
        payer: x402.payer,
        network: x402.network,
        tx: x402.tx,
        priceUsd: x402.priceUsd,
        tier: x402.reputationTier,
      },
    });
  }
);

// Reputation check endpoint
app.get(
  '/api/reputation/:agentId',
  x402Middleware(BASE_PRICES.reputationCheck, 'Check KAMIYO agent reputation'),
  async (req, res) => {
    const agentId = req.params.agentId as string;
    const x402 = (req as unknown as Record<string, unknown>).x402 as Record<string, unknown>;

    const reputationData = await fetchReputationData(agentId);
    if (!reputationData) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Mark settlement as completed
    if (SETTLEMENT_ENABLED && x402.paymentRef) {
      const record = settlementStore.get(x402.paymentRef as string);
      if (record) {
        record.status = 'completed';
      }
    }

    res.json({
      ...reputationData,
      payment: {
        payer: x402.payer,
        network: x402.network,
        tx: x402.tx,
        priceUsd: x402.priceUsd,
        tier: x402.reputationTier,
      },
    });
  }
);

// Trading signals endpoint
app.get(
  '/api/signals',
  x402Middleware(BASE_PRICES.signal, 'Get KAMIYO trading signals'),
  async (req, res) => {
    const x402 = (req as unknown as Record<string, unknown>).x402 as Record<string, unknown>;

    const signals = await fetchSignals();

    // Mark settlement as completed
    if (SETTLEMENT_ENABLED && x402.paymentRef) {
      const record = settlementStore.get(x402.paymentRef as string);
      if (record) {
        record.status = 'completed';
      }
    }

    res.json({
      timestamp: Date.now(),
      signals,
      payment: {
        payer: x402.payer,
        network: x402.network,
        tx: x402.tx,
        priceUsd: x402.priceUsd,
        tier: x402.reputationTier,
      },
    });
  }
);

// ============ Settlement Endpoints ============

// Check settlement eligibility
app.get('/api/settlement/:paymentRef', (req, res) => {
  if (!SETTLEMENT_ENABLED) {
    return res.status(404).json({ error: 'Settlement not enabled' });
  }

  const { paymentRef } = req.params;
  const record = settlementStore.get(paymentRef);

  if (!record) {
    return res.status(404).json({ error: 'Payment not found' });
  }

  res.json({
    paymentRef: record.paymentRef,
    resource: record.resource,
    amount: record.amount,
    network: record.network,
    timestamp: record.timestamp,
    status: record.status,
    eligible: record.status === 'active',
  });
});

// Request settlement (file dispute)
app.post('/api/settlement/:paymentRef', express.json(), (req, res) => {
  if (!SETTLEMENT_ENABLED) {
    return res.status(404).json({ error: 'Settlement not enabled' });
  }

  const { paymentRef } = req.params;
  const { violation, evidence } = req.body as { violation: string; evidence?: string };

  const record = settlementStore.get(paymentRef);
  if (!record) {
    return res.status(404).json({ error: 'Payment not found' });
  }

  if (record.status !== 'active' && record.status !== 'completed') {
    return res.status(400).json({ error: 'Settlement already processed' });
  }

  // Validate violation type
  const validViolations = ['timeout', 'serverError', 'latency', 'malformed', 'incomplete'];
  if (!validViolations.includes(violation)) {
    return res.status(400).json({ error: 'Invalid violation type' });
  }

  // Calculate refund based on violation type
  const refundPercents: Record<string, number> = {
    timeout: 100,
    serverError: 100,
    latency: 50,
    malformed: 75,
    incomplete: 50,
  };

  const refundPercent = refundPercents[violation] || 50;
  const refundAmount = record.amount * (refundPercent / 100);

  record.status = 'disputed';

  res.json({
    settlementId: `settlement-${paymentRef}`,
    paymentRef,
    violation,
    refundPercent,
    refundAmount,
    status: 'pending_review',
    message: 'Settlement request received. Will be processed within 1 hour.',
  });
});

// Start server
app.listen(PORT, HOST, () => {
  console.log(`KAMIYO x402 server running at http://${HOST}:${PORT}`);
  console.log(`Merchant: ${MERCHANT_ADDRESS}`);
  console.log(`Facilitator: ${FACILITATOR_URL}`);
  console.log(`Networks: ${SUPPORTED_NETWORKS.join(', ')}`);
  console.log('');
  console.log('Features:');
  console.log(`  Reputation Pricing: ${ENABLE_REPUTATION_PRICING ? 'enabled' : 'disabled'}`);
  console.log(`  Settlement: ${SETTLEMENT_ENABLED ? 'enabled' : 'disabled'}`);
  console.log(`  DKG: ${DKG_ENDPOINT !== 'https://dkg.kamiyo.ai' ? 'connected' : 'mock data'}`);
  console.log('');
  console.log('Endpoints:');
  console.log(`  GET /health - Health check (free)`);
  console.log(`  GET /.well-known/x402 - Discovery document (free)`);
  console.log(`  GET /api/agents/:id - Agent query ($${BASE_PRICES.agentQuery})`);
  console.log(`  GET /api/reputation/:id - Reputation check ($${BASE_PRICES.reputationCheck})`);
  console.log(`  GET /api/signals - Trading signals ($${BASE_PRICES.signal})`);
  if (SETTLEMENT_ENABLED) {
    console.log(`  GET /api/settlement/:ref - Check settlement status`);
    console.log(`  POST /api/settlement/:ref - Request settlement`);
  }
});
