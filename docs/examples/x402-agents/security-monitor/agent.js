#!/usr/bin/env node

/**
 * KAMIYO Security Monitoring Agent
 *
 * Continuously monitors for new crypto exploits and sends alerts when
 * critical vulnerabilities are detected. Uses x402 payments to query
 * KAMIYO API.
 *
 * Use Case: Real-time security monitoring for DeFi protocols
 * Cost: ~$0.24/day ($0.01 per hour × 24 hours)
 */

const axios = require('axios');
const { ethers } = require('ethers');

// Configuration
const CONFIG = {
  API_URL: 'https://api.kamiyo.ai',
  PAYMENT_ADDRESS: '0x742d35Cc6634C0532925a3b8D4B5e3A3A3b7b7b7',
  USDC_CONTRACT: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
  CHECK_INTERVAL: 3600000, // 1 hour in milliseconds
  ALERT_WEBHOOK: process.env.DISCORD_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL,
  WALLET_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY,
  RPC_URL: process.env.BASE_RPC_URL || 'https://mainnet.base.org'
};

// Alert thresholds
const THRESHOLDS = {
  CRITICAL: 10_000_000, // $10M+ = critical
  HIGH: 1_000_000,      // $1M+ = high
  MEDIUM: 100_000       // $100K+ = medium
};

class SecurityMonitorAgent {
  constructor() {
    this.paymentToken = null;
    this.lastCheckTime = null;
    this.alertCount = 0;

    // Initialize wallet for payments
    if (CONFIG.WALLET_PRIVATE_KEY) {
      const provider = new ethers.providers.JsonRpcProvider(CONFIG.RPC_URL);
      this.wallet = new ethers.Wallet(CONFIG.WALLET_PRIVATE_KEY, provider);
    }
  }

  /**
   * Main monitoring loop
   */
  async start() {
    console.log('🔒 KAMIYO Security Monitoring Agent Started');
    console.log(`⏰ Checking every ${CONFIG.CHECK_INTERVAL / 60000} minutes`);
    console.log(`💰 Payment token: ${this.paymentToken ? 'Active' : 'Will create on first request'}`);
    console.log('');

    // Initial check
    await this.checkForExploits();

    // Schedule periodic checks
    setInterval(() => this.checkForExploits(), CONFIG.CHECK_INTERVAL);
  }

  /**
   * Check for new exploits
   */
  async checkForExploits() {
    console.log(`[${new Date().toISOString()}] 🔍 Checking for new exploits...`);

    try {
      const response = await this.makeAuthenticatedRequest('/exploits/latest-alert', {
        hours: CONFIG.CHECK_INTERVAL / 3600000
      });

      if (response.alert_status !== 'none') {
        await this.handleAlert(response);
      } else {
        console.log('✅ No critical exploits detected');
      }

      this.lastCheckTime = new Date();

    } catch (error) {
      console.error('❌ Error checking exploits:', error.message);

      // If payment token expired, clear it
      if (error.response?.status === 402 || error.response?.status === 401) {
        console.log('💳 Payment token expired or invalid, will refresh on next request');
        this.paymentToken = null;
      }
    }
  }

  /**
   * Make authenticated API request with x402 payment handling
   */
  async makeAuthenticatedRequest(endpoint, params = {}) {
    const url = `${CONFIG.API_URL}${endpoint}`;

    // Try with existing payment token
    if (this.paymentToken) {
      try {
        const response = await axios.get(url, {
          params,
          headers: {
            'x-payment-token': this.paymentToken
          }
        });
        return response.data;
      } catch (error) {
        if (error.response?.status === 402 || error.response?.status === 401) {
          console.log('💳 Payment token invalid, creating new payment...');
          this.paymentToken = null;
        } else {
          throw error;
        }
      }
    }

    // No valid token, need to make payment
    console.log('💰 Making USDC payment for API access...');
    const paymentId = await this.makePayment(1.0); // $1 USDC = 100 requests
    this.paymentToken = await this.generateToken(paymentId);
    console.log('✅ Payment successful, token generated');

    // Retry request with new token
    const response = await axios.get(url, {
      params,
      headers: {
        'x-payment-token': this.paymentToken
      }
    });

    return response.data;
  }

  /**
   * Make USDC payment on Base
   */
  async makePayment(amountUSD) {
    if (!this.wallet) {
      throw new Error('Wallet not configured. Set WALLET_PRIVATE_KEY environment variable.');
    }

    const usdcAmount = ethers.utils.parseUnits(amountUSD.toString(), 6); // USDC has 6 decimals

    const usdcContract = new ethers.Contract(
      CONFIG.USDC_CONTRACT,
      ['function transfer(address to, uint256 amount) returns (bool)'],
      this.wallet
    );

    console.log(`📤 Sending ${amountUSD} USDC to ${CONFIG.PAYMENT_ADDRESS}...`);
    const tx = await usdcContract.transfer(CONFIG.PAYMENT_ADDRESS, usdcAmount);
    console.log(`⏳ Transaction submitted: ${tx.hash}`);

    await tx.wait(6); // Wait for 6 confirmations
    console.log(`✅ Payment confirmed: ${tx.hash}`);

    // Verify payment with KAMIYO
    const verification = await axios.post(`${CONFIG.API_URL}/x402/verify-payment`, {
      tx_hash: tx.hash,
      chain: 'base',
      expected_amount: amountUSD
    });

    if (!verification.data.is_valid) {
      throw new Error('Payment verification failed');
    }

    return verification.data.payment_id;
  }

  /**
   * Generate payment token
   */
  async generateToken(paymentId) {
    const response = await axios.post(`${CONFIG.API_URL}/x402/generate-token/${paymentId}`);
    return response.data.payment_token;
  }

  /**
   * Handle exploit alert
   */
  async handleAlert(alertData) {
    const { alert_status, exploit, risk_score, affected_protocols, recommended_action } = alertData;

    this.alertCount++;

    // Determine severity
    const amount = exploit?.amount_usd || 0;
    let severity = 'MEDIUM';
    if (amount >= THRESHOLDS.CRITICAL) severity = 'CRITICAL';
    else if (amount >= THRESHOLDS.HIGH) severity = 'HIGH';

    // Log to console
    console.log('');
    console.log('🚨 ============================================');
    console.log(`   SECURITY ALERT #${this.alertCount}`);
    console.log('🚨 ============================================');
    console.log(`   Severity: ${severity}`);
    console.log(`   Protocol: ${exploit?.protocol || 'Unknown'}`);
    console.log(`   Chain: ${exploit?.chain || 'Unknown'}`);
    console.log(`   Amount: $${amount.toLocaleString()}`);
    console.log(`   Risk Score: ${risk_score}/100`);
    console.log(`   Action: ${recommended_action}`);
    console.log('============================================');
    console.log('');

    // Send webhook notification
    if (CONFIG.ALERT_WEBHOOK) {
      await this.sendWebhookAlert(severity, exploit, risk_score, recommended_action);
    }
  }

  /**
   * Send alert via webhook (Discord/Slack)
   */
  async sendWebhookAlert(severity, exploit, riskScore, action) {
    const color = severity === 'CRITICAL' ? 0xFF0000 : severity === 'HIGH' ? 0xFF6600 : 0xFFCC00;
    const emoji = severity === 'CRITICAL' ? '🚨' : severity === 'HIGH' ? '⚠️' : 'ℹ️';

    const payload = {
      embeds: [{
        title: `${emoji} ${severity} Security Alert`,
        color: color,
        fields: [
          { name: 'Protocol', value: exploit?.protocol || 'Unknown', inline: true },
          { name: 'Chain', value: exploit?.chain || 'Unknown', inline: true },
          { name: 'Amount Lost', value: `$${(exploit?.amount_usd || 0).toLocaleString()}`, inline: true },
          { name: 'Risk Score', value: `${riskScore}/100`, inline: true },
          { name: 'Recommended Action', value: action || 'Monitor situation', inline: false }
        ],
        footer: {
          text: 'KAMIYO Security Intelligence • Powered by x402'
        },
        timestamp: new Date().toISOString()
      }]
    };

    try {
      await axios.post(CONFIG.ALERT_WEBHOOK, payload);
      console.log('📢 Alert sent to webhook');
    } catch (error) {
      console.error('Failed to send webhook alert:', error.message);
    }
  }

  /**
   * Get status report
   */
  getStatus() {
    return {
      running: true,
      lastCheck: this.lastCheckTime,
      alertsTriggered: this.alertCount,
      hasActiveToken: !!this.paymentToken,
      checkInterval: CONFIG.CHECK_INTERVAL / 60000 + ' minutes'
    };
  }
}

// Start agent
if (require.main === module) {
  // Validate configuration
  if (!CONFIG.WALLET_PRIVATE_KEY) {
    console.error('❌ Error: WALLET_PRIVATE_KEY environment variable not set');
    console.error('   Set your Base wallet private key to enable automatic payments');
    process.exit(1);
  }

  const agent = new SecurityMonitorAgent();
  agent.start().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n👋 Shutting down Security Monitoring Agent...');
    console.log(`📊 Final stats: ${agent.alertCount} alerts triggered`);
    process.exit(0);
  });
}

module.exports = SecurityMonitorAgent;
