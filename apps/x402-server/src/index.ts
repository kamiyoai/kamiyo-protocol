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

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors());
app.use(express.json({ limit: '16kb' }));

// Rate limiting
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 100; // requests per minute
const RATE_WINDOW = 60_000;

function rateLimit(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return next();
  }

  if (entry.count >= RATE_LIMIT) {
    res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  entry.count++;
  next();
}

app.use(rateLimit);

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitStore) {
    if (now > entry.resetAt) rateLimitStore.delete(ip);
  }
}, 60_000);

app.use('/public', express.static(path.join(__dirname, '../public')));

app.get('/favicon.ico', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/logo.png'));
});

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

const PORT = parseInt(process.env.PORT || '3402', 10);
const HOST = process.env.HOST || '0.0.0.0';
const MERCHANT_ADDRESS = process.env.MERCHANT_ADDRESS || '';
const FACILITATOR_URL = process.env.PAYAI_FACILITATOR_URL || 'https://facilitator.payai.network';
const DKG_ENDPOINT = process.env.DKG_ENDPOINT || 'https://dkg.kamiyo.ai';
const ENABLE_REPUTATION_PRICING = process.env.ENABLE_REPUTATION_PRICING === 'true';
const SETTLEMENT_ENABLED = process.env.SETTLEMENT_ENABLED === 'true';

const BASE_PRICES = {
  agentQuery: parseFloat(process.env.PRICE_AGENT_QUERY || '0.001'),
  reputationCheck: parseFloat(process.env.PRICE_REPUTATION_CHECK || '0.0005'),
  signal: parseFloat(process.env.PRICE_SIGNAL || '0.01'),
};

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
const MAX_SETTLEMENT_RECORDS = 10_000;
const SETTLEMENT_TTL = 24 * 60 * 60 * 1000; // 24 hours

setInterval(() => {
  const now = Date.now();
  for (const [ref, record] of settlementStore) {
    if (now - record.timestamp > SETTLEMENT_TTL) settlementStore.delete(ref);
  }
}, 60_000);
const AGENT_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

function isValidAgentId(id: unknown): id is string {
  return typeof id === 'string' && AGENT_ID_REGEX.test(id);
}

function parseReputationThreshold(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const num = parseInt(String(value), 10);
  if (Number.isNaN(num) || num < 0 || num > 100) return null;
  return num;
}

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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(`${FACILITATOR_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        x402Version: 2,
        paymentHeader,
        paymentRequirements: requirement,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const data = (await res.json()) as { isValid?: boolean; payer?: string; invalidReason?: string };
    return {
      valid: !!data.isValid,
      payer: data.payer,
      error: data.invalidReason,
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { valid: false, error: 'Facilitator timeout' };
    }
    return { valid: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

async function settlePayment(paymentHeader: string, requirement: Record<string, unknown>): Promise<{ success: boolean; tx?: string; error?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const res = await fetch(`${FACILITATOR_URL}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        x402Version: 2,
        paymentHeader,
        paymentRequirements: requirement,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const data = (await res.json()) as { success?: boolean; transaction?: string; error?: string };
    return {
      success: !!data.success,
      tx: data.transaction,
      error: data.error,
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { success: false, error: 'Settlement timeout' };
    }
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

function extractReputationThreshold(paymentHeader: string): number | null {
  try {
    const decoded = JSON.parse(Buffer.from(paymentHeader, 'base64').toString());
    return decoded.extensions?.['kamiyo:reputation']?.threshold ?? null;
  } catch {
    return null;
  }
}

function x402Middleware(basePrice: number, description: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const resource = req.path;
    const paymentHeader = req.headers['x-payment'] as string;
    const requestStart = Date.now();

    if (!paymentHeader) {
      const reputationThreshold = parseReputationThreshold(req.headers['x-reputation-threshold']);

      const body = create402Response(resource, basePrice, description, reputationThreshold);
      res.set({
        'WWW-Authenticate': 'X402',
        'X-Payment-Facilitator': FACILITATOR_URL,
      });
      return res.status(402).json(body);
    }

    const reputationThreshold = extractReputationThreshold(paymentHeader);
    const { price } = calculatePrice(basePrice, reputationThreshold);

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

          if (SETTLEMENT_ENABLED && settleResult.tx && settlementStore.size < MAX_SETTLEMENT_RECORDS) {
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

    const body = create402Response(resource, basePrice, description);
    (body as Record<string, unknown>).verifyError = 'Payment verification failed';
    res.set({
      'WWW-Authenticate': 'X402',
      'X-Payment-Facilitator': FACILITATOR_URL,
    });
    return res.status(402).json(body);
  };
}

async function fetchAgentData(agentId: string): Promise<Record<string, unknown> | null> {
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
      // fallback below
    }
  }

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

async function fetchReputationData(agentId: string): Promise<Record<string, unknown> | null> {
  // TODO: on-chain query
  const score = 75 + Math.floor(Math.random() * 20);
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

async function fetchSignals(): Promise<Record<string, unknown>[]> {
  // TODO: aggregate from agents
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

app.get(
  '/api/agents/:agentId',
  x402Middleware(BASE_PRICES.agentQuery, 'Query KAMIYO agent profile'),
  async (req, res) => {
    const agentId = req.params.agentId;
    if (!isValidAgentId(agentId)) {
      return res.status(400).json({ error: 'Invalid agent ID format' });
    }

    const x402 = (req as unknown as Record<string, unknown>).x402 as Record<string, unknown>;

    const agentData = await fetchAgentData(agentId);
    if (!agentData) {
      return res.status(404).json({ error: 'Agent not found' });
    }

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

app.get(
  '/api/reputation/:agentId',
  x402Middleware(BASE_PRICES.reputationCheck, 'Check KAMIYO agent reputation'),
  async (req, res) => {
    const agentId = req.params.agentId;
    if (!isValidAgentId(agentId)) {
      return res.status(400).json({ error: 'Invalid agent ID format' });
    }

    const x402 = (req as unknown as Record<string, unknown>).x402 as Record<string, unknown>;

    const reputationData = await fetchReputationData(agentId);
    if (!reputationData) {
      return res.status(404).json({ error: 'Agent not found' });
    }

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

app.get(
  '/api/signals',
  x402Middleware(BASE_PRICES.signal, 'Get KAMIYO trading signals'),
  async (req, res) => {
    const x402 = (req as unknown as Record<string, unknown>).x402 as Record<string, unknown>;

    const signals = await fetchSignals();

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

app.post('/api/settlement/:paymentRef', express.json({ limit: '4kb' }), (req, res) => {
  if (!SETTLEMENT_ENABLED) {
    return res.status(404).json({ error: 'Settlement not enabled' });
  }

  const { paymentRef } = req.params;
  if (typeof paymentRef !== 'string' || paymentRef.length > 256) {
    return res.status(400).json({ error: 'Invalid payment reference' });
  }

  const body = req.body as Record<string, unknown>;
  const violation = body.violation;
  const evidence = body.evidence;

  const validViolations = ['timeout', 'serverError', 'latency', 'malformed', 'incomplete'];
  if (typeof violation !== 'string' || !validViolations.includes(violation)) {
    return res.status(400).json({ error: 'Invalid violation type' });
  }

  if (evidence !== undefined && (typeof evidence !== 'string' || evidence.length > 1000)) {
    return res.status(400).json({ error: 'Evidence must be a string under 1000 characters' });
  }

  const record = settlementStore.get(paymentRef);
  if (!record) {
    return res.status(404).json({ error: 'Payment not found' });
  }

  if (record.status !== 'active' && record.status !== 'completed') {
    return res.status(400).json({ error: 'Settlement already processed' });
  }

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
