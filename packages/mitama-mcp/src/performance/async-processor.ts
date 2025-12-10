import { PublicKey } from '@solana/web3.js';
import { performance } from 'perf_hooks';

export interface Task<T> {
  id: string;
  execute: () => Promise<T>;
  priority: number;
  timeout: number;
}

export interface ProcessingResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  latency: number;
}

export class AsyncBatchProcessor {
  private readonly maxConcurrent: number;
  private readonly queueSize: number;
  private queue: Task<any>[] = [];
  private activeCount: number = 0;
  private metrics: {
    processed: number;
    failed: number;
    totalLatency: number;
  } = { processed: 0, failed: 0, totalLatency: 0 };

  constructor(maxConcurrent: number = 10, queueSize: number = 1000) {
    this.maxConcurrent = maxConcurrent;
    this.queueSize = queueSize;
  }

  async process<T>(task: Task<T>): Promise<ProcessingResult<T>> {
    if (this.queue.length >= this.queueSize) {
      return {
        success: false,
        error: 'Queue full',
        latency: 0,
      };
    }

    return new Promise((resolve) => {
      this.queue.push({
        ...task,
        execute: async () => {
          const start = performance.now();
          try {
            const result = await Promise.race([
              task.execute(),
              this.timeout<T>(task.timeout),
            ]);

            const latency = performance.now() - start;
            this.metrics.processed++;
            this.metrics.totalLatency += latency;

            resolve({
              success: true,
              data: result,
              latency,
            });
          } catch (error: any) {
            const latency = performance.now() - start;
            this.metrics.failed++;
            this.metrics.totalLatency += latency;

            resolve({
              success: false,
              error: error.message,
              latency,
            });
          } finally {
            this.activeCount--;
            this.processNext();
          }
        },
      });

      this.processNext();
    });
  }

  private processNext(): void {
    if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    this.queue.sort((a, b) => b.priority - a.priority);
    const task = this.queue.shift();

    if (task) {
      this.activeCount++;
      task.execute();
    }
  }

  private timeout<T>(ms: number): Promise<T> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Task timeout')), ms)
    );
  }

  async batchProcess<T>(tasks: Task<T>[]): Promise<ProcessingResult<T>[]> {
    const results = await Promise.all(tasks.map((task) => this.process(task)));
    return results;
  }

  getMetrics(): {
    processed: number;
    failed: number;
    averageLatency: number;
    queueLength: number;
    activeCount: number;
  } {
    return {
      processed: this.metrics.processed,
      failed: this.metrics.failed,
      averageLatency:
        this.metrics.processed > 0
          ? this.metrics.totalLatency / this.metrics.processed
          : 0,
      queueLength: this.queue.length,
      activeCount: this.activeCount,
    };
  }

  clearQueue(): void {
    this.queue = [];
  }
}

export class ParallelEscrowProcessor {
  private processor: AsyncBatchProcessor;

  constructor() {
    this.processor = new AsyncBatchProcessor(20, 5000);
  }

  async processEscrowCreation(requests: Array<{
    provider: PublicKey;
    amount: number;
    apiEndpoint: string;
  }>): Promise<ProcessingResult<{ escrowAddress: string }>[]> {
    const tasks: Task<{ escrowAddress: string }>[] = requests.map((req, i) => ({
      id: `escrow_${i}`,
      execute: async () => {
        await this.simulateBlockchainCall(50);
        return {
          escrowAddress: `escrow_${req.provider.toBase58().slice(0, 8)}_${Date.now()}`,
        };
      },
      priority: req.amount > 0.01 ? 10 : 5,
      timeout: 5000,
    }));

    return await this.processor.batchProcess(tasks);
  }

  async processQualityAssessment(responses: Array<{
    escrowId: string;
    response: any;
    expectedFields: string[];
  }>): Promise<ProcessingResult<{ qualityScore: number }>[]> {
    const tasks: Task<{ qualityScore: number }>[] = responses.map((resp, i) => ({
      id: `quality_${i}`,
      execute: async () => {
        await this.simulateMLInference(30);
        return {
          qualityScore: Math.floor(Math.random() * 40) + 60,
        };
      },
      priority: 8,
      timeout: 3000,
    }));

    return await this.processor.batchProcess(tasks);
  }

  async processDisputeResolution(disputes: Array<{
    escrowId: string;
    qualityScore: number;
    evidence: any;
  }>): Promise<ProcessingResult<{ refundPercentage: number }>[]> {
    const tasks: Task<{ refundPercentage: number }>[] = disputes.map((dispute, i) => ({
      id: `dispute_${i}`,
      execute: async () => {
        await this.simulateOracleVerification(100);
        const refund = Math.max(0, 100 - dispute.qualityScore);
        return { refundPercentage: refund };
      },
      priority: 10,
      timeout: 10000,
    }));

    return await this.processor.batchProcess(tasks);
  }

  private simulateBlockchainCall(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private simulateMLInference(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private simulateOracleVerification(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getPerformanceMetrics(): {
    throughput: number;
    averageLatency: number;
    successRate: number;
  } {
    const metrics = this.processor.getMetrics();
    const total = metrics.processed + metrics.failed;
    const avgLatency = metrics.averageLatency;

    return {
      throughput: total > 0 && avgLatency > 0 ? (metrics.processed / (avgLatency * total / 1000)) : 0,
      averageLatency: avgLatency,
      successRate: total > 0 ? (metrics.processed / total) * 100 : 0,
    };
  }
}

export async function benchmarkParallelProcessing(): Promise<{
  operations: number;
  totalTime: number;
  throughput: number;
  averageLatency: number;
}> {
  const processor = new ParallelEscrowProcessor();
  const operationCount = 100;

  const requests = Array.from({ length: operationCount }, (_, i) => ({
    provider: new PublicKey('11111111111111111111111111111111'),
    amount: 0.001 + Math.random() * 0.01,
    apiEndpoint: `https://api.example.com/endpoint${i}`,
  }));

  const start = performance.now();
  await processor.processEscrowCreation(requests);
  const totalTime = performance.now() - start;

  const metrics = processor.getPerformanceMetrics();

  return {
    operations: operationCount,
    totalTime,
    throughput: (operationCount / totalTime) * 1000,
    averageLatency: metrics.averageLatency,
  };
}
