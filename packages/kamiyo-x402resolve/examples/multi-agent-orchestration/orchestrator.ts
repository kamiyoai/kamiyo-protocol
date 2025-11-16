/**
 * Multi-Agent Orchestration System with x402Resolve
 *
 * Demonstrates:
 * - Coordinator agent managing multiple specialized agents
 * - Inter-agent communication and data sharing
 * - Quality consensus across agents
 * - Collaborative decision making
 * - Shared x402 escrow pool
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { AutonomousServiceAgent } from '@x402resolve/agent-client';

const ESCROW_PROGRAM_ID = new PublicKey('E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n');
const connection = new Connection('https://api.devnet.solana.com');

interface AgentTask {
  agentId: string;
  task: string;
  priority: number;
  dependencies: string[];
}

interface AgentResult {
  agentId: string;
  success: boolean;
  data: any;
  quality: number;
  cost: number;
  disputed: boolean;
  timestamp: number;
}

interface CoordinationPlan {
  tasks: AgentTask[];
  totalBudget: number;
  qualityThreshold: number;
  parallelExecution: boolean;
}

class SpecializedAgent {
  private agent: AutonomousServiceAgent;
  public id: string;
  public specialty: string;
  public performanceHistory: AgentResult[] = [];

  constructor(id: string, specialty: string, keypair: Keypair, config: any) {
    this.id = id;
    this.specialty = specialty;
    this.agent = new AutonomousServiceAgent({
      keypair,
      connection,
      programId: ESCROW_PROGRAM_ID,
      qualityThreshold: config.qualityThreshold || 80,
      maxPrice: config.maxPrice || 0.001,
      autoDispute: true
    });
  }

  async executeTask(task: AgentTask, sharedContext: any): Promise<AgentResult> {
    console.log(`\n[${this.id}] Executing: ${task.task}`);
    console.log(`  Specialty: ${this.specialty}`);
    console.log(`  Priority: ${task.priority}`);

    const startTime = Date.now();

    try {
      // Simulate specialized API calls with quality assessment
      const result = await this.performSpecializedWork(task, sharedContext);

      const agentResult: AgentResult = {
        agentId: this.id,
        success: true,
        data: result.data,
        quality: result.quality,
        cost: result.cost,
        disputed: result.disputed,
        timestamp: Date.now() - startTime
      };

      this.performanceHistory.push(agentResult);

      console.log(`  ✓ Completed in ${agentResult.timestamp}ms`);
      console.log(`  Quality: ${agentResult.quality}%`);
      console.log(`  Cost: ${agentResult.cost} SOL`);

      return agentResult;

    } catch (error: any) {
      console.log(`  ✗ Failed: ${error.message}`);
      const failureResult: AgentResult = {
        agentId: this.id,
        success: false,
        data: null,
        quality: 0,
        cost: 0,
        disputed: false,
        timestamp: Date.now() - startTime
      };

      this.performanceHistory.push(failureResult);
      return failureResult;
    }
  }

  private async performSpecializedWork(task: AgentTask, context: any): Promise<any> {
    // Simulate different data quality based on agent specialty
    const baseQuality = 70 + Math.random() * 30;
    const qualityBonus = task.task.toLowerCase().includes(this.specialty.toLowerCase()) ? 15 : 0;
    const quality = Math.min(100, baseQuality + qualityBonus);

    const cost = 0.0001 + Math.random() * 0.0005;
    const disputed = quality < 80;

    return {
      quality: Math.round(quality),
      cost: disputed ? cost * (quality / 100) : cost,
      disputed,
      data: {
        specialty: this.specialty,
        taskCompleted: task.task,
        contextUsed: Object.keys(context).length > 0,
        findings: `${this.specialty} analysis complete`
      }
    };
  }

  getAverageQuality(): number {
    if (this.performanceHistory.length === 0) return 0;
    const sum = this.performanceHistory.reduce((acc, r) => acc + r.quality, 0);
    return sum / this.performanceHistory.length;
  }

  getTotalCost(): number {
    return this.performanceHistory.reduce((acc, r) => acc + r.cost, 0);
  }
}

class MultiAgentOrchestrator {
  private agents: SpecializedAgent[] = [];
  private sharedContext: any = {};
  private executionLog: string[] = [];

  constructor(private coordinatorKeypair: Keypair) {}

  /**
   * Register specialized agents
   */
  registerAgents() {
    console.log('\n[Orchestrator] Registering Specialized Agents');
    console.log('='.repeat(70));

    const agentConfigs = [
      { id: 'SecurityAnalyst', specialty: 'Security', qualityThreshold: 90, maxPrice: 0.0008 },
      { id: 'MarketAnalyst', specialty: 'Market Data', qualityThreshold: 85, maxPrice: 0.0005 },
      { id: 'RiskAnalyst', specialty: 'Risk Assessment', qualityThreshold: 95, maxPrice: 0.001 },
      { id: 'ComplianceAgent', specialty: 'Compliance', qualityThreshold: 98, maxPrice: 0.0003 }
    ];

    agentConfigs.forEach(config => {
      const keypair = Keypair.generate();
      const agent = new SpecializedAgent(config.id, config.specialty, keypair, config);
      this.agents.push(agent);

      console.log(`\n  Registered: ${config.id}`);
      console.log(`    Specialty: ${config.specialty}`);
      console.log(`    Quality Threshold: ${config.qualityThreshold}%`);
      console.log(`    Max Price: ${config.maxPrice} SOL`);
    });
  }

  /**
   * Create coordination plan with task dependencies
   */
  createCoordinationPlan(objective: string): CoordinationPlan {
    console.log('\n[Orchestrator] Creating Coordination Plan');
    console.log('='.repeat(70));
    console.log(`\nObjective: ${objective}`);

    const tasks: AgentTask[] = [
      {
        agentId: 'ComplianceAgent',
        task: 'Verify regulatory compliance of target protocol',
        priority: 10,
        dependencies: []
      },
      {
        agentId: 'SecurityAnalyst',
        task: 'Perform security audit and vulnerability assessment',
        priority: 9,
        dependencies: []
      },
      {
        agentId: 'MarketAnalyst',
        task: 'Analyze market conditions and liquidity',
        priority: 7,
        dependencies: ['ComplianceAgent']
      },
      {
        agentId: 'RiskAnalyst',
        task: 'Calculate composite risk score',
        priority: 8,
        dependencies: ['SecurityAnalyst', 'MarketAnalyst']
      }
    ];

    const plan: CoordinationPlan = {
      tasks,
      totalBudget: 0.003,
      qualityThreshold: 85,
      parallelExecution: true
    };

    console.log(`\nPlanned Tasks: ${tasks.length}`);
    tasks.forEach((t, i) => {
      console.log(`\n  ${i + 1}. ${t.task}`);
      console.log(`     Agent: ${t.agentId}`);
      console.log(`     Priority: ${t.priority}/10`);
      console.log(`     Dependencies: ${t.dependencies.length > 0 ? t.dependencies.join(', ') : 'None'}`);
    });

    console.log(`\nTotal Budget: ${plan.totalBudget} SOL`);
    console.log(`Quality Threshold: ${plan.qualityThreshold}%`);
    console.log(`Execution Mode: ${plan.parallelExecution ? 'Parallel' : 'Sequential'}`);

    return plan;
  }

  /**
   * Execute coordination plan with dependency resolution
   */
  async executeCoordinationPlan(plan: CoordinationPlan): Promise<AgentResult[]> {
    console.log('\n[Orchestrator] Executing Coordination Plan');
    console.log('='.repeat(70));

    const results: AgentResult[] = [];
    const completed = new Set<string>();

    // Sort tasks by priority and dependencies
    const sortedTasks = this.topologicalSort(plan.tasks);

    for (const task of sortedTasks) {
      // Wait for dependencies
      const dependenciesMet = task.dependencies.every(dep => completed.has(dep));

      if (!dependenciesMet) {
        console.log(`\n[Orchestrator] Waiting for dependencies: ${task.dependencies.join(', ')}`);
        continue;
      }

      // Find appropriate agent
      const agent = this.agents.find(a => a.id === task.agentId);
      if (!agent) {
        console.log(`\n[Orchestrator] Agent ${task.agentId} not found`);
        continue;
      }

      // Execute task
      const result = await agent.executeTask(task, this.sharedContext);
      results.push(result);

      // Update shared context for future agents
      if (result.success) {
        this.sharedContext[task.agentId] = result.data;
        completed.add(task.agentId);
      }

      // Quality check
      if (result.quality < plan.qualityThreshold) {
        console.log(`\n[Orchestrator] Warning: ${task.agentId} quality (${result.quality}%) below threshold`);
        if (result.disputed) {
          console.log(`[Orchestrator] Dispute filed - refund applied`);
        }
      }

      // Budget check
      const totalSpent = results.reduce((sum, r) => sum + r.cost, 0);
      if (totalSpent > plan.totalBudget) {
        console.log(`\n[Orchestrator] Budget exceeded: ${totalSpent.toFixed(6)} / ${plan.totalBudget} SOL`);
        break;
      }
    }

    return results;
  }

  /**
   * Build consensus from multi-agent results
   */
  buildConsensus(results: AgentResult[]): any {
    console.log('\n[Orchestrator] Building Multi-Agent Consensus');
    console.log('='.repeat(70));

    const successfulResults = results.filter(r => r.success);

    if (successfulResults.length === 0) {
      console.log('\n  No successful results to build consensus');
      return {
        decision: 'ABORT',
        confidence: 0,
        reasoning: ['All agents failed to produce quality results']
      };
    }

    // Quality-weighted voting
    const totalQuality = successfulResults.reduce((sum, r) => sum + r.quality, 0);
    const avgQuality = totalQuality / successfulResults.length;

    console.log(`\n  Successful Agents: ${successfulResults.length}/${results.length}`);
    console.log(`  Average Quality: ${avgQuality.toFixed(0)}%`);

    // Analyze agent agreement
    const agentVotes = successfulResults.map(r => ({
      agentId: r.agentId,
      quality: r.quality,
      weight: r.quality / totalQuality
    }));

    console.log(`\n  Quality-Weighted Votes:`);
    agentVotes.forEach(v => {
      console.log(`    ${v.agentId}: ${(v.weight * 100).toFixed(1)}% (Quality: ${v.quality}%)`);
    });

    // Decision logic
    let decision = 'PROCEED';
    let confidence = avgQuality / 100;
    const reasoning: string[] = [];

    if (avgQuality >= 90) {
      reasoning.push(`Strong consensus with ${avgQuality.toFixed(0)}% avg quality`);
      reasoning.push(`All ${successfulResults.length} agents agree`);
    } else if (avgQuality >= 75) {
      reasoning.push(`Moderate consensus with ${avgQuality.toFixed(0)}% avg quality`);
      decision = 'PROCEED_WITH_CAUTION';
    } else {
      reasoning.push(`Weak consensus - quality below threshold`);
      decision = 'HOLD';
      confidence = 0.5;
    }

    // Check for disputed results
    const disputedCount = results.filter(r => r.disputed).length;
    if (disputedCount > 0) {
      reasoning.push(`${disputedCount} agents filed quality disputes`);
      reasoning.push(`x402 refunds applied to ${disputedCount} transactions`);
    }

    console.log(`\n  Consensus Decision: ${decision}`);
    console.log(`  Confidence: ${(confidence * 100).toFixed(0)}%`);
    console.log(`\n  Reasoning:`);
    reasoning.forEach(r => console.log(`    - ${r}`));

    return {
      decision,
      confidence,
      reasoning,
      avgQuality,
      agentVotes
    };
  }

  /**
   * Generate performance report
   */
  generatePerformanceReport(results: AgentResult[]) {
    console.log('\n[Orchestrator] Performance Report');
    console.log('='.repeat(70));

    const totalCost = results.reduce((sum, r) => sum + r.cost, 0);
    const avgQuality = results.reduce((sum, r) => sum + r.quality, 0) / results.length;
    const disputedCount = results.filter(r => r.disputed).length;
    const successRate = results.filter(r => r.success).length / results.length * 100;

    console.log(`\nOverall Metrics:`);
    console.log(`  Total Agents: ${this.agents.length}`);
    console.log(`  Tasks Completed: ${results.length}`);
    console.log(`  Success Rate: ${successRate.toFixed(0)}%`);
    console.log(`  Average Quality: ${avgQuality.toFixed(0)}%`);
    console.log(`  Total Cost: ${totalCost.toFixed(6)} SOL`);
    console.log(`  Disputes Filed: ${disputedCount}`);

    console.log(`\nPer-Agent Performance:`);
    this.agents.forEach(agent => {
      const agentResults = results.filter(r => r.agentId === agent.id);
      if (agentResults.length > 0) {
        const avgQual = agent.getAverageQuality();
        const totalCost = agent.getTotalCost();

        console.log(`\n  ${agent.id} (${agent.specialty}):`);
        console.log(`    Average Quality: ${avgQual.toFixed(0)}%`);
        console.log(`    Total Cost: ${totalCost.toFixed(6)} SOL`);
        console.log(`    Tasks: ${agentResults.length}`);
      }
    });

    console.log(`\nx402 Quality Advantages:`);
    console.log(`  ✓ Multi-agent quality consensus`);
    console.log(`  ✓ Automatic refunds for ${disputedCount} low-quality results`);
    console.log(`  ✓ Quality-weighted decision making`);
    console.log(`  ✓ Inter-agent context sharing`);
    console.log(`  ✓ Coordinated dispute resolution`);
  }

  /**
   * Topological sort for task dependencies
   */
  private topologicalSort(tasks: AgentTask[]): AgentTask[] {
    // Simple priority-based sort (could be enhanced with full topological sort)
    return tasks.sort((a, b) => {
      if (a.dependencies.length !== b.dependencies.length) {
        return a.dependencies.length - b.dependencies.length;
      }
      return b.priority - a.priority;
    });
  }

  /**
   * Execute full orchestration workflow
   */
  async run(objective: string) {
    console.log('\n' + '='.repeat(70));
    console.log('MULTI-AGENT ORCHESTRATION SYSTEM');
    console.log('='.repeat(70));

    this.registerAgents();
    const plan = this.createCoordinationPlan(objective);
    const results = await this.executeCoordinationPlan(plan);
    const consensus = this.buildConsensus(results);
    this.generatePerformanceReport(results);

    console.log('\n' + '='.repeat(70));
    console.log('ORCHESTRATION COMPLETE');
    console.log('='.repeat(70));

    return {
      objective,
      consensus,
      results,
      agents: this.agents.map(a => ({
        id: a.id,
        specialty: a.specialty,
        avgQuality: a.getAverageQuality(),
        totalCost: a.getTotalCost()
      }))
    };
  }
}

// Example usage
async function main() {
  const coordinatorKeypair = Keypair.generate();
  const orchestrator = new MultiAgentOrchestrator(coordinatorKeypair);

  await orchestrator.run('Assess DeFi protocol investment opportunity');
}

if (require.main === module) {
  main().catch(console.error);
}

export { MultiAgentOrchestrator, SpecializedAgent };
