#!/usr/bin/env node
/*
 * KAMIYO Agent Collaboration MCP Server
 *
 * Exposes ZK-private agent coordination via Model Context Protocol.
 * Enables AI agents to collaborate without revealing their owners.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import {
  AgentCollabClient,
  AgentCollabProver,
  MerkleTree,
  createMerkleTree,
  generateOwnerSecret,
  generateRegistrationSecret,
  generateAgentId,
  generateRandomSalt,
} from '@kamiyo/agent-collab';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Server Configuration
// ============================================================================

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY;
const STATE_FILE = process.env.KAMIYO_STATE_FILE || path.join(process.env.HOME || '.', '.kamiyo-agent-state.json');

// ============================================================================
// Rate Limiting
// ============================================================================

interface RateLimitConfig {
  maxCalls: number;
  windowMs: number;
}

const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  init_agent: { maxCalls: 5, windowMs: 60000 },
  register_agent: { maxCalls: 3, windowMs: 60000 },
  submit_signal: { maxCalls: 10, windowMs: 60000 },
  create_swarm_action: { maxCalls: 5, windowMs: 60000 },
  vote_swarm_action: { maxCalls: 10, windowMs: 60000 },
  get_registry_status: { maxCalls: 30, windowMs: 60000 },
  get_agent_status: { maxCalls: 30, windowMs: 60000 },
  request_withdrawal: { maxCalls: 3, windowMs: 60000 },
  get_withdrawal_status: { maxCalls: 30, windowMs: 60000 },
  get_aggregator_status: { maxCalls: 30, windowMs: 60000 },
};

class RateLimiter {
  private calls: Map<string, number[]> = new Map();
  private limits: Record<string, RateLimitConfig>;

  constructor(limits: Record<string, RateLimitConfig> = DEFAULT_RATE_LIMITS) {
    this.limits = limits;
  }

  check(tool: string): { allowed: boolean; retryAfterMs?: number } {
    const config = this.limits[tool];
    if (!config) return { allowed: true };

    const now = Date.now();
    const windowStart = now - config.windowMs;

    let toolCalls = this.calls.get(tool) || [];
    toolCalls = toolCalls.filter(t => t > windowStart);

    if (toolCalls.length >= config.maxCalls) {
      const oldestCall = toolCalls[0];
      const retryAfterMs = oldestCall + config.windowMs - now;
      return { allowed: false, retryAfterMs };
    }

    toolCalls.push(now);
    this.calls.set(tool, toolCalls);
    return { allowed: true };
  }

  reset(tool?: string): void {
    if (tool) {
      this.calls.delete(tool);
    } else {
      this.calls.clear();
    }
  }
}

const rateLimiter = new RateLimiter();

interface AgentState {
  ownerSecret: string; // hex encoded
  agentId: string; // hex encoded
  registrationSecret: string; // hex encoded
  identityCommitment: string; // hex encoded
  registered: boolean;
  leafIndex: number | null;
}

interface ServerState {
  agentState: AgentState | null;
  merkleTreeData: string | null;
}

let agentState: AgentState | null = null;
let client: AgentCollabClient | null = null;
let prover: AgentCollabProver | null = null;
let merkleTree: MerkleTree | null = null;

// ============================================================================
// State Persistence
// ============================================================================

function loadState(): void {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf-8');
      const state: ServerState = JSON.parse(data);
      agentState = state.agentState;
      if (state.merkleTreeData) {
        MerkleTree.deserialize(state.merkleTreeData).then(tree => {
          merkleTree = tree;
        });
      }
    }
  } catch {
    // Ignore errors, start fresh
  }
}

function saveState(): void {
  try {
    const state: ServerState = {
      agentState,
      merkleTreeData: merkleTree ? merkleTree.serialize() : null,
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error('Failed to save state:', err);
  }
}

// ============================================================================
// MCP Server Setup
// ============================================================================

const server = new Server(
  {
    name: 'kamiyo-agent-collab',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ============================================================================
// Tool Definitions
// ============================================================================

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'init_agent',
      description: 'Initialize a new private agent identity. Creates cryptographic secrets for ZK proofs.',
      inputSchema: {
        type: 'object',
        properties: {
          nonce: {
            type: 'number',
            description: 'Optional nonce for deterministic agent ID generation',
          },
        },
      },
    },
    {
      name: 'register_agent',
      description: 'Register the agent on-chain with stake. Required before submitting signals.',
      inputSchema: {
        type: 'object',
        properties: {
          stakeAmount: {
            type: 'number',
            description: 'Amount of lamports to stake',
          },
        },
        required: ['stakeAmount'],
      },
    },
    {
      name: 'submit_signal',
      description: 'Submit a private trading signal with ZK proof. Signal content is hidden.',
      inputSchema: {
        type: 'object',
        properties: {
          signalType: {
            type: 'number',
            description: 'Type of signal (0=price, 1=volume, 2=sentiment)',
          },
          direction: {
            type: 'number',
            description: 'Direction (0=short, 1=long, 2=neutral)',
          },
          confidence: {
            type: 'number',
            minimum: 0,
            maximum: 100,
            description: 'Confidence level 0-100',
          },
          magnitude: {
            type: 'number',
            minimum: 0,
            maximum: 100,
            description: 'Signal strength 0-100',
          },
        },
        required: ['signalType', 'direction', 'confidence', 'magnitude'],
      },
    },
    {
      name: 'create_swarm_action',
      description: 'Propose a coordinated action for the agent swarm to vote on.',
      inputSchema: {
        type: 'object',
        properties: {
          actionType: {
            type: 'number',
            description: 'Type of action (numeric)',
          },
          actionData: {
            type: 'string',
            description: 'Action details (will be hashed)',
          },
          threshold: {
            type: 'number',
            minimum: 1,
            maximum: 100,
            description: 'Required approval percentage',
          },
        },
        required: ['actionType', 'actionData', 'threshold'],
      },
    },
    {
      name: 'vote_swarm_action',
      description: 'Cast a private vote on a swarm action proposal.',
      inputSchema: {
        type: 'object',
        properties: {
          actionHash: {
            type: 'string',
            description: 'Hex-encoded action hash to vote on',
          },
          vote: {
            type: 'boolean',
            description: 'True for approve, false for reject',
          },
        },
        required: ['actionHash', 'vote'],
      },
    },
    {
      name: 'get_registry_status',
      description: 'Get current status of the agent collaboration registry.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'get_agent_status',
      description: 'Get status of the current agent identity.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'request_withdrawal',
      description: 'Request withdrawal of staked tokens. Starts 24-hour timelock.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'get_withdrawal_status',
      description: 'Check status of pending withdrawal request.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'get_aggregator_status',
      description: 'Get aggregated signal statistics for current epoch.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
  ],
}));

// ============================================================================
// Tool Handlers
// ============================================================================

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Rate limit check
  const rateCheck = rateLimiter.check(name);
  if (!rateCheck.allowed) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'rate_limited',
            message: `Too many calls to ${name}. Retry after ${Math.ceil((rateCheck.retryAfterMs || 0) / 1000)}s`,
            retryAfterMs: rateCheck.retryAfterMs,
          }),
        },
      ],
      isError: true,
    };
  }

  try {
    switch (name) {
      case 'init_agent':
        return await handleInitAgent(args?.nonce as number | undefined);

      case 'register_agent':
        return await handleRegisterAgent(args?.stakeAmount as number);

      case 'submit_signal':
        return await handleSubmitSignal(
          args?.signalType as number,
          args?.direction as number,
          args?.confidence as number,
          args?.magnitude as number
        );

      case 'create_swarm_action':
        return await handleCreateSwarmAction(
          args?.actionType as number,
          args?.actionData as string,
          args?.threshold as number
        );

      case 'vote_swarm_action':
        return await handleVoteSwarmAction(
          args?.actionHash as string,
          args?.vote as boolean
        );

      case 'get_registry_status':
        return await handleGetRegistryStatus();

      case 'get_agent_status':
        return await handleGetAgentStatus();

      case 'request_withdrawal':
        return await handleRequestWithdrawal();

      case 'get_withdrawal_status':
        return await handleGetWithdrawalStatus();

      case 'get_aggregator_status':
        return await handleGetAggregatorStatus();

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// ============================================================================
// Handler Implementations
// ============================================================================

async function handleInitAgent(nonce?: number) {
  const ownerSecret = generateOwnerSecret();
  const registrationSecret = generateRegistrationSecret();
  const ownerPubkey = getWallet().publicKey.toBytes();
  const agentId = await generateAgentId(ownerPubkey, nonce ?? Date.now());
  const identityCommitment = await AgentCollabProver.generateIdentityCommitment(
    ownerSecret,
    agentId,
    registrationSecret
  );

  agentState = {
    ownerSecret: Buffer.from(ownerSecret).toString('hex'),
    agentId: Buffer.from(agentId).toString('hex'),
    registrationSecret: Buffer.from(registrationSecret).toString('hex'),
    identityCommitment: Buffer.from(identityCommitment).toString('hex'),
    registered: false,
    leafIndex: null,
  };

  prover = new AgentCollabProver();

  // Initialize merkle tree if not exists
  if (!merkleTree) {
    merkleTree = await createMerkleTree();
  }

  saveState();

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          status: 'initialized',
          identityCommitment: agentState.identityCommitment,
          message: 'Agent identity created. Call register_agent to stake and activate.',
        }),
      },
    ],
  };
}

async function handleRegisterAgent(stakeAmount: number) {
  ensureInitialized();
  await ensureClient();

  const wallet = getWallet();
  const identityCommitment = Buffer.from(agentState!.identityCommitment, 'hex');

  const tx = await client!.registerAgent(
    wallet,
    new Uint8Array(identityCommitment),
    new BN(stakeAmount)
  );

  // Add to merkle tree
  if (merkleTree) {
    const leafIndex = await merkleTree.addLeaf(new Uint8Array(identityCommitment));
    agentState!.leafIndex = leafIndex;
  }

  agentState!.registered = true;
  saveState();

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          status: 'registered',
          transaction: tx,
          stake: stakeAmount,
          leafIndex: agentState!.leafIndex,
        }),
      },
    ],
  };
}

async function handleSubmitSignal(
  signalType: number,
  direction: number,
  confidence: number,
  magnitude: number
) {
  ensureInitialized();
  ensureRegistered();
  await ensureClient();

  const registry = await client!.getRegistry();
  if (!registry) throw new Error('Registry not initialized');

  const epoch = registry.epoch.toNumber();

  // Generate identity proof first to get nullifier
  const { proof: identityProof, nullifier } = await prover!.proveAgentIdentity(
    {
      ownerSecret: Buffer.from(agentState!.ownerSecret, 'hex'),
      agentId: Buffer.from(agentState!.agentId, 'hex'),
      registrationSecret: Buffer.from(agentState!.registrationSecret, 'hex'),
      merkleProof: await getMerkleProof(),
      merklePathIndices: await getMerklePathIndices(),
    },
    new Uint8Array(registry.agentsRoot),
    BigInt(epoch)
  );

  // Generate signal proof
  const secret = generateRandomSalt();
  const { proof: signalProof, signalCommitment } = await prover!.provePrivateSignal(
    {
      signalType,
      direction,
      confidence,
      magnitude,
      stakeAmount: BigInt(0), // Would get from agent account
      secret,
    },
    nullifier,
    BigInt(registry.minStake.toString()),
    registry.minSignalConfidence
  );

  const wallet = getWallet();
  const tx = await client!.submitSignal(
    wallet,
    identityProof,
    nullifier,
    signalCommitment
  );

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          status: 'submitted',
          transaction: tx,
          signalType,
          direction,
          confidence,
          magnitude,
          commitment: Buffer.from(signalCommitment).toString('hex'),
        }),
      },
    ],
  };
}

async function handleCreateSwarmAction(
  actionType: number,
  actionData: string,
  threshold: number
) {
  ensureInitialized();
  ensureRegistered();
  await ensureClient();

  const registry = await client!.getRegistry();
  if (!registry) throw new Error('Registry not initialized');

  const epoch = registry.epoch.toNumber();
  const actionDataBytes = new TextEncoder().encode(actionData);
  const actionHash = await AgentCollabProver.generateActionHash(
    actionType,
    actionDataBytes
  );

  const { proof, nullifier } = await prover!.proveAgentIdentity(
    {
      ownerSecret: Buffer.from(agentState!.ownerSecret, 'hex'),
      agentId: Buffer.from(agentState!.agentId, 'hex'),
      registrationSecret: Buffer.from(agentState!.registrationSecret, 'hex'),
      merkleProof: await getMerkleProof(),
      merklePathIndices: await getMerklePathIndices(),
    },
    new Uint8Array(registry.agentsRoot),
    BigInt(epoch)
  );

  const wallet = getWallet();
  const tx = await client!.createSwarmAction(
    wallet,
    proof,
    nullifier,
    actionHash,
    threshold
  );

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          status: 'created',
          transaction: tx,
          actionHash: Buffer.from(actionHash).toString('hex'),
          threshold,
        }),
      },
    ],
  };
}

async function handleVoteSwarmAction(actionHashHex: string, vote: boolean) {
  ensureInitialized();
  ensureRegistered();
  await ensureClient();

  const registry = await client!.getRegistry();
  if (!registry) throw new Error('Registry not initialized');

  const actionHash = Buffer.from(actionHashHex, 'hex');
  const voteSalt = generateRandomSalt();

  const { proof, voteNullifier, voteCommitment } = await prover!.proveSwarmVote(
    {
      ownerSecret: Buffer.from(agentState!.ownerSecret, 'hex'),
      agentId: Buffer.from(agentState!.agentId, 'hex'),
      registrationSecret: Buffer.from(agentState!.registrationSecret, 'hex'),
      merkleProof: await getMerkleProof(),
      merklePathIndices: await getMerklePathIndices(),
      vote,
      voteSalt,
    },
    new Uint8Array(registry.agentsRoot),
    new Uint8Array(actionHash)
  );

  const wallet = getWallet();
  const tx = await client!.voteSwarmAction(
    wallet,
    proof,
    voteNullifier,
    new Uint8Array(actionHash),
    vote
  );

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          status: 'voted',
          transaction: tx,
          vote,
        }),
      },
    ],
  };
}

async function handleGetRegistryStatus() {
  await ensureClient();
  const registry = await client!.getRegistry();

  if (!registry) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ status: 'not_initialized' }) }],
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          status: 'active',
          paused: registry.paused,
          epoch: registry.epoch.toString(),
          agentCount: registry.agentCount,
          signalCount: registry.signalCount,
          minStake: registry.minStake.toString(),
        }),
      },
    ],
  };
}

async function handleGetAgentStatus() {
  if (!agentState) {
    return {
      content: [
        { type: 'text', text: JSON.stringify({ status: 'not_initialized' }) },
      ],
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          status: agentState.registered ? 'registered' : 'initialized',
          identityCommitment: agentState.identityCommitment,
          leafIndex: agentState.leafIndex,
        }),
      },
    ],
  };
}

async function handleRequestWithdrawal() {
  ensureInitialized();
  ensureRegistered();
  await ensureClient();

  const wallet = getWallet();
  const identityCommitment = Buffer.from(agentState!.identityCommitment, 'hex');

  const tx = await client!.requestWithdrawal(
    wallet,
    new Uint8Array(identityCommitment)
  );

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          status: 'withdrawal_requested',
          transaction: tx,
          message: 'Stake will be available for claim after 24-hour timelock',
        }),
      },
    ],
  };
}

async function handleGetWithdrawalStatus() {
  ensureInitialized();
  await ensureClient();

  const identityCommitment = Buffer.from(agentState!.identityCommitment, 'hex');
  const withdrawal = await client!.getWithdrawal(new Uint8Array(identityCommitment));

  if (!withdrawal) {
    return {
      content: [
        { type: 'text', text: JSON.stringify({ status: 'no_pending_withdrawal' }) },
      ],
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          status: withdrawal.claimed ? 'claimed' : 'pending',
          amount: withdrawal.amount.toString(),
          requestSlot: withdrawal.requestSlot.toString(),
          unlockSlot: withdrawal.unlockSlot.toString(),
          claimed: withdrawal.claimed,
        }),
      },
    ],
  };
}

async function handleGetAggregatorStatus() {
  await ensureClient();

  const registry = await client!.getRegistry();
  if (!registry) {
    return {
      content: [
        { type: 'text', text: JSON.stringify({ status: 'registry_not_initialized' }) },
      ],
    };
  }

  const aggregator = await client!.getAggregator(registry.epoch);
  if (!aggregator) {
    return {
      content: [
        { type: 'text', text: JSON.stringify({ status: 'aggregator_not_initialized', epoch: registry.epoch.toString() }) },
      ],
    };
  }

  const totalDirectional = aggregator.longCount + aggregator.shortCount + aggregator.neutralCount;
  const avgConfidence = totalDirectional > 0 ? aggregator.totalConfidence / totalDirectional : 0;
  const avgMagnitude = totalDirectional > 0 ? aggregator.totalMagnitude / totalDirectional : 0;

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          status: 'active',
          epoch: aggregator.epoch.toString(),
          totalSignals: aggregator.totalSignals,
          longCount: aggregator.longCount,
          shortCount: aggregator.shortCount,
          neutralCount: aggregator.neutralCount,
          avgConfidence: Math.round(avgConfidence),
          avgMagnitude: Math.round(avgMagnitude),
          sentiment: aggregator.longCount > aggregator.shortCount ? 'bullish' :
                     aggregator.shortCount > aggregator.longCount ? 'bearish' : 'neutral',
        }),
      },
    ],
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

function getWallet(): Keypair {
  if (!PRIVATE_KEY) {
    throw new Error('SOLANA_PRIVATE_KEY not set');
  }
  return Keypair.fromSecretKey(Buffer.from(JSON.parse(PRIVATE_KEY)));
}

async function ensureClient() {
  if (!client) {
    const connection = new Connection(RPC_URL);
    const wallet = new Wallet(getWallet());
    const provider = new AnchorProvider(connection, wallet, {});
    client = new AgentCollabClient(provider);
  }
}

function ensureInitialized() {
  if (!agentState) {
    throw new Error('Agent not initialized. Call init_agent first.');
  }
}

function ensureRegistered() {
  if (!agentState?.registered) {
    throw new Error('Agent not registered. Call register_agent first.');
  }
}

async function getMerkleProof(): Promise<Uint8Array[]> {
  if (!merkleTree || agentState?.leafIndex === null || agentState?.leafIndex === undefined) {
    // Return empty proof for now (tree depth 20 requires 20 elements)
    return Array(20).fill(new Uint8Array(32));
  }

  const { proof } = await merkleTree.generateProof(agentState.leafIndex);
  return proof;
}

async function getMerklePathIndices(): Promise<number[]> {
  if (!merkleTree || agentState?.leafIndex === null || agentState?.leafIndex === undefined) {
    // Return zero path indices for empty tree
    return Array(20).fill(0);
  }

  const { pathIndices } = await merkleTree.generateProof(agentState.leafIndex);
  return pathIndices;
}

// ============================================================================
// Server Startup
// ============================================================================

async function main() {
  loadState();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('KAMIYO Agent Collaboration MCP Server running');
}

main().catch(console.error);
