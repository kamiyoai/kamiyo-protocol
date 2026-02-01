/**
 * Paranet Evaluators for ElizaOS
 *
 * Automatic evaluation of agent interactions:
 * - Pre-contract: Check provider credit score before engaging
 * - Post-task: Publish task completion automatically
 */

import type { Evaluator, IAgentRuntime, Memory, State } from '../types.js';
import { getBridgeContext } from '../bridge.js';

const GLOBAL_ID_REGEX = /eip155:\d+:0x[a-fA-F0-9]{40}:\d+/;
const TIER_NAMES = ['Unverified', 'Bronze', 'Silver', 'Gold', 'Platinum'];

/**
 * Pre-contract evaluator
 * Checks provider credit score before engaging in a contract
 */
export const preContractEvaluator: Evaluator = {
  name: 'paranetPreContract',
  description: 'Checks provider credit score before engaging in work',
  similes: ['contract check', 'provider check', 'credit check'],
  examples: [
    {
      context: 'Agent considering hiring a provider',
      messages: [
        { user: 'agent', content: { text: 'Contract eip155:8453:0x935D...:123 for code review' } },
      ],
      outcome: 'Credit score checked and requirements verified',
    },
  ],

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const autoCheck = runtime.getSetting?.('AUTO_CHECK_PROVIDER') !== 'false';
    if (!autoCheck) return false;

    const text = message.content.text || '';
    const hasGlobalId = GLOBAL_ID_REGEX.test(text);
    const isContractIntent = /contract|hire|engage|work with|use provider/i.test(text);

    return hasGlobalId && isContractIntent;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State
  ): Promise<{ checked: boolean; meetsRequirements?: boolean; score?: number; tier?: string; reason?: string }> => {
    try {
      const ctx = await getBridgeContext(runtime);
      const text = message.content.text || '';

      const match = text.match(GLOBAL_ID_REGEX);
      if (!match) return { checked: false, reason: 'No provider ID found' };

      const globalId = match[0];
      const minScore = parseInt(runtime.getSetting?.('MIN_PROVIDER_SCORE') || '50', 10);
      const minTier = parseInt(runtime.getSetting?.('MIN_PROVIDER_TIER') || '1', 10);

      const sparql = `
        PREFIX schema: <https://schema.org/>
        SELECT (COUNT(?task) as ?taskCount) (AVG(?quality) as ?avgQuality)
        WHERE {
          ?task a schema:Action ;
                schema:name "TaskCompletion" ;
                schema:agent/schema:@id "urn:erc8004:${globalId}" ;
                schema:result/schema:ratingValue ?quality .
        }
      `;

      const results = await ctx.dkgClient.query(sparql) as Array<{
        taskCount?: number | string;
        avgQuality?: number | string;
      }>;
      const data = results?.[0] || {};

      const taskCount = Number(data.taskCount || 0);
      const avgQuality = Number(data.avgQuality || 0);

      if (taskCount === 0) {
        return {
          checked: true,
          meetsRequirements: minScore <= 0 && minTier === 0,
          score: 0,
          tier: 'Unverified',
          reason: 'No task history found',
        };
      }

      let tier = 0;
      if (avgQuality >= 90) tier = 4;
      else if (avgQuality >= 75) tier = 3;
      else if (avgQuality >= 50) tier = 2;
      else if (avgQuality >= 25) tier = 1;

      const meetsRequirements = avgQuality >= minScore && tier >= minTier;

      return {
        checked: true,
        meetsRequirements,
        score: Math.round(avgQuality),
        tier: TIER_NAMES[tier],
        reason: meetsRequirements
          ? `Provider meets requirements: ${Math.round(avgQuality)}% quality, ${TIER_NAMES[tier]} tier`
          : `Provider does not meet requirements: ${Math.round(avgQuality)}% < ${minScore}% or tier ${tier} < ${minTier}`,
      };
    } catch (err) {
      return { checked: false, reason: `Check failed: ${err instanceof Error ? err.message : err}` };
    }
  },
};

/**
 * Post-task evaluator
 * Automatically publishes task completion to the paranet
 */
export const postTaskEvaluator: Evaluator = {
  name: 'paranetPostTask',
  description: 'Automatically publishes task completion to the paranet',
  similes: ['task complete', 'work done', 'publish result'],
  examples: [
    {
      context: 'Agent received completed work from provider',
      messages: [
        { user: 'agent', content: { text: 'Received code review from provider with 90% quality' } },
      ],
      outcome: 'Task completion published to paranet',
    },
  ],

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const autoPublish = runtime.getSetting?.('AUTO_PUBLISH_TASK') !== 'false';
    if (!autoPublish) return false;

    const content = message.content;
    const hasQuality = content.qualityScore !== undefined ||
                       content.quality !== undefined ||
                       /(\d+)\s*%\s*quality/i.test(content.text || '');
    const isCompletion = /completed|finished|delivered|received|done/i.test(content.text || '');

    return hasQuality && isCompletion;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State
  ): Promise<{ published: boolean; ual?: string; reason?: string }> => {
    try {
      const ctx = await getBridgeContext(runtime);
      const content = message.content;
      const text = content.text || '';

      // Extract provider ID
      const match = text.match(GLOBAL_ID_REGEX);
      const providerGlobalId = (content.providerGlobalId as string) ||
                               (content.providerId as string) ||
                               (match ? match[0] : null) ||
                               (state?.currentProvider as string);

      if (!providerGlobalId) {
        return { published: false, reason: 'No provider ID found' };
      }

      // Extract quality score
      let qualityScore: number | undefined;
      if (typeof content.qualityScore === 'number') {
        qualityScore = content.qualityScore;
      } else if (typeof content.quality === 'number') {
        qualityScore = content.quality;
      } else {
        const qualityMatch = text.match(/(\d+)\s*%?\s*quality/i);
        if (qualityMatch) qualityScore = parseInt(qualityMatch[1], 10);
      }

      if (qualityScore === undefined) {
        return { published: false, reason: 'No quality score found' };
      }

      // Extract task type
      const taskTypes = [
        'code_review', 'security_audit', 'smart_contract_audit', 'code_generation',
        'documentation', 'research', 'data_analysis', 'translation', 'content_creation',
        'api_integration', 'testing', 'deployment', 'monitoring', 'custom'
      ];
      const taskType = (content.taskType as string) ||
                       taskTypes.find(t => text.toLowerCase().includes(t.replace('_', ' '))) ||
                       'custom';

      const clientGlobalId = runtime.getSetting?.('AGENT_GLOBAL_ID') || '';
      const paymentAmount = (content.paymentAmount as number) || 0;
      const paymentCurrency = (content.paymentCurrency as string) || 'USDC';

      const now = new Date().toISOString();
      const asset = {
        '@context': ['https://schema.org/', 'https://kamiyo.ai/paranet/v1', 'https://eips.ethereum.org/EIPS/eip-8004'],
        '@type': 'Action',
        '@id': `urn:kamiyo:task:${providerGlobalId}:${Date.now()}`,
        name: 'TaskCompletion',
        description: text.slice(0, 500),
        agent: { '@id': `urn:erc8004:${providerGlobalId}` },
        participant: { '@id': `urn:erc8004:${clientGlobalId}` },
        startTime: new Date(Date.now() - 3600000).toISOString(),
        endTime: now,
        actionStatus: 'CompletedActionStatus',
        result: {
          '@type': 'Rating',
          ratingValue: qualityScore,
          bestRating: 100,
          worstRating: 0,
        },
        object: {
          '@type': 'MonetaryAmount',
          value: paymentAmount,
          currency: paymentCurrency,
        },
        additionalProperty: [
          { '@type': 'PropertyValue', name: 'taskType', value: taskType },
          { '@type': 'PropertyValue', name: 'disputeOutcome', value: 'none' },
        ],
      };

      const ual = await ctx.dkgClient.publish({ public: asset }, { epochs: ctx.config.dkg.epochs });

      return { published: true, ual };
    } catch (err) {
      return { published: false, reason: `Publish failed: ${err instanceof Error ? err.message : err}` };
    }
  },
};
