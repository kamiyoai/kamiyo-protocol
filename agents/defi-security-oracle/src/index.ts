import express, { Request, Response } from 'express';
import cors from 'cors';
import { DataService } from './services/data-service.js';
import { ApprovalsRouteHandler } from './routes/approvals.js';
import { logger } from './utils/logger.js';

// Import from dist for existing functionality
import { x402Middleware } from '../dist/src/x402/middleware.js';
import {
  validateRequest,
  rateLimitMiddleware,
  securityHeadersMiddleware,
  requestIdMiddleware,
} from '../dist/src/validation/middleware.js';
import {
  exploitsQuerySchema,
  riskScoreParamsSchema,
  riskScoreQuerySchema,
} from '../dist/src/validation/schemas.js';

const app = express();

app.use(securityHeadersMiddleware);
app.use(requestIdMiddleware);
app.use(cors());
app.use(express.json());
app.use(rateLimitMiddleware({ windowMs: 60000, maxRequests: 60 }));

const dataService = new DataService();
const approvalsHandler = new ApprovalsRouteHandler(dataService);

const PORT = process.env.PORT || 3000;
const PAYMENT_WALLET = process.env.PAYMENT_WALLET || '';
const PRICE_PER_REQUEST_SOL = 0.001;

interface ExploitData {
  protocol: string;
  chain: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  loss_usd: number;
  timestamp: string;
  description: string;
  attack_vector: string;
}

interface RiskScore {
  protocol: string;
  score: number;
  risk_level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  recent_exploits: number;
  total_loss_usd: number;
  recommendation: string;
  factors: {
    exploit_frequency: number;
    total_loss: number;
    recency: number;
    severity_distribution: Record<string, number>;
  };
}

async function fetchKamiyoExploits(
  protocol?: string,
  chain?: string
): Promise<ExploitData[]> {
  try {
    const startTime = Date.now();
    const exploits = await dataService.fetchExploits(protocol, chain);
    const duration = Date.now() - startTime;

    logger.dataFetch('exploits', true, exploits.length, duration);
    return exploits;
  } catch (error) {
    logger.error('Failed to fetch exploits', error, { protocol, chain });
    return [];
  }
}

function calculateRiskScore(
  exploits: ExploitData[],
  protocol: string
): RiskScore {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  const recentExploits = exploits.filter(
    (e) => new Date(e.timestamp).getTime() > thirtyDaysAgo
  );
  const totalLoss = exploits.reduce((sum, e) => sum + (e.loss_usd || 0), 0);
  const recentLoss = recentExploits.reduce(
    (sum, e) => sum + (e.loss_usd || 0),
    0
  );

  const severityDist = exploits.reduce((acc, e) => {
    acc[e.severity] = (acc[e.severity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const exploitFrequencyScore = Math.min((recentExploits.length / 10) * 100, 100);
  const totalLossScore = Math.min((totalLoss / 10_000_000) * 100, 100);

  const latestExploit = exploits[0];
  const daysSinceLatest = latestExploit
    ? (now - new Date(latestExploit.timestamp).getTime()) / (24 * 60 * 60 * 1000)
    : 999;

  const recencyScore =
    daysSinceLatest < 7 ? 100 : daysSinceLatest < 30 ? 50 : 0;

  const riskScore =
    exploitFrequencyScore * 0.4 + totalLossScore * 0.3 + recencyScore * 0.3;

  let riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  let recommendation: string;

  if (riskScore >= 75) {
    riskLevel = 'CRITICAL';
    recommendation = 'AVOID - High exploit risk detected';
  } else if (riskScore >= 50) {
    riskLevel = 'HIGH';
    recommendation = 'CAUTION - Significant security concerns';
  } else if (riskScore >= 25) {
    riskLevel = 'MEDIUM';
    recommendation = 'MONITOR - Some historical issues';
  } else {
    riskLevel = 'LOW';
    recommendation = 'ACCEPTABLE - Low risk profile';
  }

  return {
    protocol,
    score: Math.round(riskScore),
    risk_level: riskLevel,
    recent_exploits: recentExploits.length,
    total_loss_usd: Math.round(totalLoss),
    recommendation,
    factors: {
      exploit_frequency: Math.round(exploitFrequencyScore),
      total_loss: Math.round(totalLossScore),
      recency: Math.round(recencyScore),
      severity_distribution: severityDist,
    },
  };
}

app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'KAMIYO Approval Risk Auditor',
    description:
      'Token approval auditing and DeFi security intelligence with x402 payments',
    version: '3.0.0',
    x402: {
      enabled: true,
      version: 1,
      network: 'solana-mainnet',
      paymentWallet: PAYMENT_WALLET,
      pricePerRequest: `${PRICE_PER_REQUEST_SOL} SOL`,
    },
    endpoints: [
      {
        path: '/approval-audit',
        method: 'GET',
        description: 'Audit wallet token approvals and identify risks',
        parameters: ['wallet', 'chains'],
        payment: 'x402 required',
      },
      {
        path: '/exploits',
        method: 'GET',
        description: 'Get recent exploit data',
        parameters: ['protocol', 'chain', 'limit'],
        payment: 'x402 required',
      },
      {
        path: '/risk-score/:protocol',
        method: 'GET',
        description: 'Calculate risk score for a protocol',
        parameters: ['protocol', 'chain'],
        payment: 'x402 required',
      },
      {
        path: '/health',
        method: 'GET',
        description: 'Service health check',
        payment: 'none',
      },
    ],
    documentation:
      'https://github.com/kamiyo-ai/security-oracle',
    powered_by: 'KAMIYO Security Intelligence',
  });
});

app.get(
  '/approval-audit',
  x402Middleware({ price: PRICE_PER_REQUEST_SOL, resource: '/approval-audit' }),
  (req: Request, res: Response) => approvalsHandler.handleApprovalAudit(req, res)
);

app.get(
  '/exploits',
  validateRequest({ query: exploitsQuerySchema }),
  x402Middleware({ price: PRICE_PER_REQUEST_SOL, resource: '/exploits' }),
  async (req: Request, res: Response) => {
    try {
      const startTime = Date.now();
      const { protocol, chain, limit } = req.query as {
        protocol?: string;
        chain?: string;
        limit?: string;
      };

      const exploits = await fetchKamiyoExploits(protocol, chain);
      const limitNum = limit ? parseInt(limit) : 50;
      const limitedExploits = exploits.slice(0, limitNum);

      const duration = Date.now() - startTime;
      logger.apiRequest('GET', '/exploits', 200, duration);

      res.json({
        success: true,
        count: limitedExploits.length,
        exploits: limitedExploits,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('/exploits request failed', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch exploits',
      });
    }
  }
);

app.get(
  '/risk-score/:protocol',
  validateRequest({
    params: riskScoreParamsSchema,
    query: riskScoreQuerySchema,
  }),
  x402Middleware({ price: PRICE_PER_REQUEST_SOL, resource: '/risk-score' }),
  async (req: Request, res: Response) => {
    try {
      const startTime = Date.now();
      const { protocol } = req.params;
      const { chain } = req.query as { chain?: string };

      const exploits = await fetchKamiyoExploits(protocol, chain);
      const riskScore = calculateRiskScore(exploits, protocol);

      const duration = Date.now() - startTime;
      logger.apiRequest('GET', '/risk-score/:protocol', 200, duration);
      logger.info('Risk score calculated', {
        protocol,
        score: riskScore.score,
      });

      res.json({
        success: true,
        risk_score: riskScore,
        data_points: exploits.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('/risk-score request failed', error, {
        protocol: req.params.protocol,
      });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to calculate risk score',
      });
    }
  }
);

app.get('/health', (req: Request, res: Response) => {
  const sourcesHealth = dataService.getSourcesHealth();
  const cacheStats = dataService.getCacheStats();
  const approvalCacheStats = approvalsHandler.getCacheStats();

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    features: {
      x402_compliant: true,
      approval_auditing: true,
      exploit_intelligence: true,
      risk_scoring: true,
      solana_payments: true,
      rate_limiting: true,
      input_validation: true,
      structured_logging: true,
      data_fallbacks: true,
    },
    data_sources: sourcesHealth,
    cache: {
      ...cacheStats,
      ...approvalCacheStats,
    },
    version: '3.0.0',
  });
});

app.listen(PORT, () => {
  logger.info('KAMIYO Approval Risk Auditor started', {
    version: '3.0.0',
    port: PORT,
    x402_enabled: true,
    payment_wallet: PAYMENT_WALLET,
    price_per_request: `${PRICE_PER_REQUEST_SOL} SOL`,
    network: 'solana-mainnet',
    features: {
      approval_auditing: 'NEW',
      rate_limiting: '60 req/min',
      input_validation: 'Zod schemas',
      data_fallbacks: 'Circuit breaker pattern',
      structured_logging: 'JSON format',
      security_headers: 'Enabled',
    },
  });

  console.log(`KAMIYO Approval Risk Auditor v3.0.0`);
  console.log(`Running on port ${PORT}`);
  console.log(`x402 Protocol: ENABLED`);
  console.log(`Payment wallet: ${PAYMENT_WALLET}`);
  console.log(`Price: ${PRICE_PER_REQUEST_SOL} SOL per request`);
  console.log(`Network: solana-mainnet`);
  console.log(
    `Features: ✓ Approval Auditing ✓ Exploit Intelligence ✓ Risk Scoring`
  );
});

export default app;
