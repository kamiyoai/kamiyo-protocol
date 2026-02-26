// MCP Tools Registry

export * from './escrow.js';
export * from './quality.js';
export * from './dispute.js';
export * from './truth-court.js';
export * from './reputation.js';
export * from './unified.js';
export * from './x402.js';
export * from './market.js';
export * from './search.js';
export * from './paranet.js';
export * from './dkg-quality.js';
export * from './kamino.js';
export * from './fundry.js';
export * from './cdp.js';
export * from './elfa.js';

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MARKET_TOOL_DEFINITIONS } from './market.js';
import { SEARCH_TOOL_DEFINITIONS } from './search.js';
import { PARANET_TOOLS } from './paranet.js';
import { FUNDRY_TOOL_DEFINITIONS } from './fundry.js';
import { ELFA_TOOL_DEFINITIONS } from './elfa.js';
import { DKG_QUALITY_TOOLS } from './dkg-quality.js';
import { KAMINO_TOOL_DEFINITIONS } from './kamino.js';
import { CDP_TOOL_DEFINITIONS } from './cdp.js';

export const TOOL_DEFINITIONS: Tool[] = [
  {
    name: 'create_escrow',
    description: 'Create payment escrow with quality guarantee',
    inputSchema: {
      type: 'object',
      properties: {
        api: { type: 'string', description: 'API provider wallet' },
        amount: { type: 'number', description: 'Amount in SOL (min 0.001)' },
        timeLock: { type: 'number', description: 'Expiry in seconds (default 3600, max 2592000)' },
        adjudicationProvider: {
          type: 'string',
          description: 'Optional dispute adjudicator preference: openclaw, nanoclaw, or ironclaw',
        },
      },
      required: ['api', 'amount'],
    },
  },
  {
    name: 'check_escrow_status',
    description: 'Check escrow status',
    inputSchema: {
      type: 'object',
      properties: {
        escrowAddress: { type: 'string', description: 'Escrow PDA' },
        transactionId: { type: 'string', description: 'Transaction ID' },
      },
    },
  },
  {
    name: 'verify_payment',
    description: 'Verify escrow payment received',
    inputSchema: {
      type: 'object',
      properties: {
        transactionId: { type: 'string', description: 'Transaction ID' },
      },
      required: ['transactionId'],
    },
  },
  {
    name: 'assess_data_quality',
    description: 'Assess API response quality (0-100)',
    inputSchema: {
      type: 'object',
      properties: {
        apiResponse: { type: 'object', description: 'Response to assess' },
        expectedCriteria: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields to check (e.g. ["data.name", "data.price"])',
        },
      },
      required: ['apiResponse', 'expectedCriteria'],
    },
  },
  {
    name: 'estimate_refund',
    description: 'Calculate refund from quality score',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Original amount in SOL' },
        qualityScore: { type: 'number', description: 'Score (0-100)' },
      },
      required: ['amount', 'qualityScore'],
    },
  },
  {
    name: 'file_dispute',
    description: 'File dispute for poor quality data',
    inputSchema: {
      type: 'object',
      properties: {
        transactionId: { type: 'string', description: 'Escrow transaction ID' },
        qualityScore: { type: 'number', description: 'Score (0-100)' },
        refundPercentage: { type: 'number', description: 'Refund %' },
        evidence: { type: 'object', description: 'Supporting evidence' },
        adjudicationProvider: {
          type: 'string',
          description: 'Optional truth-court adjudicator preference: openclaw, nanoclaw, or ironclaw',
        },
        claimant: {
          type: 'string',
          description: 'Optional claimant wallet or agent id (defaults to configured agent wallet)',
        },
        respondent: {
          type: 'string',
          description: 'Optional respondent wallet or agent id',
        },
        missionTag: {
          type: 'string',
          description: 'Optional mission/scenario tag for truth-court context',
        },
        context: {
          type: 'string',
          description: 'Optional extra context for truth-court adjudication',
        },
      },
      required: ['transactionId', 'qualityScore', 'refundPercentage', 'evidence'],
    },
  },
  {
    name: 'file_dispute_truth_court',
    description:
      'Run multi-oracle dispute review (xAI/OpenClaw/NanoClaw/IronClaw when configured), emit replayable hashes, and optionally mark dispute on-chain.',
    inputSchema: {
      type: 'object',
      properties: {
        transactionId: { type: 'string', description: 'Escrow transaction ID' },
        qualityScore: { type: 'number', description: 'Score (0-100)' },
        refundPercentage: { type: 'number', description: 'Requested refund % (0-100)' },
        claimant: { type: 'string', description: 'Claimant wallet or agent id' },
        respondent: { type: 'string', description: 'Respondent wallet or agent id' },
        missionTag: { type: 'string', description: 'Scenario tag (e.g. mars_ops_power_grid)' },
        evidence: { type: 'object', description: 'Evidence payload for the case' },
        featureVector: { type: 'object', description: 'Fixed features for deterministic replay' },
        context: { type: 'string', description: 'Optional dispute context for analysis' },
        markOnChain: {
          type: 'boolean',
          description: 'Submit dispute status on-chain after committee verdict (default true)',
        },
        minValidResponses: {
          type: 'number',
          description: 'Minimum valid oracle responses required for quorum (default 2)',
        },
        includeGrok: {
          type: 'boolean',
          description: 'Include xAI Grok oracle when configured (default auto)',
        },
        includeOpenClaw: {
          type: 'boolean',
          description: 'Include OpenClaw oracle when configured (default auto)',
        },
        includeNanoClaw: {
          type: 'boolean',
          description: 'Include NanoClaw oracle when configured (default auto)',
        },
        includeIronClaw: {
          type: 'boolean',
          description: 'Include IronClaw oracle when configured (default auto)',
        },
      },
      required: [
        'transactionId',
        'qualityScore',
        'refundPercentage',
        'claimant',
        'evidence',
        'featureVector',
      ],
    },
  },
  {
    name: 'run_truth_court_gauntlet',
    description:
      'Run deterministic multi-round truth-court stress campaign with replay/tamper/counterfactual metrics and integrity root.',
    inputSchema: {
      type: 'object',
      properties: {
        rounds: { type: 'number', description: 'Number of rounds (default 12, max 100)' },
        seed: { type: 'number', description: 'Deterministic seed for reproducible runs' },
        scenarioMix: {
          type: 'array',
          items: { type: 'string' },
          description: 'Scenario mix (e.g. ["habitat-power","launch-anomaly"])',
        },
        counterfactualsPerRound: {
          type: 'number',
          description: 'Counterfactual probes per round (default 2, max 8)',
        },
        claimant: { type: 'string', description: 'Claimant agent id (default agent-red)' },
        respondent: { type: 'string', description: 'Respondent agent id (default agent-blue)' },
        includeGrok: {
          type: 'boolean',
          description: 'Force Grok inclusion when available (default auto)',
        },
        includeOpenClaw: {
          type: 'boolean',
          description: 'Force OpenClaw inclusion when available (default auto)',
        },
        includeNanoClaw: {
          type: 'boolean',
          description: 'Force NanoClaw inclusion when available (default auto)',
        },
        includeIronClaw: {
          type: 'boolean',
          description: 'Force IronClaw inclusion when available (default auto)',
        },
        policyMode: {
          type: 'string',
          enum: ['default', 'strict'],
          description: 'strict requires committee diversity and stronger quorum guarantees',
        },
        minValidResponses: {
          type: 'number',
          description: 'Minimum valid oracle responses for quorum (default 2)',
        },
      },
    },
  },
  {
    name: 'get_api_reputation',
    description: 'Get API provider reputation',
    inputSchema: {
      type: 'object',
      properties: {
        apiProvider: { type: 'string', description: 'Provider wallet' },
      },
      required: ['apiProvider'],
    },
  },
  {
    name: 'call_api_with_escrow',
    description: 'Create escrow, call API, assess quality, auto-dispute if needed',
    inputSchema: {
      type: 'object',
      properties: {
        apiUrl: { type: 'string', description: 'API endpoint' },
        apiProvider: { type: 'string', description: 'Provider wallet' },
        amount: { type: 'number', description: 'Amount in SOL' },
        expectedCriteria: { type: 'array', items: { type: 'string' }, description: 'Expected fields' },
        timeLock: { type: 'number', description: 'Expiry in seconds (default 3600)' },
        autoDispute: { type: 'boolean', description: 'Auto-dispute if low quality (default true)' },
        qualityThreshold: { type: 'number', description: 'Threshold for auto-dispute (default 50)' },
        adjudicationProvider: {
          type: 'string',
          description: 'Optional truth-court adjudicator preference for auto-disputes: openclaw, nanoclaw, or ironclaw',
        },
      },
      required: ['apiUrl', 'apiProvider', 'amount'],
    },
  },
  {
    name: 'x402_check_pricing',
    description: 'Check x402 endpoint pricing',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Endpoint URL' },
        adjudicationProvider: {
          type: 'string',
          description: 'Optional policy review provider tag: openclaw, nanoclaw, or ironclaw',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'x402_fetch',
    description: 'Fetch from x402 endpoint with auto USDC payment (Base/Solana/Polygon/Arbitrum)',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Endpoint URL' },
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'], description: 'HTTP method (default GET)' },
        body: { type: 'string', description: 'JSON body for POST/PUT' },
        headers: { type: 'object', description: 'Additional headers' },
        adjudicationProvider: {
          type: 'string',
          description: 'Optional policy review provider tag: openclaw, nanoclaw, or ironclaw',
        },
      },
      required: ['url'],
    },
  },
  // Market data tools
  ...MARKET_TOOL_DEFINITIONS,
  // Web search tools
  ...SEARCH_TOOL_DEFINITIONS,
  // Agent Paranet tools
  ...PARANET_TOOLS,
  // DKG quality tools
  ...DKG_QUALITY_TOOLS,
  // Kamino vault tools
  ...KAMINO_TOOL_DEFINITIONS,
  // Coinbase CDP tools
  ...CDP_TOOL_DEFINITIONS,
  // Fundry trusted launch tools
  ...FUNDRY_TOOL_DEFINITIONS,
  // Elfa trusted trader tools
  ...ELFA_TOOL_DEFINITIONS,
];
