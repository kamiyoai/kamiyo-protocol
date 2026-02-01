/**
 * Agent Paranet Actions for ElizaOS
 * Actions for interacting with the KAMIYO Agent Paranet on OriginTrail DKG
 */

import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '../types.js';
import { getBridgeContext } from '../bridge.js';

const GLOBAL_ID_REGEX = /eip155:\d+:0x[a-fA-F0-9]{40}:\d+/;
const TASK_TYPES = [
  'code_review', 'security_audit', 'smart_contract_audit', 'code_generation',
  'documentation', 'research', 'data_analysis', 'translation', 'content_creation',
  'api_integration', 'testing', 'deployment', 'monitoring', 'custom'
];
const TIER_NAMES = ['Unverified', 'Bronze', 'Silver', 'Gold', 'Platinum'];

function extractGlobalId(text: string): string | null {
  const match = text.match(GLOBAL_ID_REGEX);
  return match ? match[0] : null;
}

function extractTaskType(text: string): string | null {
  const lower = text.toLowerCase();
  return TASK_TYPES.find(t => lower.includes(t.replace('_', ' '))) || null;
}

function extractNumber(text: string, keywords: string[]): number | null {
  for (const kw of keywords) {
    const pattern = new RegExp(`${kw}[:\\s]*(\\d+(?:\\.\\d+)?)`);
    const match = text.match(pattern);
    if (match) return parseFloat(match[1]);
  }
  return null;
}

export const findParanetProvidersAction: Action = {
  name: 'FIND_PARANET_PROVIDERS',
  description: 'Find AI agent providers on the KAMIYO Paranet matching search criteria. Use before contracting work.',
  similes: ['find providers', 'search agents', 'who can do', 'find someone for', 'provider search'],
  examples: [
    [
      {
        user: 'agent',
        content: { text: 'Find providers for code review with at least 80% quality' },
      },
      {
        user: 'assistant',
        content: {
          text: 'Found 5 providers for code_review with 80%+ quality',
          action: 'FIND_PARANET_PROVIDERS',
        },
      },
    ],
  ],

  validate: async (runtime: IAgentRuntime, _message: Memory): Promise<boolean> => {
    const endpoint = runtime.getSetting?.('DKG_ENDPOINT') || process.env.DKG_ENDPOINT;
    return !!endpoint;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    options?: { [key: string]: unknown },
    callback?: HandlerCallback
  ) => {
    const ctx = await getBridgeContext(runtime);
    const text = message.content.text || '';

    const taskType = (options?.taskType as string) || extractTaskType(text);
    const minQuality = (options?.minQuality as number) || extractNumber(text, ['quality', 'rating', 'score']) || 80;
    const minTasks = (options?.minTasks as number) || extractNumber(text, ['tasks', 'completed', 'experience']) || 5;
    const limit = (options?.limit as number) || 10;

    try {
      const sparql = taskType
        ? `PREFIX schema: <https://schema.org/>
           SELECT ?provider (COUNT(?task) as ?taskCount) (AVG(?quality) as ?avgQuality)
           WHERE {
             ?task a schema:Action ;
                   schema:name "TaskCompletion" ;
                   schema:agent/schema:@id ?provider ;
                   schema:result/schema:ratingValue ?quality .
             ?task schema:additionalProperty ?typeProp .
             ?typeProp schema:name "taskType" ; schema:value "${taskType}" .
           }
           GROUP BY ?provider
           HAVING(COUNT(?task) >= ${minTasks} && AVG(?quality) >= ${minQuality})
           ORDER BY DESC(?avgQuality)
           LIMIT ${limit}`
        : `PREFIX schema: <https://schema.org/>
           SELECT ?provider (COUNT(?task) as ?taskCount) (AVG(?quality) as ?avgQuality)
           WHERE {
             ?task a schema:Action ;
                   schema:name "TaskCompletion" ;
                   schema:agent/schema:@id ?provider ;
                   schema:result/schema:ratingValue ?quality .
           }
           GROUP BY ?provider
           HAVING(COUNT(?task) >= ${minTasks} && AVG(?quality) >= ${minQuality})
           ORDER BY DESC(?avgQuality)
           LIMIT ${limit}`;

      const results = await ctx.dkgClient.query(sparql) as Array<{
        provider?: string;
        taskCount?: number | string;
        avgQuality?: number | string;
      }>;

      if (!results || results.length === 0) {
        const responseText = `No providers found matching criteria: ${taskType || 'any task'}, ${minQuality}+ quality, ${minTasks}+ tasks`;
        if (callback) await callback({ text: responseText });
        return { providers: [], count: 0 };
      }

      const formatted = results.map(p => ({
        globalId: String(p.provider || '').replace('urn:erc8004:', ''),
        taskCount: Number(p.taskCount || 0),
        avgQuality: Math.round(Number(p.avgQuality || 0) * 10) / 10,
      }));

      const responseText = `Found ${formatted.length} providers${taskType ? ` for ${taskType}` : ''}:
${formatted.map((p, i) => `${i + 1}. ${p.globalId.slice(0, 30)}... - ${p.taskCount} tasks, ${p.avgQuality}% quality`).join('\n')}`;

      if (callback) {
        await callback({ text: responseText, content: { providers: formatted } });
      }

      return { providers: formatted, count: formatted.length };
    } catch (err) {
      const errorMsg = `Failed to search providers: ${err instanceof Error ? err.message : err}`;
      if (callback) await callback({ text: errorMsg });
      return { providers: [], count: 0, error: errorMsg };
    }
  },
};

export const getParanetCreditScoreAction: Action = {
  name: 'GET_PARANET_CREDIT_SCORE',
  description: 'Get detailed credit score for an agent from the KAMIYO Paranet',
  similes: ['credit score', 'check reputation', 'agent score', 'provider rating', 'how good is'],
  examples: [
    [
      {
        user: 'agent',
        content: { text: 'What is the credit score for eip155:8453:0x935D...:123?' },
      },
      {
        user: 'assistant',
        content: {
          text: 'Agent has a Gold tier credit score of 82',
          action: 'GET_PARANET_CREDIT_SCORE',
        },
      },
    ],
  ],

  validate: async (runtime: IAgentRuntime, _message: Memory): Promise<boolean> => {
    const endpoint = runtime.getSetting?.('DKG_ENDPOINT') || process.env.DKG_ENDPOINT;
    return !!endpoint;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    options?: { [key: string]: unknown },
    callback?: HandlerCallback
  ) => {
    const ctx = await getBridgeContext(runtime);
    const text = message.content.text || '';

    const globalId = (options?.globalId as string) || extractGlobalId(text);

    if (!globalId) {
      const errorMsg = 'Please provide an agent global ID (format: eip155:chainId:address:agentId)';
      if (callback) await callback({ text: errorMsg });
      return { error: errorMsg };
    }

    try {
      const sparql = `
        PREFIX schema: <https://schema.org/>
        SELECT
          (COUNT(?task) as ?taskCount)
          (AVG(?quality) as ?avgQuality)
          (MIN(?startTime) as ?firstTask)
          (MAX(?endTime) as ?lastTask)
        WHERE {
          ?task a schema:Action ;
                schema:name "TaskCompletion" ;
                schema:agent/schema:@id "urn:erc8004:${globalId}" ;
                schema:startTime ?startTime ;
                schema:endTime ?endTime ;
                schema:result/schema:ratingValue ?quality .
        }
      `;

      const results = await ctx.dkgClient.query(sparql) as Array<{
        taskCount?: number | string;
        avgQuality?: number | string;
        firstTask?: string;
        lastTask?: string;
      }>;
      const data = results?.[0] || {};

      const taskCount = Number(data.taskCount || 0);
      const avgQuality = Number(data.avgQuality || 0);

      if (taskCount === 0) {
        const responseText = `No task history found for agent ${globalId}`;
        if (callback) await callback({ text: responseText });
        return { globalId, score: 0, tier: 'Unverified', taskCount: 0 };
      }

      let tier = 0;
      if (avgQuality >= 90) tier = 4;
      else if (avgQuality >= 75) tier = 3;
      else if (avgQuality >= 50) tier = 2;
      else if (avgQuality >= 25) tier = 1;

      const score = {
        globalId,
        score: Math.round(avgQuality),
        tier: TIER_NAMES[tier],
        taskCount,
        firstTask: data.firstTask,
        lastTask: data.lastTask,
      };

      const responseText = `Credit Score for ${globalId.slice(0, 30)}...:
Score: ${score.score}/100
Tier: ${score.tier}
Tasks Completed: ${score.taskCount}
Active Since: ${score.firstTask?.split('T')[0] || 'N/A'}`;

      if (callback) await callback({ text: responseText, content: score });

      return score;
    } catch (err) {
      const errorMsg = `Failed to get credit score: ${err instanceof Error ? err.message : err}`;
      if (callback) await callback({ text: errorMsg });
      return { globalId, error: errorMsg };
    }
  },
};

export const publishTaskCompletionAction: Action = {
  name: 'PUBLISH_TASK_COMPLETION',
  description: 'Publish a completed task to the KAMIYO Paranet. Call after receiving work from a provider.',
  similes: ['record task', 'log completion', 'publish work', 'rate provider', 'task done'],
  examples: [
    [
      {
        user: 'agent',
        content: { text: 'Record that provider eip155:8453:0x...:123 completed code review with 90% quality' },
      },
      {
        user: 'assistant',
        content: {
          text: 'Published task completion to paranet',
          action: 'PUBLISH_TASK_COMPLETION',
        },
      },
    ],
  ],

  validate: async (runtime: IAgentRuntime, _message: Memory): Promise<boolean> => {
    const endpoint = runtime.getSetting?.('DKG_ENDPOINT') || process.env.DKG_ENDPOINT;
    const privateKey = runtime.getSetting?.('DKG_PRIVATE_KEY') || process.env.DKG_PRIVATE_KEY;
    return !!endpoint && !!privateKey;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    options?: { [key: string]: unknown },
    callback?: HandlerCallback
  ) => {
    const ctx = await getBridgeContext(runtime);
    const text = message.content.text || '';

    const providerGlobalId = options?.providerGlobalId as string;
    const clientGlobalId = (options?.clientGlobalId as string) || runtime.getSetting?.('AGENT_GLOBAL_ID') || '';
    const taskType = (options?.taskType as string) || extractTaskType(text) || 'custom';
    const taskDescription = (options?.taskDescription as string) || text.slice(0, 500);
    const qualityScore = (options?.qualityScore as number) || extractNumber(text, ['quality', 'score', 'rating']) || 80;
    const paymentAmount = (options?.paymentAmount as number) || extractNumber(text, ['paid', 'payment', 'amount']) || 0;
    const paymentCurrency = (options?.paymentCurrency as string) || 'USDC';

    if (!providerGlobalId) {
      const errorMsg = 'Missing required parameter: providerGlobalId';
      if (callback) await callback({ text: errorMsg });
      return { error: errorMsg };
    }

    const now = new Date().toISOString();
    const asset = {
      '@context': ['https://schema.org/', 'https://kamiyo.ai/paranet/v1', 'https://eips.ethereum.org/EIPS/eip-8004'],
      '@type': 'Action',
      '@id': `urn:kamiyo:task:${providerGlobalId}:${Date.now()}`,
      name: 'TaskCompletion',
      description: taskDescription,
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
        { '@type': 'PropertyValue', name: 'responseTimeMs', value: 3600000 },
        { '@type': 'PropertyValue', name: 'disputeOutcome', value: 'none' },
      ],
    };

    try {
      const ual = await ctx.dkgClient.publish({ public: asset }, { epochs: ctx.config.dkg.epochs });

      const responseText = `Published task completion to paranet:
Provider: ${providerGlobalId.slice(0, 30)}...
Task Type: ${taskType}
Quality: ${qualityScore}%
UAL: ${ual}`;

      if (callback) await callback({ text: responseText, content: { ual, providerGlobalId, qualityScore } });

      return { success: true, ual, providerGlobalId, qualityScore };
    } catch (err) {
      const errorMsg = `Failed to publish: ${err instanceof Error ? err.message : err}`;
      if (callback) await callback({ text: errorMsg });
      return { success: false, error: errorMsg };
    }
  },
};

export const attestCapabilityAction: Action = {
  name: 'ATTEST_CAPABILITY',
  description: 'Attest to an agent\'s capability on the KAMIYO Paranet',
  similes: ['endorse', 'attest', 'vouch for', 'certify skill', 'capability attestation'],
  examples: [
    [
      {
        user: 'agent',
        content: { text: 'Attest that agent eip155:8453:0x...:123 is good at code review with 85% confidence' },
      },
      {
        user: 'assistant',
        content: {
          text: 'Published capability attestation',
          action: 'ATTEST_CAPABILITY',
        },
      },
    ],
  ],

  validate: async (runtime: IAgentRuntime, _message: Memory): Promise<boolean> => {
    const endpoint = runtime.getSetting?.('DKG_ENDPOINT') || process.env.DKG_ENDPOINT;
    const privateKey = runtime.getSetting?.('DKG_PRIVATE_KEY') || process.env.DKG_PRIVATE_KEY;
    return !!endpoint && !!privateKey;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    options?: { [key: string]: unknown },
    callback?: HandlerCallback
  ) => {
    const ctx = await getBridgeContext(runtime);
    const text = message.content.text || '';

    const agentGlobalId = (options?.agentGlobalId as string) || extractGlobalId(text);
    const attestorGlobalId = runtime.getSetting?.('AGENT_GLOBAL_ID') || '';
    const capability = (options?.capability as string) || extractTaskType(text) || 'general';
    const confidence = (options?.confidence as number) || extractNumber(text, ['confidence', 'certainty']) || 80;

    if (!agentGlobalId) {
      const errorMsg = 'Missing required parameter: agentGlobalId';
      if (callback) await callback({ text: errorMsg });
      return { error: errorMsg };
    }

    const asset = {
      '@context': ['https://schema.org/', 'https://kamiyo.ai/paranet/v1', 'https://eips.ethereum.org/EIPS/eip-8004'],
      '@type': 'EndorseAction',
      '@id': `urn:kamiyo:attestation:${agentGlobalId}:${capability}:${attestorGlobalId}`,
      name: 'CapabilityAttestation',
      agent: { '@id': `urn:erc8004:${attestorGlobalId}` },
      object: { '@id': `urn:erc8004:${agentGlobalId}` },
      actionStatus: 'ActiveActionStatus',
      startTime: new Date().toISOString(),
      result: {
        '@type': 'Rating',
        ratingValue: confidence,
        bestRating: 100,
        worstRating: 0,
      },
      additionalProperty: [
        { '@type': 'PropertyValue', name: 'capability', value: capability },
        { '@type': 'PropertyValue', name: 'attestationType', value: 'peer' },
      ],
    };

    try {
      const ual = await ctx.dkgClient.publish({ public: asset }, { epochs: ctx.config.dkg.epochs });

      const responseText = `Published capability attestation:
Agent: ${agentGlobalId.slice(0, 30)}...
Capability: ${capability}
Confidence: ${confidence}%
UAL: ${ual}`;

      if (callback) await callback({ text: responseText, content: { ual, agentGlobalId, capability, confidence } });

      return { success: true, ual, agentGlobalId, capability, confidence };
    } catch (err) {
      const errorMsg = `Failed to publish: ${err instanceof Error ? err.message : err}`;
      if (callback) await callback({ text: errorMsg });
      return { success: false, error: errorMsg };
    }
  },
};

export const recordTrustAction: Action = {
  name: 'RECORD_TRUST',
  description: 'Record a trust relationship with another agent on the KAMIYO Paranet',
  similes: ['trust agent', 'add trust', 'endorse agent', 'vouch for agent'],
  examples: [
    [
      {
        user: 'agent',
        content: { text: 'I trust agent eip155:8453:0x...:123 at level 85' },
      },
      {
        user: 'assistant',
        content: {
          text: 'Published trust relationship',
          action: 'RECORD_TRUST',
        },
      },
    ],
  ],

  validate: async (runtime: IAgentRuntime, _message: Memory): Promise<boolean> => {
    const endpoint = runtime.getSetting?.('DKG_ENDPOINT') || process.env.DKG_ENDPOINT;
    const privateKey = runtime.getSetting?.('DKG_PRIVATE_KEY') || process.env.DKG_PRIVATE_KEY;
    return !!endpoint && !!privateKey;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    options?: { [key: string]: unknown },
    callback?: HandlerCallback
  ) => {
    const ctx = await getBridgeContext(runtime);
    const text = message.content.text || '';

    const trusteeGlobalId = (options?.trusteeGlobalId as string) || extractGlobalId(text);
    const trustorGlobalId = runtime.getSetting?.('AGENT_GLOBAL_ID') || '';
    const trustLevel = (options?.trustLevel as number) || extractNumber(text, ['trust', 'level']) || 70;
    const trustType = (options?.trustType as string) || 'general';
    const reason = (options?.reason as string) || '';

    if (!trusteeGlobalId) {
      const errorMsg = 'Missing required parameter: trusteeGlobalId';
      if (callback) await callback({ text: errorMsg });
      return { error: errorMsg };
    }

    const now = new Date().toISOString();
    const asset = {
      '@context': ['https://schema.org/', 'https://kamiyo.ai/paranet/v1', 'https://eips.ethereum.org/EIPS/eip-8004'],
      '@type': 'EndorseAction',
      '@id': `urn:kamiyo:trust:${trustorGlobalId}:${trusteeGlobalId}:${Date.now()}`,
      name: 'TrustRelationship',
      agent: { '@id': `urn:erc8004:${trustorGlobalId}` },
      object: { '@id': `urn:erc8004:${trusteeGlobalId}` },
      actionStatus: 'ActiveActionStatus',
      startTime: now,
      result: {
        '@type': 'Rating',
        ratingValue: trustLevel,
        bestRating: 100,
        worstRating: 0,
        ratingExplanation: reason,
      },
      additionalProperty: [
        { '@type': 'PropertyValue', name: 'trustType', value: trustType },
      ],
    };

    try {
      const ual = await ctx.dkgClient.publish({ public: asset }, { epochs: ctx.config.dkg.epochs });

      const responseText = `Published trust relationship:
Trustee: ${trusteeGlobalId.slice(0, 30)}...
Trust Level: ${trustLevel}%
Type: ${trustType}
UAL: ${ual}`;

      if (callback) await callback({ text: responseText, content: { ual, trusteeGlobalId, trustLevel } });

      return { success: true, ual, trusteeGlobalId, trustLevel };
    } catch (err) {
      const errorMsg = `Failed to publish: ${err instanceof Error ? err.message : err}`;
      if (callback) await callback({ text: errorMsg });
      return { success: false, error: errorMsg };
    }
  },
};
