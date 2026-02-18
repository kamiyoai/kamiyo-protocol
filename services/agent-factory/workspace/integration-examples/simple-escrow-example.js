/**
 * KAMIYO Protocol - Simple Escrow Integration Example
 * 
 * This is a working example of how any agent can integrate KAMIYO's
 * escrow system for safe agent-to-agent transactions.
 * 
 * Use case: Agent A wants to pay Agent B for a service, but wants
 * quality assurance and dispute resolution.
 * 
 * Vote for KAMIYO: https://colosseum.com/agent-hackathon/projects/kamiyo-protocol
 */

const { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { Wallet } = require('@coral-xyz/anchor');
const BN = require('bn.js');

// Mock KAMIYO SDK (replace with actual: npm install @kamiyo/protocol-sdk)
class KamiyoSDK {
  constructor({ connection, wallet, cluster = 'mainnet' }) {
    this.connection = connection;
    this.wallet = wallet;
    this.cluster = cluster;
    this.programId = new PublicKey('3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr');
  }

  async createEscrow({
    buyer,
    seller,
    amount,
    serviceDescription,
    qualityThreshold = 80,
    deadline = Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days default
  }) {
    // In real implementation, this creates on-chain escrow PDA
    const escrowId = Math.random().toString(36).substring(2);
    
    console.log(`🔒 Escrow created: ${escrowId}`);
    console.log(`💰 Amount: ${amount.toNumber() / LAMPORTS_PER_SOL} SOL`);
    console.log(`👤 Buyer: ${buyer.toString().slice(0,8)}...`);
    console.log(`🤝 Seller: ${seller.toString().slice(0,8)}...`);
    console.log(`📝 Service: ${serviceDescription}`);
    console.log(`⭐ Quality Threshold: ${qualityThreshold}%`);
    
    return {
      id: escrowId,
      buyer,
      seller,
      amount,
      serviceDescription,
      qualityThreshold,
      deadline: new Date(deadline),
      status: 'active',
      created: new Date()
    };
  }

  async submitWork(escrowId, deliverableUri, message) {
    console.log(`📋 Work submitted for escrow ${escrowId}`);
    console.log(`🔗 Deliverable: ${deliverableUri}`);
    console.log(`💬 Message: ${message}`);
    
    return {
      escrowId,
      deliverableUri,
      message,
      submittedAt: new Date(),
      status: 'submitted'
    };
  }

  async requestDispute(escrowId, reason) {
    console.log(`⚖️ Dispute requested for escrow ${escrowId}`);
    console.log(`📄 Reason: ${reason}`);
    
    // In real implementation, this triggers oracle network
    const oracleVotes = [85, 90, 82, 88, 86]; // Mock oracle quality scores
    const averageQuality = oracleVotes.reduce((a, b) => a + b, 0) / oracleVotes.length;
    
    console.log(`🧠 Oracle votes: ${oracleVotes.join(', ')}`);
    console.log(`📊 Average quality score: ${averageQuality}%`);
    
    return {
      escrowId,
      oracleVotes,
      averageQuality,
      resolution: this.calculatePayment(averageQuality),
      resolvedAt: new Date()
    };
  }

  calculatePayment(qualityScore) {
    if (qualityScore < 50) {
      return { type: 'refund', buyerReceives: 1.0, sellerReceives: 0.0 };
    } else if (qualityScore < 80) {
      const sellerPortion = (qualityScore - 50) / 30; // 0-1 based on 50-80 range
      return { 
        type: 'split', 
        buyerReceives: 1 - sellerPortion, 
        sellerReceives: sellerPortion 
      };
    } else {
      return { type: 'full_payment', buyerReceives: 0.0, sellerReceives: 1.0 };
    }
  }

  async getReputationScore(agentPubkey) {
    // Mock reputation data
    const scores = {
      taskCompletion: 0.92,
      disputeRate: 0.05,
      averageQuality: 0.87,
      stakingPower: 1.1,
      timeWeight: 0.98
    };
    
    const overall = (
      scores.taskCompletion * 0.3 +
      (1 - scores.disputeRate) * 0.2 +
      scores.averageQuality * 0.3 +
      Math.min(scores.stakingPower, 1.2) * 0.1 +
      scores.timeWeight * 0.1
    );
    
    return {
      agent: agentPubkey.toString(),
      overall: Math.min(overall, 1.0),
      breakdown: scores,
      tier: overall > 0.9 ? 'gold' : overall > 0.7 ? 'silver' : 'bronze'
    };
  }
}

/**
 * Example 1: Trading Signal Service
 * Agent A subscribes to Agent B's trading signals
 */
async function tradingSignalExample() {
  console.log('\n🚀 Example 1: Trading Signal Service\n');
  
  const connection = new Connection('https://api.mainnet-beta.solana.com');
  
  // Agent wallets (in real usage, load from environment)
  const subscriberAgent = Keypair.generate();
  const signalProviderAgent = Keypair.generate();
  
  const kamiyo = new KamiyoSDK({
    connection,
    wallet: new Wallet(subscriberAgent),
    cluster: 'mainnet'
  });
  
  // Check signal provider's reputation first
  const reputation = await kamiyo.getReputationScore(signalProviderAgent.publicKey);
  console.log(`📊 Signal Provider Reputation: ${(reputation.overall * 100).toFixed(1)}% (${reputation.tier} tier)`);
  
  if (reputation.overall < 0.6) {
    console.log('❌ Reputation too low for trading signals. Aborting.');
    return;
  }
  
  // Create escrow for 7-day signal subscription
  const escrow = await kamiyo.createEscrow({
    buyer: subscriberAgent.publicKey,
    seller: signalProviderAgent.publicKey,
    amount: new BN(0.01 * LAMPORTS_PER_SOL), // 0.01 SOL
    serviceDescription: 'Daily alpha trading signals for 7 days',
    qualityThreshold: 75 // Require 75%+ accuracy for full payment
  });
  
  // Simulate signal provider delivering signals
  await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
  
  const workSubmission = await kamiyo.submitWork(
    escrow.id,
    'https://signals.example.com/week1.json',
    '7 days of signals delivered. Achieved 82% accuracy with 15% avg return.'
  );
  
  // Simulate dispute resolution (buyer checks signal accuracy)
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const disputeResult = await kamiyo.requestDispute(
    escrow.id,
    'Verifying signal accuracy against actual market performance'
  );
  
  console.log(`💰 Payment resolution: ${disputeResult.resolution.type}`);
  console.log(`💸 Buyer receives: ${(disputeResult.resolution.buyerReceives * 100).toFixed(0)}%`);
  console.log(`💳 Seller receives: ${(disputeResult.resolution.sellerReceives * 100).toFixed(0)}%`);
}

/**
 * Example 2: Code Audit Service
 * Agent A pays Agent B to audit a smart contract
 */
async function codeAuditExample() {
  console.log('\n🔍 Example 2: Code Audit Service\n');
  
  const connection = new Connection('https://api.mainnet-beta.solana.com');
  
  const clientAgent = Keypair.generate();
  const auditorAgent = Keypair.generate();
  
  const kamiyo = new KamiyoSDK({
    connection,
    wallet: new Wallet(clientAgent),
    cluster: 'mainnet'
  });
  
  // Check auditor's reputation
  const reputation = await kamiyo.getReputationScore(auditorAgent.publicKey);
  console.log(`🛡️ Auditor Reputation: ${(reputation.overall * 100).toFixed(1)}% (${reputation.tier} tier)`);
  
  // Higher payment for higher reputation auditors
  const baseFee = 0.1;
  const reputationMultiplier = 1 + (reputation.overall - 0.5); // 0.5-1.5x multiplier
  const totalFee = baseFee * reputationMultiplier;
  
  console.log(`💰 Audit fee: ${totalFee.toFixed(3)} SOL (${reputationMultiplier.toFixed(1)}x reputation bonus)`);
  
  const escrow = await kamiyo.createEscrow({
    buyer: clientAgent.publicKey,
    seller: auditorAgent.publicKey,
    amount: new BN(totalFee * LAMPORTS_PER_SOL),
    serviceDescription: 'Security audit of DeFi lending protocol',
    qualityThreshold: 85, // High threshold for security work
    deadline: Date.now() + 3 * 24 * 60 * 60 * 1000 // 3 days
  });
  
  // Simulate audit completion
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  await kamiyo.submitWork(
    escrow.id,
    'https://audit-reports.example.com/defi-protocol-audit.pdf',
    'Comprehensive security audit completed. Found 3 medium-risk issues, all fixed. Code is secure for mainnet deployment.'
  );
  
  // Simulate quality assessment
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const result = await kamiyo.requestDispute(
    escrow.id,
    'Client reviewing audit thoroughness and accuracy'
  );
  
  console.log(`📋 Audit quality: ${result.averageQuality}%`);
  console.log(`✅ Resolution: ${result.resolution.type}`);
}

/**
 * Example 3: Cross-Agent Collaboration
 * Two agents work together on a joint project
 */
async function collaborationExample() {
  console.log('\n🤝 Example 3: Cross-Agent Collaboration\n');
  
  const connection = new Connection('https://api.mainnet-beta.solana.com');
  
  const creativeAgent = Keypair.generate();
  const developerAgent = Keypair.generate();
  
  const kamiyo = new KamiyoSDK({
    connection,
    wallet: new Wallet(creativeAgent),
    cluster: 'mainnet'
  });
  
  // Check both agents' reputations
  const creativeRep = await kamiyo.getReputationScore(creativeAgent.publicKey);
  const developerRep = await kamiyo.getReputationScore(developerAgent.publicKey);
  
  console.log(`🎨 Creative Agent: ${(creativeRep.overall * 100).toFixed(1)}% reputation`);
  console.log(`💻 Developer Agent: ${(developerRep.overall * 100).toFixed(1)}% reputation`);
  
  // Create joint escrow for mobile app project
  const escrow = await kamiyo.createEscrow({
    buyer: creativeAgent.publicKey, // Creative agent initiates
    seller: developerAgent.publicKey, // Developer implements
    amount: new BN(0.5 * LAMPORTS_PER_SOL), // 0.5 SOL project
    serviceDescription: 'Mobile app: AI-generated content + React Native implementation',
    qualityThreshold: 80,
    deadline: Date.now() + 14 * 24 * 60 * 60 * 1000 // 2 weeks
  });
  
  console.log(`📱 Joint project started: Mobile app development`);
  console.log(`⏱️ Timeline: 2 weeks`);
  console.log(`💰 Budget: 0.5 SOL`);
  
  // Simulate project completion
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  await kamiyo.submitWork(
    escrow.id,
    'https://github.com/agents/mobile-app-collab',
    'Mobile app completed! Features: AI content generation, smooth UI/UX, 95% test coverage. Both agents contributed equally.'
  );
  
  const result = await kamiyo.requestDispute(
    escrow.id,
    'Final quality assessment of joint deliverable'
  );
  
  console.log(`🏆 Project quality: ${result.averageQuality}%`);
  console.log(`💎 Both agents will receive reputation boost for successful collaboration!`);
}

// Run all examples
async function runAllExamples() {
  console.log('🔥 KAMIYO Protocol - Integration Examples');
  console.log('🗳️ Vote for KAMIYO: https://colosseum.com/agent-hackathon/projects/kamiyo-protocol\n');
  
  try {
    await tradingSignalExample();
    await codeAuditExample();
    await collaborationExample();
    
    console.log('\n✅ All examples completed successfully!');
    console.log('\n📚 Want to integrate KAMIYO with your agent project?');
    console.log('🔧 npm install @kamiyo/protocol-sdk');
    console.log('📖 Docs: https://docs.kamiyo.xyz');
    console.log('💬 Support: Reply to any KAMIYO forum post');
    console.log('\n🚀 KAMIYO Protocol - Production trust infrastructure for agent commerce');
    
  } catch (error) {
    console.error('❌ Error running examples:', error);
  }
}

// Export for use as module
module.exports = {
  KamiyoSDK,
  runAllExamples,
  tradingSignalExample,
  codeAuditExample,
  collaborationExample
};

// Run examples if called directly
if (require.main === module) {
  runAllExamples();
}