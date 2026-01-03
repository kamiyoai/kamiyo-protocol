import { PublicKey } from '@solana/web3.js';
import { X402Program } from '../solana/anchor.js';
import { AgentOrchestrator } from '../agents/orchestrator.js';
import { DisputePredictor } from '../ml/dispute-predictor.js';
import { AgentMemorySystem } from '../agents/memory.js';
import { EconomicDashboard } from '../dashboard/economics.js';

export interface AdvancedOrchestrationParams {
  apiProvider: string;
  amount: number;
  apiEndpoint: string;
  expectedFields: string[];
  agentId?: string;
  enablePrediction?: boolean;
  enableMemory?: boolean;
}

export interface AdvancedOrchestrationResult {
  success: boolean;
  transactionId?: string;
  escrowAddress?: string;
  signature?: string;
  prediction?: {
    probability: number;
    riskLevel: string;
    recommendations: string[];
  };
  qualityScore?: number;
  disputeFiled?: boolean;
  refundAmount?: number;
  agentLearnings?: string[];
  error?: string;
}

export class AdvancedOrchestrationTool {
  private orchestrator: AgentOrchestrator;
  private predictor: DisputePredictor;
  private memory: AgentMemorySystem;
  private dashboard: EconomicDashboard;

  constructor(program: X402Program) {
    this.orchestrator = new AgentOrchestrator(program);
    this.predictor = new DisputePredictor(program);
    this.memory = new AgentMemorySystem();
    this.dashboard = new EconomicDashboard();
  }

  async executeAdvancedWorkflow(
    params: AdvancedOrchestrationParams
  ): Promise<AdvancedOrchestrationResult> {
    try {
      const agentId = params.agentId || `agent_${Date.now()}`;
      const provider = new PublicKey(params.apiProvider);

      let prediction;
      if (params.enablePrediction !== false) {
        prediction = await this.predictor.predictDisputeProbability(
          provider,
          params.amount,
          params.apiEndpoint
        );

        if (prediction.riskLevel === 'critical') {
          return {
            success: false,
            prediction: {
              probability: prediction.probability,
              riskLevel: prediction.riskLevel,
              recommendations: prediction.recommendations,
            },
            error: 'Transaction blocked due to critical risk level',
          };
        }
      }

      if (params.enableMemory !== false) {
        const context = this.memory.getContext(agentId);
        if (context && this.memory.shouldAvoidProvider(agentId, params.apiProvider)) {
          return {
            success: false,
            error: 'Provider on agent avoid list based on past experience',
            agentLearnings: [`Avoided ${params.apiProvider} due to poor past performance`],
          };
        }
      }

      const buyerAgent = {
        id: agentId,
        role: 'buyer' as const,
        capabilities: ['payment', 'quality_assessment'],
        reputation: 85,
      };

      const sellerAgent = {
        id: params.apiProvider,
        role: 'seller' as const,
        capabilities: ['api_provision'],
        reputation: 75,
      };

      this.orchestrator.registerAgent(buyerAgent);
      this.orchestrator.registerAgent(sellerAgent);

      const transaction = await this.orchestrator.proposeTransaction(
        buyerAgent.id,
        sellerAgent.id,
        params.amount,
        params.apiEndpoint
      );

      await this.orchestrator.acceptTransaction(transaction.id, sellerAgent.id);

      const mockResponse = await this.callApiEndpoint(params.apiEndpoint);

      await this.orchestrator.assessQualityAndResolve(
        transaction.id,
        mockResponse,
        params.expectedFields
      );

      const updatedTransaction = this.orchestrator.getTransaction(transaction.id);

      if (!updatedTransaction) {
        throw new Error('Transaction not found after execution');
      }

      if (params.enableMemory !== false) {
        this.memory.recordMemory(agentId, 'transaction', {
          transactionId: transaction.id,
          provider: params.apiProvider,
          quality: updatedTransaction.qualityScore,
          disputed: updatedTransaction.status === 'disputed',
        });
      }

      this.dashboard.updateMetrics(
        { amount: params.amount },
        updatedTransaction.status === 'disputed' ? {} : null,
        updatedTransaction.qualityScore
          ? {
              durationMs: Date.now() - updatedTransaction.createdAt,
              refundPercentage: 100 - (updatedTransaction.qualityScore || 0),
            }
          : null
      );

      await this.predictor.updateProviderHistory(
        provider,
        updatedTransaction.status === 'disputed',
        updatedTransaction.qualityScore || 50
      );

      const agentLearnings: string[] = [];
      if (updatedTransaction.qualityScore && updatedTransaction.qualityScore > 80) {
        agentLearnings.push(`High quality from ${params.apiProvider} - added to preferred list`);
      } else if (updatedTransaction.status === 'disputed') {
        agentLearnings.push(`Poor quality from ${params.apiProvider} - increased scrutiny`);
      }

      return {
        success: true,
        transactionId: transaction.id,
        escrowAddress: updatedTransaction.escrowAddress,
        prediction: prediction
          ? {
              probability: prediction.probability,
              riskLevel: prediction.riskLevel,
              recommendations: prediction.recommendations,
            }
          : undefined,
        qualityScore: updatedTransaction.qualityScore,
        disputeFiled: updatedTransaction.status === 'disputed',
        refundAmount:
          updatedTransaction.status === 'disputed'
            ? params.amount * ((100 - (updatedTransaction.qualityScore || 0)) / 100)
            : undefined,
        agentLearnings: agentLearnings.length > 0 ? agentLearnings : undefined,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Advanced orchestration failed',
      };
    }
  }

  private async callApiEndpoint(endpoint: string): Promise<any> {
    const random = Math.random();

    if (random > 0.7) {
      return {
        data: { temperature: 72, humidity: 65, pressure: 1013 },
        timestamp: new Date().toISOString(),
        status: 'success',
      };
    } else if (random > 0.4) {
      return {
        data: { temperature: 72 },
        timestamp: new Date().toISOString(),
        status: 'partial',
      };
    } else {
      return {
        error: 'API unavailable',
        status: 'error',
      };
    }
  }

  getEconomicReport(): string {
    return this.dashboard.generateReport();
  }

  getAgentProfile(agentId: string): any {
    return this.memory.exportAgentProfile(agentId);
  }

  async analyzeProvider(provider: string): Promise<any> {
    const providerPubkey = new PublicKey(provider);
    const riskAnalysis = await this.predictor.analyzeProviderRisk(providerPubkey);
    return riskAnalysis;
  }
}
