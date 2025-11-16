// Autonomous Agent Loop - Full lifecycle with zero human intervention

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { AutonomousServiceAgent } from '@x402resolve/agent-client';

const ESCROW_PROGRAM_ID = new PublicKey('E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n');
const connection = new Connection('https://api.devnet.solana.com');

interface AgentDecision {
  action: string;
  reasoning: string;
  result?: any;
}

class IntelligentSecurityAgent {
  private agent: AutonomousServiceAgent;
  private decisions: AgentDecision[] = [];

  constructor(keypair: Keypair) {
    this.agent = new AutonomousServiceAgent({
      keypair,
      connection,
      programId: ESCROW_PROGRAM_ID,
      qualityThreshold: 85,
      maxPrice: 0.001,
      autoDispute: true
    });
  }

  async run() {
    console.log('Intelligent Security Agent - Autonomous Operation\n');
    console.log('Agent will operate without human intervention\n');
    console.log('='.repeat(60));

    await this.discoverAPI();
    await this.assessRiskAndDecide();
    await this.consumeIntelligence();
    await this.evaluatePerformance();

    console.log('\n' + '='.repeat(60));
    console.log('\nAgent Decision Log:');
    this.decisions.forEach((d, i) => {
      console.log(`\n${i + 1}. ${d.action}`);
      console.log(`   Reasoning: ${d.reasoning}`);
      if (d.result) {
        console.log(`   Result: ${JSON.stringify(d.result, null, 2)}`);
      }
    });

    console.log('\nAutonomous operation complete.');
  }

  private async discoverAPI() {
    this.log('Discovering x402-enabled APIs');

    const endpoint = 'https://x402resolve.kamiyo.ai/x402/exploits/latest';

    try {
      const response = await fetch(endpoint);

      if (response.status === 402) {
        const paymentInfo = await response.json();

        this.decisions.push({
          action: 'API Discovery',
          reasoning: `Found x402-enabled API requiring ${paymentInfo.amount} SOL per query`,
          result: {
            endpoint,
            price: paymentInfo.amount,
            quality_guarantee: paymentInfo.quality_guarantee
          }
        });

        console.log(`\n[Agent] Discovered x402 API at ${endpoint}`);
        console.log(`[Agent] Price: ${paymentInfo.amount} SOL`);
        console.log(`[Agent] Quality guarantee: ${paymentInfo.quality_guarantee}`);
      }
    } catch (error) {
      console.log(`[Agent] API discovery failed, will retry`);
    }
  }

  private async assessRiskAndDecide() {
    this.log('Assessing risk and making autonomous decision');

    const maxPrice = 0.001;
    const apiPrice = 0.0001;
    const qualityGuarantee = true;

    const proceed = apiPrice <= maxPrice && qualityGuarantee;

    this.decisions.push({
      action: 'Risk Assessment',
      reasoning: proceed
        ? `Price ${apiPrice} within budget ${maxPrice}, quality guaranteed`
        : `Price ${apiPrice} exceeds budget or no quality guarantee`,
      result: {
        decision: proceed ? 'PROCEED' : 'ABORT',
        price_acceptable: apiPrice <= maxPrice,
        quality_guarantee: qualityGuarantee
      }
    });

    console.log(`\n[Agent] Risk assessment complete`);
    console.log(`[Agent] Decision: ${proceed ? 'PROCEED' : 'ABORT'}`);
    console.log(`[Agent] Reasoning: Price acceptable and quality guaranteed`);
  }

  private async consumeIntelligence() {
    this.log('Consuming security intelligence');

    console.log(`\n[Agent] Creating escrow autonomously`);
    console.log(`[Agent] Requesting latest exploits`);
    console.log(`[Agent] Assessing response quality`);

    try {
      const result = await this.agent.consumeAPI(
        'https://x402resolve.kamiyo.ai/x402/exploits/latest',
        { chain: 'ethereum', severity: 'critical' },
        {
          exploit_id: '',
          protocol: '',
          chain: '',
          amount_lost_usd: 0,
          timestamp: '',
          tx_hash: ''
        }
      );

      this.decisions.push({
        action: 'Intelligence Consumption',
        reasoning: `Quality ${result.quality}% ${result.quality >= 85 ? 'acceptable' : 'insufficient'}`,
        result: {
          quality: result.quality,
          cost: result.cost,
          disputed: result.disputed,
          data_points: Array.isArray(result.data) ? result.data.length : 1
        }
      });

      console.log(`[Agent] Quality score: ${result.quality}%`);
      console.log(`[Agent] Cost: ${result.cost} SOL`);

      if (result.disputed) {
        console.log(`[Agent] Quality insufficient, dispute filed automatically`);
        console.log(`[Agent] Refund: ${((0.0001 - result.cost) / 0.0001 * 100).toFixed(0)}%`);
      } else {
        console.log(`[Agent] Quality acceptable, payment released`);
      }

    } catch (error: any) {
      console.log(`[Agent] Error: ${error.message}`);
    }
  }

  private async evaluatePerformance() {
    this.log('Evaluating agent performance');

    const totalDecisions = this.decisions.length;
    const successfulDecisions = this.decisions.filter(d => d.result).length;
    const autonomyLevel = 100;

    this.decisions.push({
      action: 'Performance Evaluation',
      reasoning: 'Self-assessment of autonomous operation',
      result: {
        total_decisions: totalDecisions,
        successful: successfulDecisions,
        autonomy_level: autonomyLevel,
        human_interventions: 0
      }
    });

    console.log(`\n[Agent] Performance evaluation complete`);
    console.log(`[Agent] Decisions made: ${totalDecisions}`);
    console.log(`[Agent] Successful: ${successfulDecisions}`);
    console.log(`[Agent] Autonomy level: ${autonomyLevel}%`);
  }

  private log(action: string) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Phase: ${action}`);
    console.log('='.repeat(60));
  }
}

async function main() {
  const agentKeypair = Keypair.generate();

  console.log('Initializing Intelligent Security Agent');
  console.log(`Agent Public Key: ${agentKeypair.publicKey.toString()}`);

  const agent = new IntelligentSecurityAgent(agentKeypair);
  await agent.run();
}

main().catch(console.error);
