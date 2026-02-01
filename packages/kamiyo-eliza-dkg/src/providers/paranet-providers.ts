// ElizaOS state providers for credit scores and trust network context

import type { Provider, IAgentRuntime, Memory, State } from '../types.js';
import { getBridgeContext } from '../bridge.js';
import {
  GLOBAL_ID_REGEX,
  TIER_NAMES,
  escapeSparql,
  isValidGlobalId,
  scoreToTierIndex,
  safeInt,
} from '@kamiyo/agent-paranet';

interface CreditScoreContext {
  globalId: string;
  score: number;
  tier: string;
  tierIndex: number;
  taskCount: number;
  avgQuality: number;
  lastActive?: string;
  trusted: boolean;
}

/**
 * Credit score provider
 * Provides credit score context for agents mentioned in conversation
 */
export const creditScoreProvider: Provider = {
  get: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State
  ): Promise<string> => {
    const text = message.content.text || '';
    const matches = text.match(new RegExp(GLOBAL_ID_REGEX.source, 'g'));

    if (!matches || matches.length === 0) {
      return '';
    }

    try {
      const ctx = await getBridgeContext(runtime);
      const scores: CreditScoreContext[] = [];
      const minTrustedScore = safeInt(runtime.getSetting?.('MIN_TRUSTED_SCORE'), 50, 0, 100);

      for (const globalId of matches.slice(0, 5)) {
        if (!isValidGlobalId(globalId)) continue;
        const safeGlobalId = escapeSparql(globalId);
        const sparql = `
          PREFIX schema: <https://schema.org/>
          SELECT
            (COUNT(?task) as ?taskCount)
            (AVG(?quality) as ?avgQuality)
            (MAX(?endTime) as ?lastActive)
          WHERE {
            ?task a schema:Action ;
                  schema:name "TaskCompletion" ;
                  schema:agent/schema:@id "urn:erc8004:${safeGlobalId}" ;
                  schema:endTime ?endTime ;
                  schema:result/schema:ratingValue ?quality .
          }
        `;

        const results = await ctx.dkgClient.query(sparql) as Array<{
          taskCount?: number | string;
          avgQuality?: number | string;
          lastActive?: string;
        }>;
        const data = results?.[0] || {};

        const taskCount = Number(data.taskCount || 0);
        const avgQuality = Number(data.avgQuality || 0);
        const tierIndex = scoreToTierIndex(avgQuality);

        scores.push({
          globalId,
          score: Math.round(avgQuality),
          tier: TIER_NAMES[tierIndex],
          tierIndex,
          taskCount,
          avgQuality: Math.round(avgQuality * 10) / 10,
          lastActive: data.lastActive,
          trusted: avgQuality >= minTrustedScore && taskCount >= 5,
        });
      }

      if (scores.length === 0) return '';

      const context = scores.map(s => {
        const warning = s.trusted ? '' : ' (NOT TRUSTED - low score or insufficient history)';
        return `Agent ${s.globalId.slice(0, 40)}...: ${s.tier} tier (${s.score}/100), ${s.taskCount} tasks${warning}`;
      }).join('\n');

      return `\n[Paranet Credit Scores]\n${context}\n`;
    } catch (err) {
      console.error('[Paranet Credit Provider] Error:', err);
      return '';
    }
  },
};

/**
 * Peer reputation provider
 * Provides trust network context for the current agent
 */
export const peerReputationProvider: Provider = {
  get: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State
  ): Promise<string> => {
    const agentGlobalId = runtime.getSetting?.('AGENT_GLOBAL_ID');
    if (!isValidGlobalId(agentGlobalId)) return '';

    try {
      const ctx = await getBridgeContext(runtime);
      const safeGlobalId = escapeSparql(agentGlobalId);

      // Query agents we trust
      const trustedSparql = `
        PREFIX schema: <https://schema.org/>
        SELECT ?trustee ?trustLevel
        WHERE {
          ?trust a schema:EndorseAction ;
                 schema:name "TrustRelationship" ;
                 schema:agent/schema:@id "urn:erc8004:${safeGlobalId}" ;
                 schema:object/schema:@id ?trustee ;
                 schema:result/schema:ratingValue ?trustLevel .
        }
        ORDER BY DESC(?trustLevel)
        LIMIT 10
      `;

      const trustedResults = await ctx.dkgClient.query(trustedSparql) as Array<{
        trustee?: string;
        trustLevel?: number | string;
      }>;
      const trustedProviders = (trustedResults || []).map(r => ({
        globalId: String(r.trustee || '').replace('urn:erc8004:', ''),
        trustLevel: Number(r.trustLevel || 0),
      }));

      // Query agents that trust us
      const trustingSparql = `
        PREFIX schema: <https://schema.org/>
        SELECT ?trustor ?trustLevel
        WHERE {
          ?trust a schema:EndorseAction ;
                 schema:name "TrustRelationship" ;
                 schema:object/schema:@id "urn:erc8004:${safeGlobalId}" ;
                 schema:agent/schema:@id ?trustor ;
                 schema:result/schema:ratingValue ?trustLevel .
        }
        ORDER BY DESC(?trustLevel)
        LIMIT 10
      `;

      const trustingResults = await ctx.dkgClient.query(trustingSparql) as Array<{
        trustor?: string;
        trustLevel?: number | string;
      }>;
      const trustingAgents = (trustingResults || []).map(r => ({
        globalId: String(r.trustor || '').replace('urn:erc8004:', ''),
        trustLevel: Number(r.trustLevel || 0),
      }));

      const trustNetworkSize = trustedProviders.length + trustingAgents.length;

      if (trustNetworkSize === 0) return '';

      let context = '\n[Paranet Trust Network]\n';

      if (trustedProviders.length > 0) {
        context += `Trusted providers (${trustedProviders.length}):\n`;
        context += trustedProviders.slice(0, 5).map(p =>
          `  - ${p.globalId.slice(0, 30)}... (trust: ${p.trustLevel}%)`
        ).join('\n');
        context += '\n';
      }

      if (trustingAgents.length > 0) {
        context += `Agents trusting you (${trustingAgents.length}):\n`;
        context += trustingAgents.slice(0, 5).map(p =>
          `  - ${p.globalId.slice(0, 30)}... (trust: ${p.trustLevel}%)`
        ).join('\n');
        context += '\n';
      }

      return context;
    } catch (err) {
      console.error('[Paranet Peer Provider] Error:', err);
      return '';
    }
  },
};
