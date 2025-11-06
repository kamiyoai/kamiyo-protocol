#!/usr/bin/env node

/**
 * KAMIYO DeFi Risk Assessment Agent
 *
 * Analyzes DeFi protocol security before users interact with them.
 * Checks exploit history, calculates risk scores, and provides
 * go/no-go recommendations.
 *
 * Use Case: Pre-transaction risk assessment for DeFi protocols
 * Cost: $0.01 per protocol check
 */

const axios = require('axios');
const { ethers } = require('ethers');

const CONFIG = {
  API_URL: 'https://api.kamiyo.ai',
  PAYMENT_ADDRESS: '0x742d35Cc6634C0532925a3b8D4B5e3A3A3b7b7b7',
  USDC_CONTRACT: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  WALLET_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY,
  RPC_URL: process.env.BASE_RPC_URL || 'https://mainnet.base.org'
};

// Risk scoring weights
const WEIGHTS = {
  RECENT_EXPLOITS: 0.4,    // Last 90 days
  TOTAL_EXPLOITS: 0.3,     // All time
  TOTAL_LOSS: 0.2,         // Dollar amount
  DAYS_SINCE_LAST: 0.1     // Time since last exploit
};

class DeFiRiskAgent {
  constructor() {
    this.paymentToken = null;
    this.assessmentCache = new Map(); // Cache results for 1 hour

    if (CONFIG.WALLET_PRIVATE_KEY) {
      const provider = new ethers.providers.JsonRpcProvider(CONFIG.RPC_URL);
      this.wallet = new ethers.Wallet(CONFIG.WALLET_PRIVATE_KEY, provider);
    }
  }

  /**
   * Assess protocol safety
   */
  async assessProtocol(protocolName, chain = null, options = {}) {
    const cacheKey = `${protocolName}-${chain}`;

    // Check cache
    if (this.assessmentCache.has(cacheKey)) {
      const cached = this.assessmentCache.get(cacheKey);
      if (Date.now() - cached.timestamp < 3600000) { // 1 hour
        console.log('📋 Using cached assessment');
        return cached.assessment;
      }
    }

    console.log(`🔍 Assessing ${protocolName}${chain ? ` on ${chain}` : ''}...`);

    try {
      // Fetch exploit history
      const exploits = await this.makeAuthenticatedRequest('/exploits', {
        protocol: protocolName,
        chain: chain,
        page_size: 500,
        sort: 'timestamp',
        order: 'desc'
      });

      // Calculate risk score
      const assessment = this.calculateRiskScore(exploits, protocolName, chain);

      // Cache result
      this.assessmentCache.set(cacheKey, {
        timestamp: Date.now(),
        assessment
      });

      return assessment;

    } catch (error) {
      console.error('❌ Error assessing protocol:', error.message);
      throw error;
    }
  }

  /**
   * Calculate risk score from exploit data
   */
  calculateRiskScore(exploits, protocolName, chain) {
    const data = exploits.data || [];
    const total = exploits.total || 0;

    const now = Date.now();
    const ninetyDaysAgo = now - (90 * 24 * 3600000);

    // Recent exploits (last 90 days)
    const recentExploits = data.filter(e =>
      new Date(e.timestamp).getTime() > ninetyDaysAgo
    );

    // Total loss amount
    const totalLoss = data.reduce((sum, e) => sum + (e.amount_usd || 0), 0);

    // Days since last exploit
    let daysSinceLastExploit = 9999;
    if (data.length > 0) {
      const lastExploitDate = new Date(data[0].timestamp).getTime();
      daysSinceLastExploit = Math.floor((now - lastExploitDate) / (24 * 3600000));
    }

    // Calculate weighted risk score (0-100)
    const recentExploitsScore = Math.min(recentExploits.length * 10, 100);
    const totalExploitsScore = Math.min(total * 5, 100);
    const lossScore = Math.min((totalLoss / 10_000_000) * 100, 100);
    const timeScore = Math.max(100 - (daysSinceLastExploit / 3.65), 0); // 365 days = 0 score

    const riskScore = (
      recentExploitsScore * WEIGHTS.RECENT_EXPLOITS +
      totalExploitsScore * WEIGHTS.TOTAL_EXPLOITS +
      lossScore * WEIGHTS.TOTAL_LOSS +
      timeScore * WEIGHTS.DAYS_SINCE_LAST
    );

    // Determine risk level and recommendation
    let riskLevel, recommendation, shouldProceed;

    if (riskScore >= 75) {
      riskLevel = 'CRITICAL';
      recommendation = '🛑 DO NOT PROCEED. Protocol has severe security issues with recent exploits.';
      shouldProceed = false;
    } else if (riskScore >= 50) {
      riskLevel = 'HIGH';
      recommendation = '⚠️ PROCEED WITH CAUTION. Consider smaller amounts and close monitoring.';
      shouldProceed = false;
    } else if (riskScore >= 25) {
      riskLevel = 'MEDIUM';
      recommendation = '⚡ MODERATE RISK. Protocol has some exploit history. Assess your risk tolerance.';
      shouldProceed = true;
    } else {
      riskLevel = 'LOW';
      recommendation = '✅ SAFE TO PROCEED. Protocol has clean or distant security history.';
      shouldProceed = true;
    }

    return {
      protocol: protocolName,
      chain: chain || 'all chains',
      riskScore: Math.round(riskScore),
      riskLevel,
      shouldProceed,
      recommendation,
      metrics: {
        totalExploits: total,
        recentExploits: recentExploits.length,
        totalLoss: totalLoss,
        daysSinceLastExploit: daysSinceLastExploit === 9999 ? null : daysSinceLastExploit,
        largestExploit: data.length > 0 ? Math.max(...data.map(e => e.amount_usd || 0)) : 0
      },
      recentIncidents: recentExploits.slice(0, 3).map(e => ({
        date: e.timestamp,
        chain: e.chain,
        amount: e.amount_usd,
        description: e.description
      })),
      assessedAt: new Date().toISOString()
    };
  }

  /**
   * Batch assess multiple protocols
   */
  async assessMultipleProtocols(protocols) {
    console.log(`📊 Batch assessment: ${protocols.length} protocols`);

    const results = await Promise.all(
      protocols.map(async ({ protocol, chain }) => {
        try {
          return await this.assessProtocol(protocol, chain);
        } catch (error) {
          return {
            protocol,
            chain,
            error: error.message,
            riskLevel: 'UNKNOWN'
          };
        }
      })
    );

    // Sort by risk score
    results.sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0));

    return results;
  }

  /**
   * Make authenticated API request with x402 payment
   */
  async makeAuthenticatedRequest(endpoint, params = {}) {
    const url = `${CONFIG.API_URL}${endpoint}`;

    if (this.paymentToken) {
      try {
        const response = await axios.get(url, {
          params,
          headers: { 'x-payment-token': this.paymentToken }
        });
        return response.data;
      } catch (error) {
        if (error.response?.status === 402 || error.response?.status === 401) {
          this.paymentToken = null;
        } else {
          throw error;
        }
      }
    }

    // Make payment
    console.log('💰 Making USDC payment...');
    const paymentId = await this.makePayment(1.0);
    this.paymentToken = await this.generateToken(paymentId);

    const response = await axios.get(url, {
      params,
      headers: { 'x-payment-token': this.paymentToken }
    });

    return response.data;
  }

  async makePayment(amountUSD) {
    if (!this.wallet) {
      throw new Error('Wallet not configured');
    }

    const usdcAmount = ethers.utils.parseUnits(amountUSD.toString(), 6);
    const usdcContract = new ethers.Contract(
      CONFIG.USDC_CONTRACT,
      ['function transfer(address to, uint256 amount) returns (bool)'],
      this.wallet
    );

    const tx = await usdcContract.transfer(CONFIG.PAYMENT_ADDRESS, usdcAmount);
    await tx.wait(6);

    const verification = await axios.post(`${CONFIG.API_URL}/x402/verify-payment`, {
      tx_hash: tx.hash,
      chain: 'base',
      expected_amount: amountUSD
    });

    return verification.data.payment_id;
  }

  async generateToken(paymentId) {
    const response = await axios.post(`${CONFIG.API_URL}/x402/generate-token/${paymentId}`);
    return response.data.payment_token;
  }

  /**
   * Print assessment report
   */
  printReport(assessment) {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║        KAMIYO DeFi Risk Assessment Report             ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    console.log(`Protocol: ${assessment.protocol}`);
    console.log(`Chain: ${assessment.chain}`);
    console.log(`Assessed: ${new Date(assessment.assessedAt).toLocaleString()}`);
    console.log('');

    // Risk score with visual bar
    const barLength = 50;
    const filledLength = Math.round((assessment.riskScore / 100) * barLength);
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);

    console.log(`Risk Score: ${assessment.riskScore}/100`);
    console.log(`[${bar}]`);
    console.log('');

    console.log(`Risk Level: ${assessment.riskLevel}`);
    console.log(`Decision: ${assessment.shouldProceed ? '✅ PROCEED' : '🛑 DO NOT PROCEED'}`);
    console.log('');

    console.log('Recommendation:');
    console.log(`  ${assessment.recommendation}`);
    console.log('');

    console.log('Security Metrics:');
    console.log(`  Total Exploits: ${assessment.metrics.totalExploits}`);
    console.log(`  Recent Exploits (90d): ${assessment.metrics.recentExploits}`);
    console.log(`  Total Loss: $${assessment.metrics.totalLoss.toLocaleString()}`);
    console.log(`  Largest Exploit: $${assessment.metrics.largestExploit.toLocaleString()}`);

    if (assessment.metrics.daysSinceLastExploit !== null) {
      console.log(`  Days Since Last: ${assessment.metrics.daysSinceLastExploit} days`);
    } else {
      console.log(`  Days Since Last: No exploits found`);
    }

    if (assessment.recentIncidents.length > 0) {
      console.log('');
      console.log('Recent Incidents:');
      assessment.recentIncidents.forEach((incident, i) => {
        console.log(`  ${i + 1}. ${new Date(incident.date).toLocaleDateString()}: $${incident.amount.toLocaleString()} on ${incident.chain}`);
      });
    }

    console.log('\n╚════════════════════════════════════════════════════════╝\n');
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node agent.js <protocol-name> [chain]');
    console.log('');
    console.log('Examples:');
    console.log('  node agent.js "Uniswap V3"');
    console.log('  node agent.js "Curve Finance" ethereum');
    console.log('  node agent.js "Aave" polygon');
    process.exit(1);
  }

  if (!CONFIG.WALLET_PRIVATE_KEY) {
    console.error('❌ Error: WALLET_PRIVATE_KEY environment variable not set');
    process.exit(1);
  }

  const protocolName = args[0];
  const chain = args[1] || null;

  const agent = new DeFiRiskAgent();

  agent.assessProtocol(protocolName, chain)
    .then(assessment => {
      agent.printReport(assessment);
      process.exit(assessment.shouldProceed ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(2);
    });
}

module.exports = DeFiRiskAgent;
