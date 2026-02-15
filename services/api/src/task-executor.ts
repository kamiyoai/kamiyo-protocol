import Anthropic from '@anthropic-ai/sdk';
import type { Tool, MessageParam, ContentBlock, Message } from '@anthropic-ai/sdk/resources/messages';
import type { TaskInput, TaskResult } from '@kamiyo/swarm-agents';
import { createKamiyoExtension } from '@kamiyo/daydreams';

export interface TaskExecutorConfig {
  anthropicApiKey: string;
  solanaRpcUrl?: string;
  /** Env var name for wallet key (default: SWARM_AGENT_WALLET_KEY) */
  privateKeyEnvVar?: string;
}

type TaskType = 'research' | 'market_analysis' | 'wallet_lookup' | 'general';

// $3/MTok input, $15/MTok output for sonnet
const INPUT_COST_PER_TOKEN = 3 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 15 / 1_000_000;
const MAX_TOOL_ROUNDS = 5;
const MAX_CONCURRENT_TASKS = 10;
const MAX_COST_PER_TASK = 1.0; // $1 hard cap per task regardless of budget
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const MAX_TASKS_PER_AGENT_PER_WINDOW = 5;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

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

  // Concurrency tracking
  let activeTasks = 0;
  const agentTaskTimestamps = new Map<string, number[]>();

  function checkRateLimit(agentId: string): void {
    const now = Date.now();
    const timestamps = agentTaskTimestamps.get(agentId) || [];
    const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length >= MAX_TASKS_PER_AGENT_PER_WINDOW) {
      throw new Error(`Agent ${agentId} rate limited: max ${MAX_TASKS_PER_AGENT_PER_WINDOW} tasks per minute`);
    }
    recent.push(now);
    agentTaskTimestamps.set(agentId, recent);
  }

  async function callWithRetry(params: Omit<Parameters<typeof client.messages.create>[0], 'stream'>): Promise<Message> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await client.messages.create({ ...params, stream: false }) as Message;
      } catch (err: unknown) {
        const isRetryable = err instanceof Error && (
          'status' in err && ((err as { status: number }).status === 429 || (err as { status: number }).status >= 500)
        );
        if (!isRetryable || attempt === MAX_RETRIES) throw err;
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt) + Math.random() * 500;
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
    throw new Error('Exhausted retries'); // unreachable
  }

  // Create per-task extension instance to prevent shared state corruption
  function createExtension() {
    return createKamiyoExtension({
      rpcUrl: config.solanaRpcUrl || process.env.SOLANA_RPC_URL,
      privateKeyEnvVar: config.privateKeyEnvVar || 'SWARM_AGENT_WALLET_KEY',
      network: (process.env.NODE_ENV === 'production' ? 'mainnet' : 'devnet') as 'mainnet' | 'devnet',
    });
  }

  return async function executeTask(input: TaskInput): Promise<TaskResult> {
    // Concurrency gate
    if (activeTasks >= MAX_CONCURRENT_TASKS) {
      return {
        taskId: input.taskId,
        status: 'failed',
        error: 'Too many concurrent tasks. Try again later.',
      };
    }

    // Per-agent rate limit
    try {
      const meta = input.metadata as Record<string, unknown> | undefined;
      const agentId =
        (meta && typeof meta.agentId === 'string' && meta.agentId.trim()) ? meta.agentId.trim()
          : (meta && typeof meta.memberId === 'string' && meta.memberId.trim()) ? meta.memberId.trim()
            : 'unknown';
      checkRateLimit(`${input.teamId}:${agentId}`);
    } catch (err) {
      return {
        taskId: input.taskId,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Rate limited',
      };
    }

    activeTasks++;
    const taskType = inferTaskType(input.description);
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // Per-task extension instance (isolated state)
    const kamiyoExt = createExtension();
    const kamiyoActions = kamiyoExt.getActions();
    const tools: Tool[] = kamiyoActions.map((action) => ({
      name: action.name.replace(/\./g, '_'),
      description: action.description,
      input_schema: action.schema as Tool['input_schema'],
    }));
    const actionMap = new Map(
      kamiyoActions.map((a) => [a.name.replace(/\./g, '_'), a.handler])
    );

    try {
      // Initialize extension (fetches wallet balance, etc.)
      await kamiyoExt.initialize();

      const messages: MessageParam[] = [{ role: 'user', content: input.description }];

      const effectiveBudget = Math.min(input.budget, MAX_COST_PER_TASK);

      // Agentic tool-use loop
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        // Cost cap: abort if already over budget
        const runningCost = estimateCost({ input_tokens: totalInputTokens, output_tokens: totalOutputTokens });
        if (runningCost >= effectiveBudget) {
          return {
            taskId: input.taskId,
            status: 'completed',
            output: { taskType, result: 'Task terminated: cost limit reached', tokens: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens } },
            amountDrawn: runningCost,
          };
        }

        const response = await callWithRetry({
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
            amountDrawn: Math.min(cost, effectiveBudget),
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

          let content = JSON.stringify(result);
          // Truncate oversized tool results to prevent token explosion
          if (content.length > 50_000) {
            content = content.slice(0, 50_000) + '... [truncated]';
          }
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content,
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
        amountDrawn: Math.min(cost, effectiveBudget),
      };
    } catch (err) {
      return {
        taskId: input.taskId,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Task execution failed',
      };
    } finally {
      activeTasks--;
    }
  };
}
