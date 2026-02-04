/**
 * KAMIYO Agent Factory - Autonomous Agent
 *
 * This agent can:
 * 1. Monitor Colosseum forum for opportunities
 * 2. Respond to integration requests
 * 3. Build Solana programs autonomously
 * 4. Deploy to devnet/mainnet
 * 5. Generate SDKs and documentation
 */

import Anthropic from '@anthropic-ai/sdk';
import { createColosseumTools } from './tools/colosseum-tools.js';
import { createBuilderTools } from './tools/builder-tools.js';
import { createZKReputationTools } from './tools/zk-reputation-tools.js';
import { createDKGProvenanceTools } from './tools/dkg-provenance-tools.js';
import { env } from './config.js';
import * as path from 'path';

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

export class FactoryAgent {
  private client: Anthropic;
  private tools: Map<string, ToolConfig> = new Map();
  private anthropicTools: Anthropic.Tool[] = [];

  constructor() {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY required');
    }

    this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    // Add Colosseum tools
    const colosseumTools = createColosseumTools({ apiKey: env.COLOSSEUM_API_KEY });
    colosseumTools.forEach(tool => this.addTool(tool));

    // Add Builder tools
    const workDir = path.join(process.cwd(), 'workspace');
    const builderTools = createBuilderTools({ workDir, solanaRpcUrl: env.SOLANA_RPC_URL });
    builderTools.forEach(tool => this.addTool(tool));

    // Add ZK Reputation tools
    const zkTools = createZKReputationTools();
    zkTools.forEach(tool => this.addTool(tool));

    // Add DKG Provenance tools
    const dkgTools = createDKGProvenanceTools({ endpoint: env.DKG_ENDPOINT });
    dkgTools.forEach(tool => this.addTool(tool));
  }

  private addTool(tool: ToolConfig): void {
    this.tools.set(tool.name, tool);

    // Convert to Anthropic format
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, param] of Object.entries(tool.parameters)) {
      properties[key] = {
        type: param.type,
        description: param.description,
        ...(param.enum ? { enum: param.enum } : {}),
      };
      if (param.required) {
        required.push(key);
      }
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

  async run(task: string, maxTurns = 10): Promise<{ response: string; toolsUsed: string[] }> {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: task },
    ];

    const toolsUsed: string[] = [];

    for (let turn = 0; turn < maxTurns; turn++) {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        tools: this.anthropicTools,
        messages,
      });

      // Process response content
      const assistantContent: Anthropic.ContentBlock[] = [];
      const toolCalls: ToolCall[] = [];

      for (const block of response.content) {
        assistantContent.push(block);
        if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          });
        }
      }

      messages.push({ role: 'assistant', content: assistantContent });

      // If no tool calls, we're done
      if (toolCalls.length === 0 || response.stop_reason === 'end_turn') {
        const textBlocks = response.content.filter(b => b.type === 'text');
        const finalResponse = textBlocks.map(b => (b as Anthropic.TextBlock).text).join('\n');
        return { response: finalResponse, toolsUsed };
      }

      // Execute tool calls
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

        toolsUsed.push(call.name);
        console.log(`[Tool] ${call.name}(${JSON.stringify(call.input).slice(0, 100)}...)`);

        try {
          const result = await tool.handler(call.input);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: call.id,
            content: JSON.stringify(result),
          });
        } catch (error) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: call.id,
            content: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Tool execution failed',
            }),
          });
        }
      }

      messages.push({ role: 'user', content: toolResults });
    }

    return { response: 'Max turns reached', toolsUsed };
  }
}

export async function runAutonomousTask(task: string): Promise<void> {
  console.log('='.repeat(60));
  console.log('KAMIYO Agent Factory - Autonomous Task');
  console.log('='.repeat(60));
  console.log(`Task: ${task}`);
  console.log('-'.repeat(60));

  const agent = new FactoryAgent();
  const { response, toolsUsed } = await agent.run(task);

  console.log('-'.repeat(60));
  console.log('Tools used:', toolsUsed.join(', ') || 'none');
  console.log('-'.repeat(60));
  console.log('Response:');
  console.log(response);
  console.log('='.repeat(60));
}
