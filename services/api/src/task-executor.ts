import Anthropic from '@anthropic-ai/sdk';
import type { Tool, MessageParam, ContentBlock } from '@anthropic-ai/sdk/resources/messages';
import type { TaskInput, TaskResult } from '@kamiyo/swarm-agents';
import { createKamiyoExtension } from '@kamiyo/daydreams';

export interface TaskExecutorConfig {
  anthropicApiKey: string;
  solanaRpcUrl?: string;
  walletPrivateKey?: string;
}

type TaskType = 'research' | 'market_analysis' | 'wallet_lookup' | 'general';

// $3/MTok input, $15/MTok output for sonnet
const INPUT_COST_PER_TOKEN = 3 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 15 / 1_000_000;
const MAX_TOOL_ROUNDS = 5;

const SYSTEM_PROMPTS: Record<TaskType, string> = {
  research: `You are a research analyst with access to Kamiyo protocol tools.
Use kamiyo.consumeAPI to query paid data APIs when needed.
Use kamiyo.discoverAPIs to find available data sources.
Provide concise, factual analysis. No filler.`,

  market_analysis: `You are a crypto market analyst with access to Kamiyo protocol tools.
Use kamiyo.consumeAPI to fetch market data from paid endpoints.
Use kamiyo.checkBalance to inspect wallet holdings.
Cover: price action, on-chain metrics, sentiment, risk factors. Be direct.`,

  wallet_lookup: `You are a blockchain analyst with access to Kamiyo protocol tools.
Use kamiyo.checkBalance to look up wallet balances.
Use kamiyo.consumeAPI to query chain analytics APIs.
Report: holdings, notable transactions, protocol interactions, risk indicators.`,

  general: `You are a task execution agent with access to Kamiyo protocol tools.
Use the available tools when they help complete the task.
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

  // Initialize Daydreams extension with Kamiyo actions
  const kamiyoExt = createKamiyoExtension({
    rpcUrl: config.solanaRpcUrl || process.env.SOLANA_RPC_URL,
    privateKey: config.walletPrivateKey || process.env.SWARM_AGENT_WALLET_KEY,
    network: 'mainnet',
  });

  const kamiyoActions = kamiyoExt.getActions();

  // Convert Kamiyo actions to Claude tool format
  const tools: Tool[] = kamiyoActions.map((action) => ({
    name: action.name.replace(/\./g, '_'),
    description: action.description,
    input_schema: action.schema as Tool['input_schema'],
  }));

  // Map tool names back to action handlers
  const actionMap = new Map(
    kamiyoActions.map((a) => [a.name.replace(/\./g, '_'), a.handler])
  );

  return async function executeTask(input: TaskInput): Promise<TaskResult> {
    const taskType = inferTaskType(input.description);
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    try {
      // Initialize extension (fetches wallet balance, etc.)
      await kamiyoExt.initialize();

      const messages: MessageParam[] = [{ role: 'user', content: input.description }];

      // Agentic tool-use loop
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2048,
          system: SYSTEM_PROMPTS[taskType],
          tools,
          messages,
        });

        totalInputTokens += response.usage.input_tokens;
        totalOutputTokens += response.usage.output_tokens;

        // If no tool use, extract final text and return
        if (response.stop_reason !== 'tool_use') {
          const output = response.content
            .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
            .map((b) => b.text)
            .join('\n');

          const cost = estimateCost({ input_tokens: totalInputTokens, output_tokens: totalOutputTokens });

          return {
            taskId: input.taskId,
            status: 'completed',
            output: { taskType, result: output, tokens: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens } },
            amountDrawn: Math.min(cost, input.budget),
          };
        }

        // Process tool calls
        messages.push({ role: 'assistant', content: response.content });

        const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = [];

        for (const block of response.content) {
          if (block.type !== 'tool_use') continue;

          const handler = actionMap.get(block.name);
          let result: unknown;

          if (handler) {
            try {
              result = await handler(block.input, undefined as never);
            } catch (err) {
              result = { error: err instanceof Error ? err.message : 'Action failed' };
            }
          } else {
            result = { error: `Unknown tool: ${block.name}` };
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        }

        messages.push({ role: 'user', content: toolResults });
      }

      // Hit max rounds — return what we have
      const cost = estimateCost({ input_tokens: totalInputTokens, output_tokens: totalOutputTokens });
      return {
        taskId: input.taskId,
        status: 'completed',
        output: { taskType, result: 'Task completed (max tool rounds reached)', tokens: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens } },
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
