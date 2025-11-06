#!/usr/bin/env node

/**
 * KAMIYO Portfolio Guardian Agent
 *
 * Monitors protocols in your DeFi portfolio and alerts you when
 * security incidents affect your holdings. Proactive protection
 * before value is lost.
 *
 * Use Case: Portfolio security monitoring and protection
 * Cost: ~$0.01 per protocol per check
 */

const axios = require('axios');
const { ethers } = require('ethers');
const fs = require('fs').promises;
const path = require('path');

const CONFIG = {
  API_URL: 'https://api.kamiyo.ai',
  PAYMENT_ADDRESS: '0x742d35Cc6634C0532925a3b8D4B5e3A3A3b7b7b7',
  USDC_CONTRACT: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  WALLET_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY,
  RPC_URL: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  CHECK_INTERVAL: 1800000, // 30 minutes
  PORTFOLIO_FILE: process.env.PORTFOLIO_FILE || './portfolio.json',
  ALERT_WEBHOOK: process.env.DISCORD_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL
};

class PortfolioGuardianAgent {
  constructor() {
    this.paymentToken = null;
    this.portfolio = [];
    this.knownExploits = new Set(); // Track exploits we've already alerted on

    if (CONFIG.WALLET_PRIVATE_KEY) {
      const provider = new ethers.providers.JsonRpcProvider(CONFIG.RPC_URL);
      this.wallet = new ethers.Wallet(CONFIG.WALLET_PRIVATE_KEY, provider);
    }
  }

  /**
   * Load portfolio from file
   */
  async loadPortfolio() {
    try {
      const data = await fs.readFile(CONFIG.PORTFOLIO_FILE, 'utf-8');
      this.portfolio = JSON.parse(data);
      console.log(`📊 Loaded portfolio: ${this.portfolio.length} positions`);
      return this.portfolio;
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('⚠️  No portfolio file found. Creating example...');
        await this.createExamplePortfolio();
        return this.portfolio;
      }
      throw error;
    }
  }

  /**
   * Create example portfolio file
   */
  async createExamplePortfolio() {
    const example = [
      {
        protocol: 'Uniswap V3',
        chain: 'ethereum',
        position_usd: 10000,
        added_at: new Date().toISOString()
      },
      {
        protocol: 'Aave',
        chain: 'polygon',
        position_usd: 5000,
        added_at: new Date().toISOString()
      },
      {
        protocol: 'Curve Finance',
        chain: 'ethereum',
        position_usd: 7500,
        added_at: new Date().toISOString()
      }
    ];

    await fs.writeFile(
      CONFIG.PORTFOLIO_FILE,
      JSON.stringify(example, null, 2)
    );

    this.portfolio = example;
    console.log(`✅ Created example portfolio at ${CONFIG.PORTFOLIO_FILE}`);
  }

  /**
   * Start monitoring
   */
  async start() {
    console.log('🛡️  KAMIYO Portfolio Guardian Started');
    console.log('');

    await this.loadPortfolio();

    console.log(`⏰ Checking every ${CONFIG.CHECK_INTERVAL / 60000} minutes`);
    console.log(`💰 Total portfolio value: $${this.getTotalValue().toLocaleString()}`);
    console.log('');

    // Initial scan
    await this.scanPortfolio();

    // Schedule periodic scans
    setInterval(() => this.scanPortfolio(), CONFIG.CHECK_INTERVAL);
  }

  /**
   * Scan all portfolio positions for new exploits
   */
  async scanPortfolio() {
    console.log(`[${new Date().toISOString()}] 🔍 Scanning portfolio...`);

    const results = [];

    for (const position of this.portfolio) {
      try {
        const threats = await this.checkPosition(position);
        if (threats.length > 0) {
          results.push({ position, threats });
        }
      } catch (error) {
        console.error(`❌ Error checking ${position.protocol}:`, error.message);
      }
    }

    if (results.length > 0) {
      console.log(`\n🚨 Found ${results.length} positions with security threats!`);
      await this.handleThreats(results);
    } else {
      console.log('✅ All positions secure');
    }

    console.log('');
  }

  /**
   * Check single position for exploits
   */
  async checkPosition(position) {
    const exploits = await this.makeAuthenticatedRequest('/exploits', {
      protocol: position.protocol,
      chain: position.chain,
      page_size: 10,
      sort: 'timestamp',
      order: 'desc'
    });

    // Check for new exploits in last 24 hours
    const oneDayAgo = Date.now() - (24 * 3600000);
    const recentExploits = (exploits.data || []).filter(exploit => {
      const exploitTime = new Date(exploit.timestamp).getTime();
      const exploitId = `${exploit.protocol}-${exploit.timestamp}`;

      return exploitTime > oneDayAgo && !this.knownExploits.has(exploitId);
    });

    // Mark as known
    recentExploits.forEach(exploit => {
      const exploitId = `${exploit.protocol}-${exploit.timestamp}`;
      this.knownExploits.add(exploitId);
    });

    return recentExploits;
  }

  /**
   * Handle security threats
   */
  async handleThreats(results) {
    for (const { position, threats } of results) {
      console.log('\n┌─────────────────────────────────────────────────┐');
      console.log(`│ 🚨 THREAT DETECTED                              │`);
      console.log('└─────────────────────────────────────────────────┘');
      console.log(`  Protocol: ${position.protocol}`);
      console.log(`  Chain: ${position.chain}`);
      console.log(`  Your Position: $${position.position_usd.toLocaleString()}`);
      console.log(`  Threats: ${threats.length} new exploit(s)`);
      console.log('');

      for (const threat of threats) {
        console.log(`  ⚠️  ${new Date(threat.timestamp).toLocaleString()}`);
        console.log(`     Amount: $${threat.amount_usd.toLocaleString()}`);
        console.log(`     ${threat.description}`);
        console.log('');
      }

      // Calculate risk to user's position
      const totalExploitAmount = threats.reduce((sum, t) => sum + t.amount_usd, 0);
      const riskLevel = this.calculatePositionRisk(position, threats);

      console.log(`  Risk to Your Position: ${riskLevel.level}`);
      console.log(`  Recommendation: ${riskLevel.recommendation}`);
      console.log('─────────────────────────────────────────────────\n');

      // Send webhook alert
      if (CONFIG.ALERT_WEBHOOK) {
        await this.sendThreatAlert(position, threats, riskLevel);
      }
    }
  }

  /**
   * Calculate risk to specific position
   */
  calculatePositionRisk(position, threats) {
    const totalLoss = threats.reduce((sum, t) => sum + t.amount_usd, 0);
    const criticalCount = threats.filter(t => t.amount_usd >= 1_000_000).length;

    let level, recommendation;

    if (criticalCount > 0 || totalLoss >= 10_000_000) {
      level = 'CRITICAL';
      recommendation = '🛑 WITHDRAW IMMEDIATELY. Multiple critical exploits detected.';
    } else if (totalLoss >= 1_000_000) {
      level = 'HIGH';
      recommendation = '⚠️  WITHDRAW OR REDUCE POSITION. Significant exploit detected.';
    } else {
      level = 'MEDIUM';
      recommendation = '⚡ MONITOR CLOSELY. Small exploit detected, assess if pattern emerges.';
    }

    return { level, recommendation, totalLoss };
  }

  /**
   * Send threat alert via webhook
   */
  async sendThreatAlert(position, threats, riskLevel) {
    const color = riskLevel.level === 'CRITICAL' ? 0xFF0000 :
                  riskLevel.level === 'HIGH' ? 0xFF6600 : 0xFFCC00;

    const threatFields = threats.slice(0, 3).map(t => ({
      name: new Date(t.timestamp).toLocaleDateString(),
      value: `$${t.amount_usd.toLocaleString()} - ${t.description.substring(0, 100)}`,
      inline: false
    }));

    const payload = {
      embeds: [{
        title: `🛡️ Portfolio Guardian Alert: ${position.protocol}`,
        color: color,
        fields: [
          { name: 'Your Position', value: `$${position.position_usd.toLocaleString()}`, inline: true },
          { name: 'Chain', value: position.chain, inline: true },
          { name: 'Risk Level', value: riskLevel.level, inline: true },
          { name: 'Total Exploited', value: `$${riskLevel.totalLoss.toLocaleString()}`, inline: true },
          { name: 'Threats Detected', value: `${threats.length}`, inline: true },
          { name: 'Recommendation', value: riskLevel.recommendation, inline: false },
          ...threatFields
        ],
        footer: {
          text: 'KAMIYO Portfolio Guardian • Take action now'
        },
        timestamp: new Date().toISOString()
      }]
    };

    try {
      await axios.post(CONFIG.ALERT_WEBHOOK, payload);
      console.log('📢 Alert sent to webhook');
    } catch (error) {
      console.error('Failed to send webhook:', error.message);
    }
  }

  /**
   * Get total portfolio value
   */
  getTotalValue() {
    return this.portfolio.reduce((sum, p) => sum + p.position_usd, 0);
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
}

// Start agent
if (require.main === module) {
  if (!CONFIG.WALLET_PRIVATE_KEY) {
    console.error('❌ Error: WALLET_PRIVATE_KEY environment variable not set');
    process.exit(1);
  }

  const agent = new PortfolioGuardianAgent();
  agent.start().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

  process.on('SIGINT', () => {
    console.log('\n👋 Shutting down Portfolio Guardian...');
    console.log(`🛡️  Protected portfolio value: $${agent.getTotalValue().toLocaleString()}`);
    process.exit(0);
  });
}

module.exports = PortfolioGuardianAgent;
