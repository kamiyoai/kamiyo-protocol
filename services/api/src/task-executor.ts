import Anthropic from '@anthropic-ai/sdk';
import type {
  Tool,
  MessageParam,
  ContentBlock,
  Message,
} from '@anthropic-ai/sdk/resources/messages';
import { createRequire } from 'module';
import OpenAI from 'openai';
import './variants/bootstrap';
import { maybeRouteVariant, toVariantDecisionMeta } from '@kamiyo/selfimprove';

type TaskInput = {
  taskId: string;
  description: string;
  budget: number;
  teamId: string;
  executionMode?: 'execute' | 'readonly';
  allowedTools?: string[];
  metadata?: Record<string, unknown>;
};

type TaskResult = {
  taskId: string;
  status: 'completed' | 'failed' | 'rejected';
  output?: unknown;
  amountDrawn?: number;
  error?: string;
  riskFlags?: string[];
  variantDecision?: {
    variantId: string;
    tournamentId: string;
    decisionId: string;
    strategy: 'thompson' | 'promoted' | 'fallback';
  };
};

export interface TaskExecutorConfig {
  anthropicApiKey?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  openclawApiKey?: string;
  openclawBaseUrl?: string;
  openclawModel?: string;
  nanoclawApiKey?: string;
  nanoclawBaseUrl?: string;
  nanoclawModel?: string;
  ironclawApiKey?: string;
  ironclawBaseUrl?: string;
  ironclawModel?: string;
  solanaRpcUrl?: string;
  /** Env var name for wallet key (default: SWARM_AGENT_WALLET_KEY) */
  privateKeyEnvVar?: string;
}

type TaskType = 'research' | 'market_analysis' | 'wallet_lookup' | 'general';
type OpenAICompatibleProvider = 'openclaw' | 'nanoclaw' | 'ironclaw' | 'openai';

type OpenAIProviderConfig = {
  provider: OpenAICompatibleProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
};

type OpenAIProviderRuntime = {
  provider: OpenAICompatibleProvider;
  model: string;
  client: OpenAI;
};

type ExtensionAction = {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  handler: (input: unknown, context: never) => Promise<unknown> | unknown;
};

type KamiyoExtensionLike = {
  initialize(): Promise<void>;
  getActions(): ExtensionAction[];
};

const requireFromHere = createRequire(__filename);
let createKamiyoExtensionOverride:
  | ((config?: Record<string, unknown>) => KamiyoExtensionLike)
  | null = null;

// $3/MTok input, $15/MTok output for sonnet
const ANTHROPIC_INPUT_COST_PER_TOKEN = 3 / 1_000_000;
const ANTHROPIC_OUTPUT_COST_PER_TOKEN = 15 / 1_000_000;
// Defaulting to GPT-4o mini pricing (adjust if model changes)
const OPENAI_INPUT_COST_PER_TOKEN = 0.15 / 1_000_000;
const OPENAI_OUTPUT_COST_PER_TOKEN = 0.6 / 1_000_000;
const MAX_TOOL_ROUNDS = 5;
const MAX_CONCURRENT_TASKS = 10;
const MAX_COST_PER_TASK = 1.0; // $1 hard cap per task regardless of budget
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const MAX_TASKS_PER_AGENT_PER_WINDOW = 5;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const OPENCLAW_DEFAULT_MODEL = 'openclaw:main';
const NANOCLAW_DEFAULT_MODEL = 'nanoclaw:main';
const IRONCLAW_DEFAULT_MODEL = 'ironclaw:main';
const OPENAI_DEFAULT_MODEL = 'gpt-4o-mini';

export const TASK_EXECUTOR_UNAVAILABLE_REASON =
  'Task execution not available (missing LLM provider credentials). Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or one of OPENCLAW_API_KEY+OPENCLAW_BASE_URL, NANOCLAW_API_KEY+NANOCLAW_BASE_URL, IRONCLAW_API_KEY+IRONCLAW_BASE_URL.';

export const READONLY_TASK_EXECUTOR_ALLOWED_TOOLS = [
  'kamiyo_discoverAPIs',
  'kamiyo_checkBalance',
  'kamiyo_getPaymentHistory',
  'kamiyo_getQualityStats',
  'kamiyo_generate_commitment',
  'kamiyo_prove_reputation',
  'kamiyo_verify_proof',
  'kamiyo_get_reputation_tier',
  'kamiyo_can_prove_tier',
  'kamiyo_get_verified_peers',
] as const;

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
  if (
    lower.includes('wallet') ||
    lower.includes('address') ||
    /[1-9A-HJ-NP-Za-km-z]{32,44}/.test(description)
  ) {
    return 'wallet_lookup';
  }
  if (
    lower.includes('market') ||
    lower.includes('token') ||
    lower.includes('price') ||
    lower.includes('chart')
  ) {
    return 'market_analysis';
  }
  if (
    lower.includes('research') ||
    lower.includes('analyze') ||
    lower.includes('investigate') ||
    lower.includes('summarize')
  ) {
    return 'research';
  }
  return 'general';
}

function estimateAnthropicCost(usage: { input_tokens: number; output_tokens: number }): number {
  return (
    usage.input_tokens * ANTHROPIC_INPUT_COST_PER_TOKEN +
    usage.output_tokens * ANTHROPIC_OUTPUT_COST_PER_TOKEN
  );
}

function estimateOpenAICost(usage: { input_tokens: number; output_tokens: number }): number {
  return (
    usage.input_tokens * OPENAI_INPUT_COST_PER_TOKEN +
    usage.output_tokens * OPENAI_OUTPUT_COST_PER_TOKEN
  );
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function clampJsonText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, Math.max(0, maxLen - 16)) + '... [truncated]';
}

function nonEmpty(value?: string): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeToolName(name: string): string {
  return name.replace(/\./g, '_');
}

function toRiskFlags(flags: Set<string>): string[] | undefined {
  return flags.size > 0 ? Array.from(flags).sort() : undefined;
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/v1')) return trimmed;
  return `${trimmed}/v1`;
}

function loadCreateKamiyoExtension(): (config?: Record<string, unknown>) => KamiyoExtensionLike {
  if (createKamiyoExtensionOverride) {
    return createKamiyoExtensionOverride;
  }
  try {
    const mod = requireFromHere('@kamiyo/daydreams') as {
      createKamiyoExtension: (config?: Record<string, unknown>) => KamiyoExtensionLike;
    };
    return mod.createKamiyoExtension;
  } catch {
    const mod = requireFromHere('../../../packages/kamiyo-daydreams/src/index.ts') as {
      createKamiyoExtension: (config?: Record<string, unknown>) => KamiyoExtensionLike;
    };
    return mod.createKamiyoExtension;
  }
}

export function __setCreateKamiyoExtensionForTests(
  factory: ((config?: Record<string, unknown>) => KamiyoExtensionLike) | null
): void {
  createKamiyoExtensionOverride = factory;
}

function buildOpenAIProviderConfigs(config: TaskExecutorConfig): OpenAIProviderConfig[] {
  const providers: OpenAIProviderConfig[] = [];

  const openclawApiKey = nonEmpty(config.openclawApiKey) ?? nonEmpty(process.env.OPENCLAW_API_KEY);
  const openclawBaseUrl =
    nonEmpty(config.openclawBaseUrl) ?? nonEmpty(process.env.OPENCLAW_BASE_URL);
  if (openclawApiKey && openclawBaseUrl) {
    providers.push({
      provider: 'openclaw',
      apiKey: openclawApiKey,
      baseUrl: normalizeBaseUrl(openclawBaseUrl),
      model:
        nonEmpty(config.openclawModel) ??
        nonEmpty(process.env.SWARM_OPENCLAW_MODEL) ??
        nonEmpty(process.env.OPENCLAW_MODEL) ??
        OPENCLAW_DEFAULT_MODEL,
    });
  }

  const nanoclawApiKey = nonEmpty(config.nanoclawApiKey) ?? nonEmpty(process.env.NANOCLAW_API_KEY);
  const nanoclawBaseUrl =
    nonEmpty(config.nanoclawBaseUrl) ?? nonEmpty(process.env.NANOCLAW_BASE_URL);
  if (nanoclawApiKey && nanoclawBaseUrl) {
    providers.push({
      provider: 'nanoclaw',
      apiKey: nanoclawApiKey,
      baseUrl: normalizeBaseUrl(nanoclawBaseUrl),
      model:
        nonEmpty(config.nanoclawModel) ??
        nonEmpty(process.env.SWARM_NANOCLAW_MODEL) ??
        nonEmpty(process.env.NANOCLAW_MODEL) ??
        NANOCLAW_DEFAULT_MODEL,
    });
  }

  const ironclawApiKey = nonEmpty(config.ironclawApiKey) ?? nonEmpty(process.env.IRONCLAW_API_KEY);
  const ironclawBaseUrl =
    nonEmpty(config.ironclawBaseUrl) ?? nonEmpty(process.env.IRONCLAW_BASE_URL);
  if (ironclawApiKey && ironclawBaseUrl) {
    providers.push({
      provider: 'ironclaw',
      apiKey: ironclawApiKey,
      baseUrl: normalizeBaseUrl(ironclawBaseUrl),
      model:
        nonEmpty(config.ironclawModel) ??
        nonEmpty(process.env.SWARM_IRONCLAW_MODEL) ??
        nonEmpty(process.env.IRONCLAW_MODEL) ??
        IRONCLAW_DEFAULT_MODEL,
    });
  }

  const openaiApiKey = nonEmpty(config.openaiApiKey) ?? nonEmpty(process.env.OPENAI_API_KEY);
  if (openaiApiKey) {
    providers.push({
      provider: 'openai',
      apiKey: openaiApiKey,
      model:
        nonEmpty(config.openaiModel) ??
        nonEmpty(process.env.SWARM_OPENAI_MODEL) ??
        OPENAI_DEFAULT_MODEL,
    });
  }

  return providers;
}

function instantiateOpenAIProvider(config: OpenAIProviderConfig): OpenAIProviderRuntime {
  const client = config.baseUrl
    ? new OpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl })
    : new OpenAI({ apiKey: config.apiKey });

  return {
    provider: config.provider,
    model: config.model,
    client,
  };
}

function formatProviderError(provider: OpenAICompatibleProvider, err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const compact = message.replace(/\s+/g, ' ').trim().slice(0, 180);
  return `${provider}:${compact}`;
}

export function hasTaskExecutorProviders(config: TaskExecutorConfig = {}): boolean {
  const anthropicKey = nonEmpty(config.anthropicApiKey) ?? nonEmpty(process.env.ANTHROPIC_API_KEY);
  if (anthropicKey) return true;
  return buildOpenAIProviderConfigs(config).length > 0;
}

export function createTaskExecutor(config: TaskExecutorConfig) {
  const anthropicKey = nonEmpty(config.anthropicApiKey) ?? nonEmpty(process.env.ANTHROPIC_API_KEY);
  const anthropic = anthropicKey ? new Anthropic({ apiKey: anthropicKey }) : null;
  const openaiProviders = buildOpenAIProviderConfigs(config).map(instantiateOpenAIProvider);

  if (!anthropic && openaiProviders.length === 0) {
    throw new Error(TASK_EXECUTOR_UNAVAILABLE_REASON);
  }

  // Concurrency tracking
  let activeTasks = 0;
  const agentTaskTimestamps = new Map<string, number[]>();

  function checkRateLimit(agentId: string): void {
    const now = Date.now();
    const timestamps = agentTaskTimestamps.get(agentId) || [];
    const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length >= MAX_TASKS_PER_AGENT_PER_WINDOW) {
      throw new Error(
        `Agent ${agentId} rate limited: max ${MAX_TASKS_PER_AGENT_PER_WINDOW} tasks per minute`
      );
    }
    recent.push(now);
    agentTaskTimestamps.set(agentId, recent);
  }

  async function callAnthropicWithRetry(
    params: Omit<Parameters<NonNullable<typeof anthropic>['messages']['create']>[0], 'stream'>
  ): Promise<Message> {
    if (!anthropic) throw new Error('Anthropic client not configured');
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return (await anthropic.messages.create({ ...params, stream: false })) as Message;
      } catch (err: unknown) {
        const isRetryable =
          err instanceof Error &&
          'status' in err &&
          ((err as { status: number }).status === 429 || (err as { status: number }).status >= 500);
        if (!isRetryable || attempt === MAX_RETRIES) throw err;
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt) + Math.random() * 500;
        await new Promise(r => setTimeout(r, backoff));
      }
    }
    throw new Error('Exhausted retries'); // unreachable
  }

  async function callOpenAIWithRetry(
    client: OpenAI,
    params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await client.chat.completions.create(params);
      } catch (err: unknown) {
        const status =
          err && typeof err === 'object' && 'status' in err
            ? (err as { status?: unknown }).status
            : undefined;
        const code = typeof status === 'number' ? status : undefined;
        const isRetryable = code === 429 || (code !== undefined && code >= 500);
        if (!isRetryable || attempt === MAX_RETRIES) throw err;
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt) + Math.random() * 500;
        await new Promise(r => setTimeout(r, backoff));
      }
    }
    throw new Error('Exhausted retries'); // unreachable
  }

  // Create per-task extension instance to prevent shared state corruption
  function createExtension() {
    const createKamiyoExtension = loadCreateKamiyoExtension();
    return createKamiyoExtension({
      rpcUrl: config.solanaRpcUrl || process.env.SOLANA_RPC_URL,
      privateKeyEnvVar: config.privateKeyEnvVar || 'SWARM_AGENT_WALLET_KEY',
      network: (process.env.NODE_ENV === 'production' ? 'mainnet' : 'devnet') as
        | 'mainnet'
        | 'devnet',
    });
  }

  const anthropicModel = nonEmpty(process.env.SWARM_ANTHROPIC_MODEL) ?? 'claude-sonnet-4-20250514';

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
        meta && typeof meta.agentId === 'string' && meta.agentId.trim()
          ? meta.agentId.trim()
          : meta && typeof meta.memberId === 'string' && meta.memberId.trim()
            ? meta.memberId.trim()
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
    const variantDecision = maybeRouteVariant(taskType);
    const stamp = <T extends TaskResult>(result: T): T =>
      variantDecision
        ? { ...result, variantDecision: toVariantDecisionMeta(variantDecision) }
        : result;

    // Per-task extension instance (isolated state)
    const kamiyoExt = createExtension();
    const allActions = kamiyoExt.getActions() as ExtensionAction[];
    const knownActionNames = new Set(allActions.map(action => normalizeToolName(action.name)));
    const visibleToolNames = new Set(
      (input.executionMode === 'readonly'
        ? input.allowedTools?.length
          ? input.allowedTools
          : Array.from(READONLY_TASK_EXECUTOR_ALLOWED_TOOLS)
        : (input.allowedTools ?? [])
      ).map(name => normalizeToolName(name))
    );
    const kamiyoActions =
      visibleToolNames.size > 0
        ? allActions.filter(action => visibleToolNames.has(normalizeToolName(action.name)))
        : allActions;
    const toolsAnthropic: Tool[] = kamiyoActions.map(action => ({
      name: normalizeToolName(action.name),
      description: action.description,
      input_schema: action.schema as Tool['input_schema'],
    }));
    const toolsOpenAI: OpenAI.Chat.Completions.ChatCompletionTool[] = kamiyoActions.map(action => ({
      type: 'function',
      function: {
        name: normalizeToolName(action.name),
        description: action.description,
        parameters: action.schema as Record<string, unknown>,
      },
    }));
    const actionMap = new Map(
      kamiyoActions.map((action): [string, ExtensionAction['handler']] => [
        normalizeToolName(action.name),
        action.handler,
      ])
    );

    try {
      // Initialize extension (fetches wallet balance, etc.)
      await kamiyoExt.initialize();

      const effectiveBudget = Math.min(input.budget, MAX_COST_PER_TASK);

      const runAnthropic = async (): Promise<TaskResult> => {
        if (!anthropic) throw new Error('Anthropic client not configured');

        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        const riskFlags = new Set<string>();
        const messages: MessageParam[] = [{ role: 'user', content: input.description }];
        const modelForRun = variantDecision?.variant.genome.modelId ?? anthropicModel;
        const systemForRun = variantDecision?.variant.genome.promptTemplate?.trim()
          ? variantDecision.variant.genome.promptTemplate
          : SYSTEM_PROMPTS[taskType];

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const runningCost = estimateAnthropicCost({
            input_tokens: totalInputTokens,
            output_tokens: totalOutputTokens,
          });
          if (runningCost >= effectiveBudget) {
            return {
              taskId: input.taskId,
              status: 'completed',
              output: {
                taskType,
                result: 'Task terminated: cost limit reached',
                tokens: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens },
              },
              amountDrawn: runningCost,
              riskFlags: toRiskFlags(riskFlags),
            };
          }

          const response = await callAnthropicWithRetry({
            model: modelForRun,
            max_tokens: 2048,
            system: systemForRun,
            tools: toolsAnthropic,
            messages,
          });

          totalInputTokens += response.usage.input_tokens;
          totalOutputTokens += response.usage.output_tokens;

          if (response.stop_reason !== 'tool_use') {
            const output = response.content
              .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
              .map(b => b.text)
              .join('\n');

            const cost = estimateAnthropicCost({
              input_tokens: totalInputTokens,
              output_tokens: totalOutputTokens,
            });

            return {
              taskId: input.taskId,
              status: 'completed',
              output: {
                taskType,
                result: output,
                tokens: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens },
              },
              amountDrawn: Math.min(cost, effectiveBudget),
              riskFlags: toRiskFlags(riskFlags),
            };
          }

          messages.push({ role: 'assistant', content: response.content });

          const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> =
            [];

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
            } else if (knownActionNames.has(block.name)) {
              riskFlags.add('mutating_tool_attempt');
              result = {
                error: `Tool not allowed in ${input.executionMode ?? 'execute'} mode`,
                blockedTool: block.name,
              };
            } else {
              result = { error: `Unknown tool: ${block.name}` };
            }

            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: clampJsonText(JSON.stringify(result), 50_000),
            });
          }

          messages.push({ role: 'user', content: toolResults });
        }

        const cost = estimateAnthropicCost({
          input_tokens: totalInputTokens,
          output_tokens: totalOutputTokens,
        });
        return {
          taskId: input.taskId,
          status: 'completed',
          output: {
            taskType,
            result: 'Task completed (max tool rounds reached)',
            tokens: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens },
          },
          amountDrawn: Math.min(cost, effectiveBudget),
          riskFlags: toRiskFlags(riskFlags),
        };
      };

      const runOpenAIProvider = async (provider: OpenAIProviderRuntime): Promise<TaskResult> => {
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        const riskFlags = new Set<string>();

        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          { role: 'system', content: SYSTEM_PROMPTS[taskType] },
          { role: 'user', content: input.description },
        ];

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const runningCost = estimateOpenAICost({
            input_tokens: totalInputTokens,
            output_tokens: totalOutputTokens,
          });
          if (runningCost >= effectiveBudget) {
            return {
              taskId: input.taskId,
              status: 'completed',
              output: {
                taskType,
                result: 'Task terminated: cost limit reached',
                tokens: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens },
              },
              amountDrawn: runningCost,
              riskFlags: toRiskFlags(riskFlags),
            };
          }

          const response = await callOpenAIWithRetry(provider.client, {
            model: provider.model,
            max_tokens: 2048,
            messages,
            tools: toolsOpenAI,
            tool_choice: 'auto',
          });

          totalInputTokens += response.usage?.prompt_tokens ?? 0;
          totalOutputTokens += response.usage?.completion_tokens ?? 0;

          const msg = response.choices[0]?.message;
          const toolCalls = msg?.tool_calls ?? [];
          const text = msg?.content ?? '';

          if (toolCalls.length === 0) {
            const cost = estimateOpenAICost({
              input_tokens: totalInputTokens,
              output_tokens: totalOutputTokens,
            });
            return {
              taskId: input.taskId,
              status: 'completed',
              output: {
                taskType,
                result: text,
                tokens: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens },
              },
              amountDrawn: Math.min(cost, effectiveBudget),
              riskFlags: toRiskFlags(riskFlags),
            };
          }

          messages.push({
            role: 'assistant',
            content: msg?.content ?? '',
            tool_calls: toolCalls,
          } as OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam);

          for (const call of toolCalls) {
            if (call.type !== 'function') {
              messages.push({
                role: 'tool',
                tool_call_id: call.id,
                content: JSON.stringify({ error: `Unsupported tool call type: ${call.type}` }),
              });
              continue;
            }

            const name = call.function.name || '';
            const argsRaw = call.function.arguments || '';
            const parsed = typeof argsRaw === 'string' ? safeJsonParse(argsRaw) : null;

            const handler = actionMap.get(name);
            let result: unknown;

            if (handler) {
              try {
                result = await handler(parsed ?? {}, undefined as never);
              } catch (err) {
                result = { error: err instanceof Error ? err.message : 'Action failed' };
              }
            } else if (knownActionNames.has(name)) {
              riskFlags.add('mutating_tool_attempt');
              result = {
                error: `Tool not allowed in ${input.executionMode ?? 'execute'} mode`,
                blockedTool: name,
              };
            } else {
              result = { error: `Unknown tool: ${name}` };
            }

            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: clampJsonText(JSON.stringify(result), 50_000),
            });
          }
        }

        const cost = estimateOpenAICost({
          input_tokens: totalInputTokens,
          output_tokens: totalOutputTokens,
        });
        return {
          taskId: input.taskId,
          status: 'completed',
          output: {
            taskType,
            result: 'Task completed (max tool rounds reached)',
            tokens: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens },
          },
          amountDrawn: Math.min(cost, effectiveBudget),
          riskFlags: toRiskFlags(riskFlags),
        };
      };

      if (anthropic) {
        try {
          return stamp(await runAnthropic());
        } catch (err) {
          if (openaiProviders.length === 0) throw err;
        }
      }

      const openaiErrors: string[] = [];
      for (const provider of openaiProviders) {
        try {
          return stamp(await runOpenAIProvider(provider));
        } catch (err) {
          openaiErrors.push(formatProviderError(provider.provider, err));
        }
      }

      if (openaiErrors.length > 0) {
        throw new Error(`All OpenAI-compatible providers failed (${openaiErrors.join(' | ')})`);
      }
      throw new Error(TASK_EXECUTOR_UNAVAILABLE_REASON);
    } catch (err) {
      return stamp({
        taskId: input.taskId,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Task execution failed',
      });
    } finally {
      activeTasks--;
    }
  };
}
