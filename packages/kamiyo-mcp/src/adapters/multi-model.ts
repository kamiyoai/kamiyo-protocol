export interface LLMAdapter {
  name: string;
  provider: 'anthropic' | 'openai' | 'local';
  model: string;
  maxTokens: number;
  costPerToken: number;
}

export interface ModelResponse {
  content: string;
  tokensUsed: number;
  cost: number;
  latency: number;
  model: string;
}

export class MultiModelRouter {
  private adapters: Map<string, LLMAdapter> = new Map();
  private requestCount: Map<string, number> = new Map();

  constructor() {
    this.registerDefaultAdapters();
  }

  private registerDefaultAdapters(): void {
    this.adapters.set('claude-3-opus', {
      name: 'claude-3-opus',
      provider: 'anthropic',
      model: 'claude-3-opus-20240229',
      maxTokens: 200000,
      costPerToken: 0.000015,
    });

    this.adapters.set('claude-3-sonnet', {
      name: 'claude-3-sonnet',
      provider: 'anthropic',
      model: 'claude-3-sonnet-20240229',
      maxTokens: 200000,
      costPerToken: 0.000003,
    });

    this.adapters.set('gpt-4', {
      name: 'gpt-4',
      provider: 'openai',
      model: 'gpt-4',
      maxTokens: 128000,
      costPerToken: 0.00003,
    });

    this.adapters.set('llama-3-70b', {
      name: 'llama-3-70b',
      provider: 'local',
      model: 'llama-3-70b',
      maxTokens: 8192,
      costPerToken: 0.0,
    });
  }

  selectOptimalModel(
    taskType: 'quality_assessment' | 'dispute_analysis' | 'reputation_scoring' | 'general',
    contextLength: number,
    budget: number
  ): LLMAdapter {
    const candidates = Array.from(this.adapters.values()).filter(
      (adapter) => adapter.maxTokens >= contextLength && adapter.costPerToken * contextLength <= budget
    );

    if (candidates.length === 0) {
      return this.adapters.get('claude-3-sonnet')!;
    }

    switch (taskType) {
      case 'quality_assessment':
        return this.selectByAccuracy(candidates);
      case 'dispute_analysis':
        return this.selectByReasoning(candidates);
      case 'reputation_scoring':
        return this.selectBySpeed(candidates);
      default:
        return this.selectByCost(candidates);
    }
  }

  private selectByAccuracy(candidates: LLMAdapter[]): LLMAdapter {
    const accuracyRanking = ['claude-3-opus', 'gpt-4', 'claude-3-sonnet', 'llama-3-70b'];
    for (const model of accuracyRanking) {
      const adapter = candidates.find((c) => c.name === model);
      if (adapter) return adapter;
    }
    return candidates[0];
  }

  private selectByReasoning(candidates: LLMAdapter[]): LLMAdapter {
    const reasoningRanking = ['claude-3-opus', 'gpt-4', 'claude-3-sonnet', 'llama-3-70b'];
    for (const model of reasoningRanking) {
      const adapter = candidates.find((c) => c.name === model);
      if (adapter) return adapter;
    }
    return candidates[0];
  }

  private selectBySpeed(candidates: LLMAdapter[]): LLMAdapter {
    const speedRanking = ['claude-3-sonnet', 'llama-3-70b', 'gpt-4', 'claude-3-opus'];
    for (const model of speedRanking) {
      const adapter = candidates.find((c) => c.name === model);
      if (adapter) return adapter;
    }
    return candidates[0];
  }

  private selectByCost(candidates: LLMAdapter[]): LLMAdapter {
    return candidates.reduce((cheapest, current) =>
      current.costPerToken < cheapest.costPerToken ? current : cheapest
    );
  }

  async invokeModel(
    adapter: LLMAdapter,
    prompt: string,
    systemPrompt?: string
  ): Promise<ModelResponse> {
    const startTime = Date.now();

    let content: string;
    switch (adapter.provider) {
      case 'anthropic':
        content = await this.invokeAnthropic(adapter, prompt, systemPrompt);
        break;
      case 'openai':
        content = await this.invokeOpenAI(adapter, prompt, systemPrompt);
        break;
      case 'local':
        content = await this.invokeLocal(adapter, prompt, systemPrompt);
        break;
    }

    const latency = Date.now() - startTime;
    const tokensUsed = this.estimateTokens(prompt + content);
    const cost = tokensUsed * adapter.costPerToken;

    this.requestCount.set(adapter.name, (this.requestCount.get(adapter.name) || 0) + 1);

    return {
      content,
      tokensUsed,
      cost,
      latency,
      model: adapter.model,
    };
  }

  private async invokeAnthropic(
    adapter: LLMAdapter,
    prompt: string,
    systemPrompt?: string
  ): Promise<string> {
    return `[Anthropic ${adapter.model}] Analysis: ${prompt.slice(0, 100)}... [simulated response]`;
  }

  private async invokeOpenAI(
    adapter: LLMAdapter,
    prompt: string,
    systemPrompt?: string
  ): Promise<string> {
    return `[OpenAI ${adapter.model}] Analysis: ${prompt.slice(0, 100)}... [simulated response]`;
  }

  private async invokeLocal(
    adapter: LLMAdapter,
    prompt: string,
    systemPrompt?: string
  ): Promise<string> {
    return `[Local ${adapter.model}] Analysis: ${prompt.slice(0, 100)}... [simulated response]`;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  async assessQualityWithEnsemble(
    apiResponse: any,
    expectedFields: string[]
  ): Promise<{
    averageScore: number;
    confidence: number;
    models: string[];
  }> {
    const models = ['claude-3-sonnet', 'gpt-4', 'llama-3-70b'];
    const scores: number[] = [];
    const usedModels: string[] = [];

    for (const modelName of models) {
      const adapter = this.adapters.get(modelName);
      if (!adapter) continue;

      const prompt = `Assess API response quality. Expected fields: ${expectedFields.join(', ')}. Response: ${JSON.stringify(apiResponse).slice(0, 500)}. Score 0-100.`;

      try {
        const response = await this.invokeModel(adapter, prompt);
        const score = this.extractScoreFromResponse(response.content);
        scores.push(score);
        usedModels.push(modelName);
      } catch (error) {
        continue;
      }
    }

    const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = this.calculateVariance(scores);
    const confidence = Math.max(0, 1 - variance / 100);

    return {
      averageScore,
      confidence,
      models: usedModels,
    };
  }

  private extractScoreFromResponse(content: string): number {
    const match = content.match(/\b(\d{1,3})\b/);
    return match ? Math.min(100, Math.max(0, parseInt(match[1]))) : 50;
  }

  private calculateVariance(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  }

  getUsageStatistics(): {
    modelName: string;
    requests: number;
    estimatedCost: number;
  }[] {
    return Array.from(this.adapters.values()).map((adapter) => ({
      modelName: adapter.name,
      requests: this.requestCount.get(adapter.name) || 0,
      estimatedCost: (this.requestCount.get(adapter.name) || 0) * adapter.costPerToken * 1000,
    }));
  }

  registerCustomAdapter(adapter: LLMAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  switchModel(from: string, to: string, reason: string): void {
    console.log(`Switching model: ${from} → ${to} (${reason})`);
  }

  estimateCost(modelName: string, tokens: number): number {
    const adapter = this.adapters.get(modelName);
    return adapter ? adapter.costPerToken * tokens : 0;
  }
}
