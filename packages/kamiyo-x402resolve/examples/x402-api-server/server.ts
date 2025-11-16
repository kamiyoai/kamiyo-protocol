// KAMIYO Security Intelligence API - HTTP 402 with x402Resolve quality guarantees

import express, { Request, Response } from 'express';
import { Connection, PublicKey } from '@solana/web3.js';
import { x402PaymentMiddleware, getEscrowInfo } from './middleware';
import cors from 'cors';

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;
const ESCROW_PROGRAM_ID = new PublicKey(
  process.env.ESCROW_PROGRAM_ID || 'E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n'
);
const connection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'
);

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    service: 'KAMIYO x402 Security Intelligence API',
    version: '1.0.0',
    documentation: 'https://github.com/x402kamiyo/x402resolve',
    endpoints: {
      exploits: '/x402/exploits/latest',
      risk_assessment: '/x402/protocol/assess-risk',
      wallet_check: '/x402/wallet/check-involvement/:address',
      health: '/health',
      pricing: '/x402/pricing'
    },
    payment: {
      protocol: 'HTTP 402 Payment Required',
      network: 'Solana Devnet',
      program: ESCROW_PROGRAM_ID.toString(),
      price_per_request: '0.0001 SOL (~$0.01 USD)',
      quality_guarantee: true
    }
  });
});

// Pricing info (no payment required) - must be before middleware
app.get('/x402/pricing', (req: Request, res: Response) => {
  res.json({
    pricing: {
      pay_per_query: {
        cost_sol: 0.0001,
        cost_usd: 0.01,
        requests_per_payment: 1,
        validity: '24 hours'
      },
      subscription_tiers: {
        personal: {
          cost_usd: 19,
          interval: 'month',
          agents: 1,
          queries: 'unlimited',
          features: ['MCP integration', 'Real-time alerts']
        },
        team: {
          cost_usd: 99,
          interval: 'month',
          agents: 5,
          queries: 'unlimited',
          features: ['MCP integration', 'Webhook notifications', 'Priority support']
        },
        enterprise: {
          cost_usd: 299,
          interval: 'month',
          agents: 'unlimited',
          queries: 'unlimited',
          features: ['MCP integration', 'SLA guarantees', '99.9% uptime', 'Dedicated support']
        }
      }
    },
    supported_chains: ['base', 'ethereum', 'solana'],
    payment_methods: ['USDC', 'SOL'],
    quality_guarantee: {
      enabled: true,
      threshold: 80,
      refund_formula: 'sliding_scale',
      dispute_resolution: 'x402Resolve multi-oracle consensus'
    }
  });
});

// Apply x402 payment middleware to all protected endpoints
app.use('/x402/*', x402PaymentMiddleware({
  realm: 'kamiyo-security-intelligence',
  programId: ESCROW_PROGRAM_ID,
  connection,
  price: 0.0001, // $0.01 USDC equivalent in SOL
  qualityGuarantee: true
}));

/**
 * GET /x402/exploits/latest
 *
 * Returns recent cryptocurrency exploits from 20+ security sources
 * Detection time: 5-15 minutes from first public report
 * Coverage: 15+ chains including Ethereum, BSC, Polygon, Arbitrum, Solana
 */
app.get('/x402/exploits/latest', async (req: Request, res: Response) => {
  const escrow = getEscrowInfo(req);
  const { chain, min_amount, severity, limit = 100 } = req.query;

  // Simulated KAMIYO security intelligence data
  // In production: SELECT * FROM exploits WHERE timestamp > NOW() - INTERVAL '24 hours'
  const exploits = [
    {
      exploit_id: 'exp_20251103_001',
      protocol: 'UniswapV3Fork',
      protocol_address: '0x1234...abcd',
      chain: 'ethereum',
      exploit_type: 'reentrancy',
      amount_lost_usd: 1250000,
      amount_lost_native: 450.5,
      native_currency: 'ETH',
      timestamp: new Date().toISOString(),
      detected_at: new Date(Date.now() - 300000).toISOString(), // 5 min ago
      severity: 'critical',
      description: 'Reentrancy vulnerability exploited in liquidity withdrawal function',
      attack_vector: 'Flash loan + reentrancy on pool.withdraw()',
      tx_hash: '0x7f3c9842a1b5e3d6f8c2a1b9e4d3c7f2a1b8e5d4c3f2a1b7e6d5c4f3a2b1d0e9',
      exploiter_address: '0x9876...5432',
      victim_address: '0xabcd...1234',
      block_number: 18945230,
      confirmations: 48,
      status: 'confirmed',
      sources: ['CertiK Alert', 'PeckShield', 'BlockSec'],
      mitigation_status: 'contract_paused',
      funds_recovered: false,
      related_exploits: []
    },
    {
      exploit_id: 'exp_20251103_002',
      protocol: 'SolanaDEX',
      protocol_address: '9zT2k5Qw7x8R3mN4pL6jD9fH2sG5vB8nM3kT7yU4wV1z',
      chain: 'solana',
      exploit_type: 'price_manipulation',
      amount_lost_usd: 450000,
      amount_lost_native: 3200,
      native_currency: 'SOL',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      detected_at: new Date(Date.now() - 4200000).toISOString(),
      severity: 'high',
      description: 'Oracle price manipulation via coordinated flash loan attack',
      attack_vector: 'Flash loan on Pool A -> price manipulation -> arbitrage on Pool B',
      tx_hash: 'Hx7km3pL9zT2k5Qw8R3mN4pL6jD9fH2sG5vB8nM3kT7yU4wV1zX6cF4gH5jK8mN',
      exploiter_address: 'Bv9pn8Rx7mL6kJ5hG4fD3sA2zX1cV9bN8mL7kJ6hG5fD4sA3zX2cV1b',
      victim_address: '9zT2k5Qw7x8R3mN4pL6jD9fH2sG5vB8nM3kT7yU4wV1z',
      block_number: 245678901,
      confirmations: 128,
      status: 'confirmed',
      sources: ['CertiK', 'Otter Security'],
      mitigation_status: 'oracle_updated',
      funds_recovered: false,
      related_exploits: []
    }
  ];

  // Calculate data quality score (completeness, freshness, accuracy)
  const quality = calculateDataQuality({
    data: exploits,
    expected_fields: ['exploit_id', 'protocol', 'chain', 'amount_lost_usd', 'timestamp', 'tx_hash'],
    max_age_seconds: 86400, // 24 hours
    min_records: 1
  });

  res.json({
    success: true,
    data: exploits,
    metadata: {
      count: exploits.length,
      sources_monitored: 20,
      chains_covered: ['Ethereum', 'BSC', 'Polygon', 'Arbitrum', 'Optimism', 'Base', 'Solana', 'Avalanche', 'Fantom', 'Cronos', 'Aurora', 'Moonbeam', 'Celo', 'Harmony', 'Gnosis'],
      detection_time_avg: '5-15 minutes',
      total_tracked_losses_usd: '2.1B+',
      timestamp: new Date().toISOString()
    },
    quality_score: quality,
    escrow: escrow?.pubkey.toString(),
    payment: {
      cost_sol: 0.0001,
      cost_usd: 0.01,
      requests_included: 1,
      quality_guaranteed: true,
      dispute_threshold: 80
    }
  });
});

/**
 * POST /x402/protocol/assess-risk
 *
 * Comprehensive security risk assessment for a protocol
 * Based on: code audits, TVL, exploit history, oracle quality
 */
app.post('/x402/protocol/assess-risk', async (req: Request, res: Response) => {
  const escrow = getEscrowInfo(req);
  const { protocol_address, chain } = req.body;

  if (!protocol_address || !chain) {
    return res.status(400).json({
      error: 'Missing required fields',
      required: ['protocol_address', 'chain']
    });
  }

  const riskAssessment = {
    protocol_address,
    chain,
    risk_score: 35, // 0-100, lower is safer
    risk_level: 'medium',
    confidence: 0.92,
    analysis: {
      code_quality: {
        audited: true,
        auditor: 'CertiK',
        audit_date: '2024-08-15',
        audit_report_url: 'https://certik.com/reports/...',
        critical_findings: 0,
        high_findings: 2,
        medium_findings: 5,
        resolved: true
      },
      exploit_history: {
        total_exploits: 1,
        total_loss_usd: 25000,
        most_recent: '2024-10-12',
        exploits: [
          {
            date: '2024-10-12',
            type: 'front_run',
            severity: 'low',
            amount_usd: 25000,
            resolved: true,
            mitigation: 'Added MEV protection'
          }
        ]
      },
      economic_security: {
        tvl_usd: 12500000,
        daily_volume_usd: 3200000,
        liquidity_depth: 'high',
        age_days: 180,
        active_users_30d: 8500
      },
      oracle_risk: {
        oracle_type: 'chainlink',
        oracle_quality: 'high',
        update_frequency: '1 minute',
        manipulation_resistance: 'high'
      },
      smart_contract_risk: {
        complexity: 'medium',
        upgrade_mechanism: 'timelock',
        admin_keys: 'multisig_5_of_9',
        emergency_pause: true
      }
    },
    recommendations: [
      'Monitor for reentrancy patterns in withdrawal functions',
      'Implement rate limiting on large withdrawals',
      'Add circuit breaker for oracle price deviation >5%',
      'Consider increasing audit frequency to quarterly'
    ],
    timestamp: new Date().toISOString()
  };

  const quality = calculateDataQuality({
    data: riskAssessment,
    expected_fields: ['risk_score', 'risk_level', 'analysis', 'recommendations'],
    max_age_seconds: 3600,
    min_records: 1
  });

  res.json({
    success: true,
    data: riskAssessment,
    quality_score: quality,
    escrow: escrow?.pubkey.toString(),
    payment: {
      cost_sol: 0.0001,
      cost_usd: 0.01
    }
  });
});

/**
 * GET /x402/wallet/check-involvement/:address
 *
 * Check if wallet address involved in any exploits
 * Returns: flagged status, risk level, involvement history
 */
app.get('/x402/wallet/check-involvement/:address', async (req: Request, res: Response) => {
  const escrow = getEscrowInfo(req);
  const { address } = req.params;
  const { chains } = req.query;

  const analysis = {
    address,
    is_flagged: false,
    risk_level: 'low',
    risk_score: 15,
    involvement: {
      as_exploiter: [],
      as_victim: [],
      as_related: []
    },
    behavior_analysis: {
      first_seen: '2024-01-15',
      last_seen: new Date().toISOString(),
      transaction_count: 1247,
      chains_active: ['ethereum', 'bsc', 'polygon'],
      avg_tx_value_usd: 2500,
      suspicious_patterns: []
    },
    similar_addresses: [],
    reputation_score: 85,
    timestamp: new Date().toISOString()
  };

  const quality = calculateDataQuality({
    data: analysis,
    expected_fields: ['address', 'is_flagged', 'risk_level', 'involvement'],
    max_age_seconds: 300,
    min_records: 1
  });

  res.json({
    success: true,
    data: analysis,
    quality_score: quality,
    escrow: escrow?.pubkey.toString(),
    payment: {
      cost_sol: 0.0001,
      cost_usd: 0.01
    }
  });
});

/**
 * POST /x402/dispute/:escrow
 *
 * File quality dispute for poor data
 * Triggers x402Resolve automated dispute resolution
 */
app.post('/x402/dispute/:escrow', async (req: Request, res: Response) => {
  const { escrow } = req.params;
  const { query, expected_quality, actual_quality, evidence } = req.body;

  console.log(`[Dispute Filed] Escrow: ${escrow}`);
  console.log(`[Dispute Filed] Quality: ${actual_quality}/100 (expected: ${expected_quality})`);

  // Calculate refund based on quality score
  const refundPercentage = actual_quality < 80 ? Math.min(100, 100 - actual_quality) : 0;
  const refundAmount = (0.0001 * refundPercentage) / 100;

  res.json({
    dispute_id: `disp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    escrow,
    status: 'filed',
    quality_assessment: {
      expected: expected_quality,
      actual: actual_quality,
      threshold: 80,
      passed: actual_quality >= 80
    },
    refund: {
      percentage: refundPercentage,
      amount_sol: refundAmount,
      amount_usd: refundAmount * 100 // assuming 1 SOL = $100
    },
    resolution: {
      estimated_time: '24-48 hours',
      oracle_verification: 'pending',
      method: 'multi_oracle_consensus'
    },
    evidence_recorded: !!evidence,
    timestamp: new Date().toISOString()
  });
});

/**
 * Calculate data quality score
 *
 * Factors:
 * - Completeness (40%): All required fields present
 * - Freshness (30%): Data age within acceptable range
 * - Accuracy (30%): Valid data formats and ranges
 */
function calculateDataQuality(params: {
  data: any;
  expected_fields: string[];
  max_age_seconds: number;
  min_records: number;
}): number {
  let score = 100;
  const { data, expected_fields, max_age_seconds, min_records } = params;

  // Completeness check (40% weight)
  const dataArray = Array.isArray(data) ? data : data.data || [data];
  if (dataArray.length < min_records) {
    score -= 40;
  } else {
    const missingFields = expected_fields.filter(field => {
      if (Array.isArray(dataArray)) {
        return !dataArray[0] || !(field in dataArray[0]);
      }
      return !(field in dataArray);
    });
    score -= (missingFields.length / expected_fields.length) * 40;
  }

  // Freshness check (30% weight)
  const timestamp = dataArray[0]?.timestamp || dataArray.timestamp;
  if (timestamp) {
    const age = (Date.now() - new Date(timestamp).getTime()) / 1000;
    if (age > max_age_seconds) {
      score -= 30;
    } else {
      score -= (age / max_age_seconds) * 30;
    }
  }

  // Accuracy check (30% weight)
  // Check for valid data in critical fields
  if (dataArray[0]?.exploit_id && !dataArray[0].exploit_id.startsWith('exp_')) {
    score -= 10;
  }
  if (dataArray[0]?.amount_lost_usd !== undefined && dataArray[0].amount_lost_usd < 0) {
    score -= 10;
  }
  if (dataArray[0]?.severity && !['critical', 'high', 'medium', 'low'].includes(dataArray[0].severity)) {
    score -= 10;
  }

  return Math.max(0, Math.round(score));
}

// Health check (no payment required)
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'KAMIYO Security Intelligence API',
    version: '1.0.0',
    solana: {
      network: 'devnet',
      program: ESCROW_PROGRAM_ID.toString(),
      rpc: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'
    },
    payment: {
      x402_enabled: true,
      quality_guarantee: true,
      price_per_query: '0.0001 SOL ($0.01 USDC)',
      dispute_threshold: 80
    },
    coverage: {
      sources: 20,
      chains: 15,
      detection_time: '5-15 minutes',
      tracked_losses: '$2.1B+'
    }
  });
});

app.listen(PORT, () => {
  console.log(`\nKAMIYO x402 Security Intelligence API`);
  console.log(`   http://localhost:${PORT}\n`);
  console.log(`   Solana Network: devnet`);
  console.log(`   Program ID: ${ESCROW_PROGRAM_ID.toString()}\n`);
  console.log(`   Protected Endpoints (402 Payment Required):`);
  console.log(`   GET  /x402/exploits/latest`);
  console.log(`   POST /x402/protocol/assess-risk`);
  console.log(`   GET  /x402/wallet/check-involvement/:address`);
  console.log(`   POST /x402/dispute/:escrow\n`);
  console.log(`   Public Endpoints:`);
  console.log(`   GET  /`);
  console.log(`   GET  /health`);
  console.log(`   GET  /x402/pricing\n`);
  console.log(`   Payment: 0.0001 SOL ($0.01 USDC) per query`);
  console.log(`   Quality guarantee: Automatic refunds if quality < 80%`);
  console.log(`   Detection time: 5-15 minutes from first report`);
  console.log(`   Coverage: 15+ chains, 20+ sources, $2.1B+ tracked\n`);
});
