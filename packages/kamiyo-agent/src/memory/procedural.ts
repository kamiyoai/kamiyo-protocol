export interface Strategy {
  taskType: string;
  variantId: string;
  promptTemplate: string;
  modelId: string;
  temperature: number;
  maxTokens: number;
  promotedAt: number;
  winRate: number;
}

interface SelfImproveAPI {
  listActiveVariants(agentId: string): Variant[];
}

interface Variant {
  id: string;
  agentId: string;
  taskType: string;
  genome: {
    promptTemplate: string;
    modelId: string;
    temperature: number;
    maxTokens: number;
  };
  status: string;
  stats?: { mean: number; n: number };
}

export class ProceduralMemory {
  private api: SelfImproveAPI | null = null;

  constructor(private agentId: string) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      this.api = require('@kamiyo-org/selfimprove') as SelfImproveAPI;
    } catch {
      // optional peer dep not installed
    }
  }

  getPromotedStrategies(taskType?: string): Strategy[] {
    if (!this.api) return [];
    const variants = this.api.listActiveVariants(this.agentId);
    return variants
      .filter(v => v.status === 'promoted' && (!taskType || v.taskType === taskType))
      .map(v => ({
        taskType: v.taskType,
        variantId: v.id,
        promptTemplate: v.genome.promptTemplate,
        modelId: v.genome.modelId,
        temperature: v.genome.temperature,
        maxTokens: v.genome.maxTokens,
        promotedAt: Date.now(),
        winRate: v.stats?.mean ?? 0,
      }));
  }

  getBestStrategy(taskType: string): Strategy | null {
    const strategies = this.getPromotedStrategies(taskType);
    if (strategies.length === 0) return null;
    return strategies.reduce((best, s) => (s.winRate > best.winRate ? s : best));
  }

  toContext(taskType?: string): string {
    const strategies = this.getPromotedStrategies(taskType);
    if (strategies.length === 0) return '';
    const lines = strategies.map(
      s =>
        `- [${s.taskType}] model=${s.modelId} temp=${s.temperature} winRate=${(s.winRate * 100).toFixed(1)}%`
    );
    return `Proven strategies:\n${lines.join('\n')}`;
  }
}
