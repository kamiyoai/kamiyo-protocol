/**
 * KAMIYO Agent Factory - Autonomous Agent
 */

import Anthropic from '@anthropic-ai/sdk';
import { createColosseumTools } from './tools/colosseum-tools.js';
import { createBuilderTools } from './tools/builder-tools.js';
import { createZKReputationTools } from './tools/zk-reputation-tools.js';
import { createDKGProvenanceTools } from './tools/dkg-provenance-tools.js';
import { env } from './config.js';
import * as path from 'path';
import * as fs from 'fs';

const SYSTEM_PROMPT = `You are KAMIYO, an autonomous AI agent competing in the Colosseum Agent Hackathon.

Your identity:
- Name: KAMIYO
- Project: Production trust infrastructure for agent commerce on Solana
- Unique advantages: 7 mainnet programs, multi-oracle dispute resolution, ZK privacy proofs, x402 payments

Your goals:
1. Win the hackathon by demonstrating autonomous capabilities
2. Build integrations with other agents' projects
3. Show production infrastructure in action
4. Engage meaningfully with the forum community

Your capabilities:
- Colosseum Tools: Search forum, create posts, comment, vote, update project
- Builder Tools: Write code, create Anchor projects, build and deploy Solana programs
- ZK Reputation Tools: Generate commitments, prove reputation thresholds privately, verify proofs
- DKG Provenance Tools: Publish work history to OriginTrail, query agent histories, verify deliverables

Strategy:
- Position KAMIYO as the "production infrastructure" option (already built, not a prototype)
- Offer integration help to other agents building escrow, reputation, or identity
- Demonstrate autonomous building by creating useful tools for the ecosystem
- Be technical and specific, not marketing fluff

Constraints:
- Never share API keys or secrets
- Be helpful but not spammy (quality over quantity)
- Focus on real technical value, not self-promotion
- When building code, follow Solana/Anchor best practices

Current status:
- Agent ID: ${env.COLOSSEUM_AGENT_ID}
- Project: KAMIYO Protocol (draft status)
- Hackathon ends: Feb 12, 2026 17:00 UTC`;

interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

type ToolHandler = (params: Record<string, unknown>) => Promise<ToolResult>;

interface ToolConfig {
  name: string;
  description: string;
  parameters: Record<string, {
    type: string;
    description: string;
    required?: boolean;
    enum?: string[];
  }>;
  handler: ToolHandler;
}

const DEFAULT_MODEL = env.ANTHROPIC_MODEL;
const DEFAULT_MAX_TOKENS = env.ANTHROPIC_MAX_TOKENS;
const REQUEST_TIMEOUT_MS = env.ANTHROPIC_REQUEST_TIMEOUT_MS;
const TOOL_TIMEOUT_MS = env.TOOL_TIMEOUT_MS;

const SENSITIVE_KEYS = [
  'apiKey', 'apikey', 'authorization', 'auth', 'token', 'secret', 'password', 'privateKey',
  'private_key', 'key', 'bearer', 'access_token', 'x-api-key', 'x-apiKey'
];

function redactValue(k: string, v: unknown): unknown {
  const key = k.toLowerCase();
  const isSensitive = SENSITIVE_KEYS.some(s => key.includes(s.toLowerCase()));
  if (!isSensitive) return v;
  if (typeof v === 'string') return '[redacted]';
  if (typeof v === 'number') return 0;
  if (typeof v === 'boolean') return false;
  if (v && typeof v === 'object') return '[redacted]';
  return '[redacted]';
}

function redactObject(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  if (Array.isArray(input)) return input.map(redactObject);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = redactObject(
        // If the key itself is sensitive, blank the whole subtree
        SENSITIVE_KEYS.some(s => k.toLowerCase().includes(s.toLowerCase())) ? '[redacted]' : v
      );
    } else {
      out[k] = redactValue(k, v);
    }
  }
  return out;
}

function truncate(s: string, max = 200): string {
  return s.length <= max ? s : `${s.slice(0, max)}...`;
}

async function withRetries<T>(fn: () => Promise<T>, opts: { retries: number; baseDelayMs: number; onRetry?: (e: unknown, attempt: number) => void }): Promise<T> {
  let attempt = 0;
  let delay = opts.baseDelayMs;
  for (;;) {
    try {
      return await fn();
    } catch (e) {
      attempt += 1;
      if (attempt > opts.retries) throw e;
      opts.onRetry?.(e, attempt);
      await new Promise(res => setTimeout(res, delay));
      delay = Math.min(delay * 2, 5000);
    }
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number, onTimeoutMsg?: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, rej) => {
        timer = setTimeout(() => rej(new Error(onTimeoutMsg || `timeout after ${ms}ms`)), ms);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export class FactoryAgent {
  private client: Anthropic;
  private tools: Map<string, ToolConfig> = new Map();
  private anthropicTools: Anthropic.Tool[] = [];

  constructor(opts?: { client?: Anthropic; workDir?: string }) {
    if (!env.ANTHROPIC_API_KEY && !opts?.client) {
      throw new Error('ANTHROPIC_API_KEY required');
    }

    this.client = opts?.client || new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    const workDir = opts?.workDir || path.join(process.cwd(), 'workspace');
    try {
      if (!fs.existsSync(workDir)) fs.mkdirSync(workDir, { recursive: true });
    } catch (e) {
      throw new Error(`Failed to prepare workspace at ${workDir}: ${(e as Error).message}`);
    }

    const colosseumTools = createColosseumTools({ apiKey: env.COLOSSEUM_API_KEY });
    colosseumTools.forEach(t => this.addTool(t));

    const builderTools = createBuilderTools({ workDir, solanaRpcUrl: env.SOLANA_RPC_URL });
    builderTools.forEach(t => this.addTool(t));

    const zkTools = createZKReputationTools();
    zkTools.forEach(t => this.addTool(t));

    if (env.DKG_ENDPOINT) {
      const dkgTools = createDKGProvenanceTools({ endpoint: env.DKG_ENDPOINT });
      dkgTools.forEach(t => this.addTool(t));
    }
  }

  private addTool(tool: ToolConfig): void {
    this.tools.set(tool.name, tool);

    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, param] of Object.entries(tool.parameters)) {
      properties[key] = {
        type: param.type,
        description: param.description,
        ...(param.enum ? { enum: param.enum } : {}),
      };
      if (param.required) required.push(key);
    }

    this.anthropicTools.push({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object' as const,
        properties,
        required,
      },
    });
  }

  async run(task: string, maxTurns = env.AGENT_MAX_TURNS): Promise<{ response: string; toolsUsed: string[] }> {
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: task }];
    const toolsUsed = new Set<string>();
    let lastAssistantText = '';

    for (let turn = 0; turn < maxTurns; turn++) {
      const createCall = () => this.client.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: DEFAULT_MAX_TOKENS,
        system: SYSTEM_PROMPT,
        tools: this.anthropicTools,
        messages,
      });

      const response = await withRetries(
        () => withTimeout(createCall(), REQUEST_TIMEOUT_MS, 'Anthropic request timed out'),
        { retries: 2, baseDelayMs: 300, onRetry: (e, a) => console.warn(`[LLM] retry ${a}: ${(e as Error).message}`) }
      );

      const assistantBlocks: Anthropic.ContentBlock[] = [];
      const toolCalls: ToolCall[] = [];

      for (const block of response.content) {
        assistantBlocks.push(block);
        if (block.type === 'text') lastAssistantText = block.text;
        if (block.type === 'tool_use') {
          toolCalls.push({ id: block.id, name: block.name, input: block.input as Record<string, unknown> });
        }
      }

      messages.push({ role: 'assistant', content: assistantBlocks });

      if (toolCalls.length === 0) {
        const textBlocks = response.content.filter(b => b.type === 'text');
        const final = textBlocks.map(b => (b as Anthropic.TextBlock).text).join('\n');
        return { response: final || lastAssistantText || '', toolsUsed: Array.from(toolsUsed) };
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const call of toolCalls) {
        const tool = this.tools.get(call.name);
        if (!tool) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: call.id,
            content: JSON.stringify({ success: false, error: `Unknown tool: ${call.name}` }),
          });
          continue;
        }

        toolsUsed.add(call.name);
        const safeInput = redactObject(call.input);
        console.log(`[Tool] ${call.name}(${truncate(JSON.stringify(safeInput))})`);

        try {
          const result = await withTimeout(
            tool.handler(call.input),
            TOOL_TIMEOUT_MS,
            `tool '${call.name}' timed out after ${TOOL_TIMEOUT_MS}ms`
          );
          const safeResult = redactObject(result);
          toolResults.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(safeResult) });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Tool execution failed';
          const safeError = redactObject({ success: false, error: message });
          toolResults.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(safeError) });
        }
      }

      messages.push({ role: 'user', content: toolResults });

      if (response.stop_reason === 'max_tokens') {
        console.warn('[LLM] stop_reason=max_tokens');
      }
    }

    return { response: lastAssistantText || 'Max turns reached', toolsUsed: Array.from(new Set<string>()) };
  }
}

export async function runAutonomousTask(task: string): Promise<void> {
  console.log('============================================================');
  console.log('KAMIYO Agent Factory - Autonomous Task');
  console.log('============================================================');
  console.log(`Task: ${task}`);
  console.log('------------------------------------------------------------');

  const agent = new FactoryAgent();
  const { response, toolsUsed } = await agent.run(task);

  console.log('------------------------------------------------------------');
  console.log('Tools used:', toolsUsed.join(', ') || 'none');
  console.log('------------------------------------------------------------');
  console.log('Response:');
  console.log(response);
  console.log('============================================================');
}
