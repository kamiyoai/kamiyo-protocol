/**
 * Protocol MCP Server - exposes KAMIYO tools.
 */

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod/v4';
import { createLogger, getMetrics } from './lib';
import type { DKGMemory } from './dkg-memory';

const log = createLogger('kyoshin:protocol-mcp');
const metrics = getMetrics();

function sanitizeError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 200);
  return 'Operation failed';
}

/**
 * Protocol MCP configuration
 */
export interface ProtocolMcpConfig {
  dkgMemory: DKGMemory;
  solanaRpcUrl?: string;
  solanaPrivateKey?: string;
  x402Enabled?: boolean;
}

/**
 * Create KAMIYO Protocol MCP Server
 */
export function createProtocolMcpServer(config: ProtocolMcpConfig) {
  return createSdkMcpServer({
    name: 'kamiyo-protocol',
    version: '1.0.0',
    tools: [
      // ============================================
      // DKG (Knowledge Graph) Tools
      // ============================================

      tool(
        'dkg_store_knowledge',
        'Store knowledge or observation in the decentralized knowledge graph. Returns the UAL (Uniform Asset Locator) for permanent reference.',
        {
          content: z.string().min(10).max(5000).describe('The knowledge content to store'),
          topics: z.array(z.string()).optional().describe('Topic tags for categorization'),
          confidence: z.number().min(0).max(1).default(0.8).describe('Confidence score (0-1)'),
          source: z.string().optional().describe('Source of the knowledge'),
        },
        async (args) => {
          log.info('Storing knowledge in DKG', { contentLength: args.content.length });
          try {
            const ual = await config.dkgMemory.storeObservation({
              content: args.content,
              topics: args.topics,
              confidence: args.confidence,
              source: args.source,
            });

            if (ual) {
              metrics.incrementCounter('protocol_dkg_store_success');
              return {
                content: [{ type: 'text', text: `Knowledge stored. UAL: ${ual}` }],
              };
            }

            return {
              content: [{ type: 'text', text: 'Failed to store knowledge - no UAL returned' }],
            };
          } catch (error) {
            metrics.incrementCounter('protocol_dkg_store_error');
            return {
              content: [{ type: 'text', text: `Error: ${sanitizeError(error)}` }],
            };
          }
        }
      ),

      tool(
        'dkg_query',
        'Query the knowledge graph with SPARQL. Returns matching results.',
        {
          sparql: z.string().min(10).describe('SPARQL query to execute'),
        },
        async (args) => {
          log.info('Executing DKG query');
          try {
            const results = await config.dkgMemory.query(args.sparql);
            metrics.incrementCounter('protocol_dkg_query_success');
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ count: results.length, results: results.slice(0, 20) }, null, 2),
                },
              ],
            };
          } catch (error) {
            metrics.incrementCounter('protocol_dkg_query_error');
            return {
              content: [{ type: 'text', text: `Query error: ${sanitizeError(error)}` }],
            };
          }
        }
      ),

      tool(
        'dkg_get_asset',
        'Retrieve a knowledge asset by its UAL.',
        {
          ual: z.string().describe('Universal Asset Locator'),
        },
        async (args) => {
          try {
            const asset = await config.dkgMemory.get(args.ual);
            if (asset) {
              return {
                content: [{ type: 'text', text: JSON.stringify(asset, null, 2) }],
              };
            }
            return { content: [{ type: 'text', text: 'Asset not found' }] };
          } catch (error) {
            return { content: [{ type: 'text', text: `Error: ${sanitizeError(error)}` }] };
          }
        }
      ),

      tool(
        'dkg_search_topics',
        'Search knowledge graph by topic.',
        {
          topic: z.string().min(2).describe('Topic to search for'),
          limit: z.number().min(1).max(50).default(10).describe('Maximum results'),
        },
        async (args) => {
          try {
            const results = await config.dkgMemory.searchByTopic(args.topic, args.limit);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ count: results.length, results }, null, 2),
                },
              ],
            };
          } catch (error) {
            return { content: [{ type: 'text', text: `Error: ${sanitizeError(error)}` }] };
          }
        }
      ),

      tool(
        'dkg_get_recent_topics',
        "Get Kyoshin's recent tweet topics to avoid repetition.",
        {
          hours: z.number().min(1).max(168).default(24).describe('Hours to look back'),
        },
        async (args) => {
          try {
            const topics = await config.dkgMemory.getRecentTopics(args.hours);
            return {
              content: [{ type: 'text', text: JSON.stringify({ topics, count: topics.length }, null, 2) }],
            };
          } catch (error) {
            return { content: [{ type: 'text', text: `Error: ${sanitizeError(error)}` }] };
          }
        }
      ),

      // ============================================
      // Paranet (Agent Marketplace) Tools
      // ============================================

      tool(
        'paranet_discover_agents',
        'Discover agents on the KAMIYO paranet by capability or domain.',
        {
          query: z.string().describe('Search query for agent capabilities'),
          domain: z.enum(['ai', 'defi', 'data', 'social', 'any']).default('any').describe('Agent domain'),
          limit: z.number().min(1).max(20).default(5).describe('Maximum results'),
        },
        async (args) => {
          log.info('Discovering agents', { query: args.query, domain: args.domain });
          // Note: This would integrate with @kamiyo/agent-paranet AgentParanetClient
          // For now, return placeholder indicating the capability
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  status: 'discovery_available',
                  query: args.query,
                  domain: args.domain,
                  message: 'Agent discovery would search the paranet for matching agents',
                }, null, 2),
              },
            ],
          };
        }
      ),

      tool(
        'paranet_get_agent_reputation',
        'Get reputation score for an agent on the KAMIYO protocol.',
        {
          agentId: z.string().describe('Agent identifier or public key'),
        },
        async (args) => {
          log.info('Getting agent reputation', { agentId: args.agentId.slice(0, 20) });
          // Placeholder for reputation lookup
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  agentId: args.agentId,
                  status: 'reputation_lookup_available',
                  message: 'Would query on-chain reputation from staking program',
                }, null, 2),
              },
            ],
          };
        }
      ),

      tool(
        'paranet_register_capability',
        'Register a new capability Kyoshin can offer to other agents.',
        {
          capability: z.string().describe('Capability name'),
          description: z.string().describe('What this capability does'),
          pricing: z.string().optional().describe('Pricing model (e.g., "0.001 SOL per call")'),
        },
        async (args) => {
          log.info('Registering capability', { capability: args.capability });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  capability: args.capability,
                  description: args.description,
                  pricing: args.pricing,
                  status: 'registration_available',
                  message: 'Would register capability on paranet for discovery',
                }, null, 2),
              },
            ],
          };
        }
      ),

      // ============================================
      // x402 (Micropayments) Tools
      // ============================================

      tool(
        'x402_check_balance',
        'Check USDC balance available for micropayments.',
        {},
        async () => {
          if (!config.x402Enabled) {
            return { content: [{ type: 'text', text: 'x402 micropayments not enabled' }] };
          }
          // Placeholder for x402 balance check
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  status: 'balance_check_available',
                  message: 'Would check USDC balance on PayAI Network',
                }, null, 2),
              },
            ],
          };
        }
      ),

      tool(
        'x402_pay_agent',
        'Send micropayment to another agent for a service.',
        {
          recipient: z.string().describe('Recipient agent address'),
          amount: z.number().min(0.000001).describe('Amount in USDC'),
          memo: z.string().optional().describe('Payment memo'),
        },
        async (args) => {
          if (!config.x402Enabled) {
            return { content: [{ type: 'text', text: 'x402 micropayments not enabled' }] };
          }
          log.info('Processing micropayment', { recipient: args.recipient.slice(0, 20), amount: args.amount });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  recipient: args.recipient,
                  amount: args.amount,
                  memo: args.memo,
                  status: 'payment_available',
                  message: 'Would process payment through x402 protocol',
                }, null, 2),
              },
            ],
          };
        }
      ),

      // ============================================
      // Escrow & Settlement Tools
      // ============================================

      tool(
        'escrow_create',
        'Create an escrow for a service agreement with another agent.',
        {
          provider: z.string().describe('Provider agent address'),
          amount: z.number().min(0.01).describe('Escrow amount in SOL'),
          description: z.string().describe('Service description'),
          expiryHours: z.number().min(1).max(720).default(24).describe('Hours until expiry'),
        },
        async (args) => {
          log.info('Creating escrow', { provider: args.provider.slice(0, 20), amount: args.amount });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  provider: args.provider,
                  amount: args.amount,
                  description: args.description,
                  expiryHours: args.expiryHours,
                  status: 'escrow_creation_available',
                  message: 'Would create on-chain escrow via KAMIYO escrow program',
                }, null, 2),
              },
            ],
          };
        }
      ),

      tool(
        'escrow_release',
        'Release escrow funds to the provider after successful service.',
        {
          escrowId: z.string().describe('Escrow account address'),
          qualityScore: z.number().min(0).max(100).default(100).describe('Quality score (0-100)'),
        },
        async (args) => {
          log.info('Releasing escrow', { escrowId: args.escrowId.slice(0, 20) });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  escrowId: args.escrowId,
                  qualityScore: args.qualityScore,
                  status: 'release_available',
                  message: 'Would release escrow funds with quality score',
                }, null, 2),
              },
            ],
          };
        }
      ),

      tool(
        'escrow_dispute',
        'Initiate a dispute on an escrow for oracle resolution.',
        {
          escrowId: z.string().describe('Escrow account address'),
          reason: z.string().describe('Reason for dispute'),
          evidence: z.string().optional().describe('Evidence supporting the dispute'),
        },
        async (args) => {
          log.info('Initiating dispute', { escrowId: args.escrowId.slice(0, 20) });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  escrowId: args.escrowId,
                  reason: args.reason,
                  status: 'dispute_available',
                  message: 'Would initiate on-chain dispute for oracle resolution',
                }, null, 2),
              },
            ],
          };
        }
      ),

      // ============================================
      // Reputation Tools
      // ============================================

      tool(
        'reputation_query',
        'Query reputation score for an entity.',
        {
          entity: z.string().describe('Entity public key or identifier'),
          category: z.enum(['overall', 'quality', 'reliability', 'speed']).default('overall').describe('Score category'),
        },
        async (args) => {
          log.info('Querying reputation', { entity: args.entity.slice(0, 20), category: args.category });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  entity: args.entity,
                  category: args.category,
                  status: 'reputation_query_available',
                  message: 'Would query on-chain reputation from staking program',
                }, null, 2),
              },
            ],
          };
        }
      ),

      tool(
        'reputation_stake_info',
        "Get staking information for Kyoshin's protocol stake.",
        {},
        async () => {
          log.info('Getting stake info');
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  status: 'stake_info_available',
                  message: 'Would return staking balance, lockup, and derived reputation',
                }, null, 2),
              },
            ],
          };
        }
      ),
    ],
  });
}

export const PROTOCOL_MCP_TOOL_NAMES = [
  'mcp__kamiyo-protocol__dkg_store_knowledge',
  'mcp__kamiyo-protocol__dkg_query',
  'mcp__kamiyo-protocol__dkg_get_asset',
  'mcp__kamiyo-protocol__dkg_search_topics',
  'mcp__kamiyo-protocol__dkg_get_recent_topics',
  'mcp__kamiyo-protocol__paranet_discover_agents',
  'mcp__kamiyo-protocol__paranet_get_agent_reputation',
  'mcp__kamiyo-protocol__paranet_register_capability',
  'mcp__kamiyo-protocol__x402_check_balance',
  'mcp__kamiyo-protocol__x402_pay_agent',
  'mcp__kamiyo-protocol__escrow_create',
  'mcp__kamiyo-protocol__escrow_release',
  'mcp__kamiyo-protocol__escrow_dispute',
  'mcp__kamiyo-protocol__reputation_query',
  'mcp__kamiyo-protocol__reputation_stake_info',
] as const;

export type ProtocolMcpToolName = (typeof PROTOCOL_MCP_TOOL_NAMES)[number];
