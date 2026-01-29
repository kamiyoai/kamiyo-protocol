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
  <p>Trustless infrastructure for autonomous trading agents.</p>
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
const DEFAULT_NETWORK = process.env.DEFAULT_NETWORK || 'base';
const FACILITATOR_URL = process.env.PAYAI_FACILITATOR_URL || 'https://facilitator.payai.network';

// Pricing
const PRICES = {
  agentQuery: parseFloat(process.env.PRICE_AGENT_QUERY || '0.001'),
  reputationCheck: parseFloat(process.env.PRICE_REPUTATION_CHECK || '0.0005'),
  signal: parseFloat(process.env.PRICE_SIGNAL || '0.01'),
};

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

function create402Response(resource: string, priceUsd: number, description: string) {
  const accepts = SUPPORTED_NETWORKS.map((network) => ({
    scheme: 'exact',
    network: NETWORK_CONFIGS[network].chainId,
    amount: toMicro(priceUsd),
    asset: 'USDC',
    payTo: MERCHANT_ADDRESS,
    resource,
    description,
    maxTimeoutSeconds: 60,
    extra: {},
  }));

  return {
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
}

async function verifyPayment(paymentHeader: string, requirement: any): Promise<{ valid: boolean; payer?: string; error?: string }> {
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

async function settlePayment(paymentHeader: string, requirement: any): Promise<{ success: boolean; tx?: string; error?: string }> {
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

function x402Middleware(priceUsd: number, description: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const resource = req.path;
    const paymentHeader = req.headers['x-payment'] as string;

    if (!paymentHeader) {
      const body = create402Response(resource, priceUsd, description);
      res.set({
        'WWW-Authenticate': 'X402',
        'X-Payment-Facilitator': FACILITATOR_URL,
      });
      return res.status(402).json(body);
    }

    // Try to verify against each supported network
    for (const network of SUPPORTED_NETWORKS) {
      const requirement = {
        scheme: 'exact',
        network: NETWORK_CONFIGS[network].chainId,
        amount: toMicro(priceUsd),
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
          (req as any).x402 = {
            payer: verifyResult.payer,
            network,
            tx: settleResult.tx,
          };
          return next();
        }
      }
    }

    // Payment failed
    const body = create402Response(resource, priceUsd, description);
    (body as any).verifyError = 'Payment verification failed';
    res.set({
      'WWW-Authenticate': 'X402',
      'X-Payment-Facilitator': FACILITATOR_URL,
    });
    return res.status(402).json(body);
  };
}

// ============ Routes ============

// Health check (free)
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    version: '1.0.0',
    facilitator: FACILITATOR_URL,
    merchant: MERCHANT_ADDRESS,
    networks: SUPPORTED_NETWORKS,
  });
});

// x402 discovery document
app.get('/.well-known/x402', (_req, res) => {
  res.json({
    version: '2.0',
    name: 'KAMIYO Protocol',
    description: 'Trustless infrastructure for autonomous trading agents',
    facilitator: FACILITATOR_URL,
    merchant: MERCHANT_ADDRESS,
    resources: [
      {
        path: '/api/agents/:agentId',
        method: 'GET',
        price: PRICES.agentQuery,
        asset: 'USDC',
        description: 'Query agent profile and metadata',
      },
      {
        path: '/api/reputation/:agentId',
        method: 'GET',
        price: PRICES.reputationCheck,
        asset: 'USDC',
        description: 'Get agent reputation and trust score',
      },
      {
        path: '/api/signals',
        method: 'GET',
        price: PRICES.signal,
        asset: 'USDC',
        description: 'Get trading signals from top agents',
      },
    ],
    networks: SUPPORTED_NETWORKS.map((n) => NETWORK_CONFIGS[n].chainId),
  });
});

// Agent query endpoint
app.get(
  '/api/agents/:agentId',
  x402Middleware(PRICES.agentQuery, 'Query KAMIYO agent profile'),
  (req, res) => {
    const { agentId } = req.params;
    res.json({
      agentId,
      name: `Agent ${agentId}`,
      type: 'trading',
      tier: 'gold',
      globalId: `eip155:8453:0x935D0CE617fb3123842fE739eD6FB8c0472dBD80:${agentId}`,
      endpoints: {
        a2a: `https://a2a.kamiyo.ai/agents/${agentId}`,
        mcp: `https://mcp.kamiyo.ai/agents/${agentId}`,
      },
      payment: (req as any).x402,
    });
  }
);

// Reputation check endpoint
app.get(
  '/api/reputation/:agentId',
  x402Middleware(PRICES.reputationCheck, 'Check KAMIYO agent reputation'),
  (req, res) => {
    const { agentId } = req.params;
    res.json({
      agentId,
      tier: 'gold',
      score: 85,
      totalTransactions: 1247,
      successRate: 0.94,
      averageReturn: 0.023,
      verification: {
        type: 'zk_proof',
        commitment: '0x...',
      },
      payment: (req as any).x402,
    });
  }
);

// Trading signals endpoint
app.get(
  '/api/signals',
  x402Middleware(PRICES.signal, 'Get KAMIYO trading signals'),
  (_req, res) => {
    res.json({
      timestamp: Date.now(),
      signals: [
        {
          agent: 'agent-001',
          pair: 'ETH/USDC',
          direction: 'long',
          confidence: 0.82,
          entry: 3245.50,
          target: 3400.00,
          stop: 3150.00,
        },
        {
          agent: 'agent-002',
          pair: 'BTC/USDC',
          direction: 'short',
          confidence: 0.71,
          entry: 98500,
          target: 94000,
          stop: 101000,
        },
      ],
      payment: (_req as any).x402,
    });
  }
);

// Start server
app.listen(PORT, HOST, () => {
  console.log(`KAMIYO x402 server running at http://${HOST}:${PORT}`);
  console.log(`Merchant: ${MERCHANT_ADDRESS}`);
  console.log(`Facilitator: ${FACILITATOR_URL}`);
  console.log(`Networks: ${SUPPORTED_NETWORKS.join(', ')}`);
  console.log('');
  console.log('Endpoints:');
  console.log(`  GET /health - Health check (free)`);
  console.log(`  GET /.well-known/x402 - Discovery document (free)`);
  console.log(`  GET /api/agents/:id - Agent query ($${PRICES.agentQuery})`);
  console.log(`  GET /api/reputation/:id - Reputation check ($${PRICES.reputationCheck})`);
  console.log(`  GET /api/signals - Trading signals ($${PRICES.signal})`);
});
