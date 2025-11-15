import express from 'express';
import cors from 'cors';
import { x402Middleware } from './src/x402/middleware.js';
import { validateRequest } from './src/validation/middleware.js';
import { rateLimitMiddleware, securityHeadersMiddleware, requestIdMiddleware } from './src/validation/middleware.js';
import { exploitsQuerySchema, riskScoreParamsSchema, riskScoreQuerySchema } from './src/validation/schemas.js';
import { DataService } from './src/services/data-service.js';
import { logger } from './src/utils/logger.js';
const app = express();
app.use(securityHeadersMiddleware);
app.use(requestIdMiddleware);
app.use(cors());
app.use(express.json());
app.use(rateLimitMiddleware({ windowMs: 60000, maxRequests: 60 }));
const dataService = new DataService();
const PORT = process.env.PORT || 3000;
const PAYMENT_WALLET = process.env.PAYMENT_WALLET || '';
const PRICE_PER_REQUEST_SOL = 0.001;
async function fetchKamiyoExploits(protocol, chain) {
    try {
        const startTime = Date.now();
        const exploits = await dataService.fetchExploits(protocol, chain);
        const duration = Date.now() - startTime;
        logger.dataFetch('exploits', true, exploits.length, duration);
        return exploits;
    }
    catch (error) {
        logger.error('Failed to fetch exploits', error, { protocol, chain });
        return [];
    }
}
function calculateRiskScore(exploits, protocol) {
    const now = Date.now();
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
    const recentExploits = exploits.filter(e => new Date(e.timestamp).getTime() > thirtyDaysAgo);
    const totalLoss = exploits.reduce((sum, e) => sum + (e.loss_usd || 0), 0);
    const recentLoss = recentExploits.reduce((sum, e) => sum + (e.loss_usd || 0), 0);
    const severityDist = exploits.reduce((acc, e) => {
        acc[e.severity] = (acc[e.severity] || 0) + 1;
        return acc;
    }, {});
    const exploitFrequencyScore = Math.min((recentExploits.length / 10) * 100, 100);
    const totalLossScore = Math.min((totalLoss / 10_000_000) * 100, 100);
    const latestExploit = exploits[0];
    const daysSinceLatest = latestExploit
        ? (now - new Date(latestExploit.timestamp).getTime()) / (24 * 60 * 60 * 1000)
        : 999;
    const recencyScore = daysSinceLatest < 7 ? 100 : daysSinceLatest < 30 ? 50 : 0;
    const riskScore = (exploitFrequencyScore * 0.4 +
        totalLossScore * 0.3 +
        recencyScore * 0.3);
    let riskLevel;
    let recommendation;
    if (riskScore >= 75) {
        riskLevel = 'CRITICAL';
        recommendation = 'AVOID - High exploit risk detected';
    }
    else if (riskScore >= 50) {
        riskLevel = 'HIGH';
        recommendation = 'CAUTION - Significant security concerns';
    }
    else if (riskScore >= 25) {
        riskLevel = 'MEDIUM';
        recommendation = 'MONITOR - Some historical issues';
    }
    else {
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
            severity_distribution: severityDist
        }
    };
}
app.get('/', (req, res) => {
    res.json({
        name: 'KAMIYO DeFi Security Oracle',
        description: 'Real-time exploit intelligence and risk assessment for DeFi protocols',
        version: '2.0.0',
        x402: {
            enabled: true,
            version: 1,
            network: 'solana-mainnet',
            paymentWallet: PAYMENT_WALLET,
            pricePerRequest: `${PRICE_PER_REQUEST_SOL} SOL`
        },
        endpoints: [
            {
                path: '/exploits',
                method: 'GET',
                description: 'Get recent exploit data',
                parameters: ['protocol', 'chain', 'limit'],
                payment: 'x402 required'
            },
            {
                path: '/risk-score/:protocol',
                method: 'GET',
                description: 'Calculate risk score for a protocol',
                parameters: ['protocol', 'chain'],
                payment: 'x402 required'
            },
            {
                path: '/health',
                method: 'GET',
                description: 'Service health check',
                payment: 'none'
            }
        ],
        documentation: 'https://github.com/kamiyo-ai/kamiyo/tree/main/agents/defi-security-oracle',
        powered_by: 'KAMIYO Security Intelligence'
    });
});
app.get('/exploits', validateRequest({ query: exploitsQuerySchema }), x402Middleware({ price: PRICE_PER_REQUEST_SOL, resource: '/exploits' }), async (req, res) => {
    try {
        const startTime = Date.now();
        const { protocol, chain, limit } = req.query;
        const exploits = await fetchKamiyoExploits(protocol, chain);
        const limitNum = limit ? parseInt(limit) : 50;
        const limitedExploits = exploits.slice(0, limitNum);
        const duration = Date.now() - startTime;
        logger.apiRequest('GET', '/exploits', 200, duration);
        res.json({
            success: true,
            count: limitedExploits.length,
            exploits: limitedExploits,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        logger.error('/exploits request failed', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to fetch exploits'
        });
    }
});
app.get('/risk-score/:protocol', validateRequest({ params: riskScoreParamsSchema, query: riskScoreQuerySchema }), x402Middleware({ price: PRICE_PER_REQUEST_SOL, resource: '/risk-score' }), async (req, res) => {
    try {
        const startTime = Date.now();
        const { protocol } = req.params;
        const { chain } = req.query;
        const exploits = await fetchKamiyoExploits(protocol, chain);
        const riskScore = calculateRiskScore(exploits, protocol);
        const duration = Date.now() - startTime;
        logger.apiRequest('GET', '/risk-score/:protocol', 200, duration);
        logger.info('Risk score calculated', { protocol, score: riskScore.score });
        res.json({
            success: true,
            risk_score: riskScore,
            data_points: exploits.length,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        logger.error('/risk-score request failed', error, { protocol: req.params.protocol });
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to calculate risk score'
        });
    }
});
app.get('/.well-known/x402', (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.status(402).json({
        x402Version: 1,
        accepts: [
            {
                scheme: 'exact',
                network: 'solana',
                maxAmountRequired: String(PRICE_PER_REQUEST_SOL * 1_000_000_000),
                resource: `${baseUrl}/exploits`,
                description: 'Real-time DeFi exploit intelligence from 20+ sources',
                mimeType: 'application/json',
                payTo: PAYMENT_WALLET,
                maxTimeoutSeconds: 300,
                asset: 'SOL',
                outputSchema: {
                    input: {
                        type: 'http',
                        method: 'GET',
                        queryParams: {
                            protocol: {
                                type: 'string',
                                required: false,
                                description: 'Filter by protocol name'
                            },
                            chain: {
                                type: 'string',
                                required: false,
                                description: 'Filter by blockchain (e.g., Ethereum, BSC, Solana)'
                            },
                            limit: {
                                type: 'integer',
                                required: false,
                                description: 'Maximum number of results (default: 50)'
                            }
                        }
                    },
                    output: {
                        success: { type: 'boolean', description: 'Request status' },
                        count: { type: 'integer', description: 'Number of exploits returned' },
                        exploits: { type: 'array', description: 'List of exploit records' },
                        timestamp: { type: 'string', description: 'Response timestamp' }
                    }
                },
                extra: {
                    provider: 'KAMIYO',
                    version: '2.0.0',
                    sources_count: 20,
                    documentation: 'https://github.com/kamiyo-ai/kamiyo/tree/main/agents/defi-security-oracle'
                }
            },
            {
                scheme: 'exact',
                network: 'solana',
                maxAmountRequired: String(PRICE_PER_REQUEST_SOL * 1_000_000_000),
                resource: `${baseUrl}/risk-score/{protocol}`,
                description: 'Calculate risk score for DeFi protocols based on exploit history',
                mimeType: 'application/json',
                payTo: PAYMENT_WALLET,
                maxTimeoutSeconds: 300,
                asset: 'SOL',
                outputSchema: {
                    input: {
                        type: 'http',
                        method: 'GET',
                        pathParams: {
                            protocol: {
                                type: 'string',
                                required: true,
                                description: 'Protocol name (e.g., Uniswap, Curve)'
                            }
                        },
                        queryParams: {
                            chain: {
                                type: 'string',
                                required: false,
                                description: 'Filter by blockchain'
                            }
                        }
                    },
                    output: {
                        success: { type: 'boolean', description: 'Request status' },
                        risk_score: { type: 'object', description: 'Calculated risk assessment' },
                        data_points: { type: 'integer', description: 'Number of exploits analyzed' },
                        timestamp: { type: 'string', description: 'Response timestamp' }
                    }
                },
                extra: {
                    provider: 'KAMIYO',
                    version: '2.0.0',
                    algorithm: 'Weighted: frequency(40%) + loss(30%) + recency(30%)',
                    documentation: 'https://github.com/kamiyo-ai/kamiyo/tree/main/agents/defi-security-oracle'
                }
            }
        ]
    });
});
app.get('/health', (req, res) => {
    const sourcesHealth = dataService.getSourcesHealth();
    const cacheStats = dataService.getCacheStats();
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        features: {
            x402_compliant: true,
            exploit_intelligence: true,
            risk_scoring: true,
            solana_payments: true,
            rate_limiting: true,
            input_validation: true,
            structured_logging: true,
            data_fallbacks: true
        },
        data_sources: sourcesHealth,
        cache: cacheStats,
        version: '2.0.0'
    });
});
app.listen(PORT, () => {
    logger.info('KAMIYO DeFi Security Oracle started', {
        version: '2.0.0',
        port: PORT,
        x402_enabled: true,
        payment_wallet: PAYMENT_WALLET,
        price_per_request: `${PRICE_PER_REQUEST_SOL} SOL`,
        network: 'solana-mainnet',
        features: {
            rate_limiting: '60 req/min',
            input_validation: 'Zod schemas',
            data_fallbacks: 'Circuit breaker pattern',
            structured_logging: 'JSON format',
            security_headers: 'Enabled'
        }
    });
    console.log(`KAMIYO DeFi Security Oracle v2.0.0`);
    console.log(`Running on port ${PORT}`);
    console.log(`x402 Protocol: ENABLED`);
    console.log(`Payment wallet: ${PAYMENT_WALLET}`);
    console.log(`Price: ${PRICE_PER_REQUEST_SOL} SOL per request`);
    console.log(`Network: solana-mainnet`);
    console.log(`Production-ready: ✓ Validation ✓ Rate Limiting ✓ Logging ✓ Fallbacks`);
});
export default app;
//# sourceMappingURL=index.js.map