import Anthropic from '@anthropic-ai/sdk';
import type { TaskInput, TaskResult } from '@kamiyo/swarm-agents';

export interface TaskExecutorConfig {
  anthropicApiKey: string;
}

type TaskType = 'research' | 'market_analysis' | 'wallet_lookup' | 'general';

// $3/MTok input, $15/MTok output for sonnet
const INPUT_COST_PER_TOKEN = 3 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 15 / 1_000_000;

const SYSTEM_PROMPTS: Record<TaskType, string> = {
  research: `You are a research analyst. Provide concise, factual analysis of the given topic.
Focus on key findings, data points, and actionable insights. No filler.`,

  market_analysis: `You are a crypto market analyst. Analyze the given token, project, or market condition.
Cover: price action context, on-chain metrics if relevant, sentiment, and risk factors. Be direct.`,

  wallet_lookup: `You are a blockchain analyst. Analyze the given wallet address or transaction.
Report: holdings summary, notable transactions, protocol interactions, and any risk indicators.`,

  general: `You are a task execution agent. Complete the described task concisely and accurately.
Return structured output when possible.`,
};

function inferTaskType(description: string): TaskType {
  const lower = description.toLowerCase();
  if (lower.includes('wallet') || lower.includes('address') || /[1-9A-HJ-NP-Za-km-z]{32,44}/.test(description)) {
    return 'wallet_lookup';
  }
  if (lower.includes('market') || lower.includes('token') || lower.includes('price') || lower.includes('chart')) {
    return 'market_analysis';
  }
  if (lower.includes('research') || lower.includes('analyze') || lower.includes('investigate') || lower.includes('summarize')) {
    return 'research';
  }
  return 'general';
}

function estimateCost(usage: { input_tokens: number; output_tokens: number }): number {
  return usage.input_tokens * INPUT_COST_PER_TOKEN + usage.output_tokens * OUTPUT_COST_PER_TOKEN;
}

export function createTaskExecutor(config: TaskExecutorConfig) {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  return async function executeTask(input: TaskInput): Promise<TaskResult> {
    const taskType = inferTaskType(input.description);

    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: SYSTEM_PROMPTS[taskType],
        messages: [{ role: 'user', content: input.description }],
      });

      const output = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n');

      const cost = estimateCost(response.usage);

      return {
        taskId: input.taskId,
        status: 'completed',
        output: { taskType, result: output, tokens: response.usage },
        amountDrawn: Math.min(cost, input.budget),
      };
    } catch (err) {
      return {
        taskId: input.taskId,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Task execution failed',
      };
    }
  };
}
