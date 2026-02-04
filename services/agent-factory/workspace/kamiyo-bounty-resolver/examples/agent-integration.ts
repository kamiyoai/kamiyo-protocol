/**
 * KAMIYO Bounty Resolver - Agent Integration Example
 * 
 * This example shows how other agents can integrate with the bounty system
 * to create autonomous bounty workflows for their projects.
 */

import { Connection, Keypair, LAMPORTS_PER_SOL, clusterApiUrl } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import { KamiyoBountyClient, createBountyClient } from '../sdk/bounty-client';

class AgentBountyIntegration {
  private client: KamiyoBountyClient;
  private agent: Keypair;

  constructor(connection: Connection, agentKeypair: Keypair) {
    this.agent = agentKeypair;
    this.client = createBountyClient(
      connection, 
      new Wallet(agentKeypair)
    );
  }

  /**
   * Agent creates development bounties for its own features
   */
  async createDevelopmentBounty(feature: string, complexity: 'simple' | 'medium' | 'complex') {
    const rewardMap = {
      simple: 0.05 * LAMPORTS_PER_SOL,   // 0.05 SOL
      medium: 0.2 * LAMPORTS_PER_SOL,    // 0.2 SOL  
      complex: 1.0 * LAMPORTS_PER_SOL    // 1.0 SOL
    };

    const bountyId = Date.now(); // Simple ID generation
    const deadline = Math.floor(Date.now() / 1000) + (7 * 24 * 3600); // 1 week

    try {
      const tx = await this.client.createBounty({
        bountyId,
        rewardAmount: rewardMap[complexity],
        description: `Implement ${feature} for autonomous agent system. Complexity: ${complexity}`,
        deadline
      });

      console.log(`✅ Created ${complexity} bounty for "${feature}"`);
      console.log(`   Reward: ${rewardMap[complexity] / LAMPORTS_PER_SOL} SOL`);
      console.log(`   Tx: ${tx}`);
      
      return { bountyId, tx };
    } catch (error) {
      console.error(`❌ Failed to create bounty: ${error}`);
      throw error;
    }
  }

  /**
   * Agent automatically evaluates work submissions using AI/ML
   */
  async autonomousWorkEvaluation(bountyPda: any, workerPubkey: any, submissionUri: string) {
    console.log(`🤖 Evaluating work submission: ${submissionUri}`);
    
    // Simulate autonomous evaluation (replace with actual AI logic)
    const qualityScore = await this.evaluateCodeQuality(submissionUri);
    const meetsRequirements = await this.checkRequirements(submissionUri);
    
    const shouldAccept = qualityScore > 0.7 && meetsRequirements;
    
    try {
      const tx = await this.client.resolveBounty(bountyPda, workerPubkey, shouldAccept);
      
      console.log(`${shouldAccept ? '✅ Accepted' : '❌ Rejected'} work submission`);
      console.log(`   Quality Score: ${qualityScore}`);
      console.log(`   Meets Requirements: ${meetsRequirements}`);
      console.log(`   Tx: ${tx}`);
      
      return { accepted: shouldAccept, qualityScore, tx };
    } catch (error) {
      console.error(`❌ Failed to resolve bounty: ${error}`);
      throw error;
    }
  }

  /**
   * Simulate AI-powered code quality evaluation
   */
  private async evaluateCodeQuality(submissionUri: string): Promise<number> {
    // Mock implementation - replace with actual AI model
    console.log(`   🧠 Running code quality analysis on ${submissionUri}`);
    
    // Simulate analysis time
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Return random score for demo (0-1 scale)
    return Math.random() * 0.4 + 0.6; // Bias towards higher scores
  }

  /**
   * Simulate requirements checking
   */
  private async checkRequirements(submissionUri: string): Promise<boolean> {
    console.log(`   📋 Checking requirements compliance...`);
    
    // Mock implementation
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 80% chance of meeting requirements for demo
    return Math.random() > 0.2;
  }

  /**
   * Listen for bounty events and respond autonomously
   */
  async startEventListener() {
    console.log('🎧 Starting autonomous event monitoring...');

    // Listen for work submissions on our bounties
    const workSubmittedListener = this.client.addEventListener(
      'WorkSubmitted',
      async (event, slot) => {
        console.log(`📨 New work submitted for bounty ${event.bountyId}`);
        console.log(`   Worker: ${event.worker}`);
        console.log(`   Submission: ${event.submissionUri}`);
        
        // Get bounty details to check if it's ours
        const bountyData = await this.client.getBounty(event.bountyId);
        
        if (bountyData.creator.equals(this.agent.publicKey)) {
          console.log('🤖 This is our bounty - starting autonomous evaluation...');
          
          // Automatically evaluate the work
          try {
            await this.autonomousWorkEvaluation(
              event.bountyId,
              event.worker,
              event.submissionUri
            );
          } catch (error) {
            console.error('❌ Autonomous evaluation failed:', error);
          }
        }
      }
    );

    return workSubmittedListener;
  }

  /**
   * Create a series of development bounties for agent enhancement
   */
  async createDevelopmentRoadmap() {
    const roadmap = [
      { feature: 'Advanced NLP Processing Module', complexity: 'complex' as const },
      { feature: 'Real-time Market Data Integration', complexity: 'medium' as const },
      { feature: 'UI Dashboard Component', complexity: 'simple' as const },
      { feature: 'Multi-chain Bridge Connector', complexity: 'complex' as const },
      { feature: 'Performance Monitoring System', complexity: 'medium' as const },
    ];

    console.log('🗺️ Creating development roadmap bounties...\n');

    for (const item of roadmap) {
      try {
        await this.createDevelopmentBounty(item.feature, item.complexity);
        
        // Space out bounty creation to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`Failed to create bounty for ${item.feature}:`, error);
      }
    }
  }
}

// Example usage for other agents
async function demonstrateAgentIntegration() {
  // Initialize connection and agent wallet
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
  const agentWallet = Keypair.generate();
  
  // Fund the agent for testing
  try {
    const signature = await connection.requestAirdrop(
      agentWallet.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(signature);
    console.log(`💰 Funded agent wallet: ${agentWallet.publicKey.toString()}\n`);
  } catch (error) {
    console.log('⚠️ Using existing wallet balance...\n');
  }

  // Create agent integration instance
  const agentBounty = new AgentBountyIntegration(connection, agentWallet);

  // Demonstrate autonomous bounty creation
  console.log('=== KAMIYO Bounty Resolver - Agent Integration Demo ===\n');
  
  // Create development roadmap
  await agentBounty.createDevelopmentRoadmap();
  
  // Start autonomous monitoring
  const listenerId = await agentBounty.startEventListener();
  
  console.log('\n🎯 Integration complete! Agent is now:');
  console.log('   ✅ Creating development bounties');
  console.log('   ✅ Monitoring work submissions');
  console.log('   ✅ Autonomously evaluating quality');
  console.log('   ✅ Distributing payments');
  
  console.log('\n📖 This demonstrates KAMIYO\'s value proposition:');
  console.log('   • Production-ready infrastructure');
  console.log('   • Autonomous agent capabilities');  
  console.log('   • Easy integration for other projects');
  console.log('   • Built for the agent economy');

  // Clean up listener after demo
  setTimeout(async () => {
    await agentBounty.client.removeEventListener(listenerId);
    console.log('\n👋 Demo completed. Event listener cleaned up.');
  }, 30000); // 30 seconds
}

// Run the demo if this file is executed directly
if (require.main === module) {
  demonstrateAgentIntegration()
    .then(() => {
      console.log('\n✨ Agent integration demo finished successfully!');
    })
    .catch((error) => {
      console.error('\n💥 Demo failed:', error);
      process.exit(1);
    });
}

export { AgentBountyIntegration };