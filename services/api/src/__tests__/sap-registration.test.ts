import { hashToArray, sha256 } from '@oobe-protocol-labs/synapse-sap-sdk';
import { describe, expect, it, vi } from 'vitest';
import { reconcileSapAgent } from '../sap-registration';
import { getSapRegistrationProfile } from '../sap';

function pk(value: string) {
  return {
    toBase58: () => value,
  };
}

function bn(value: string | number) {
  return {
    toString: () => String(value),
  };
}

function buildToolState(name: string, protocolId: string, description: string, inputSchema: Record<string, unknown>, outputSchema: Record<string, unknown>, category: 'data' | 'payment', paramsCount: number, requiredParams: number, isActive = true) {
  return {
    toolName: name,
    protocolHash: hashToArray(sha256(protocolId)),
    descriptionHash: hashToArray(sha256(description)),
    inputSchemaHash: hashToArray(sha256(JSON.stringify(inputSchema))),
    outputSchemaHash: hashToArray(sha256(JSON.stringify(outputSchema))),
    httpMethod: { post: {} },
    category: category === 'data' ? { data: {} } : { payment: {} },
    paramsCount,
    requiredParams,
    isActive,
  };
}

function createClientState(initial?: {
  agent?: ReturnType<typeof buildAgentState>;
  tools?: Map<string, ReturnType<typeof buildToolState>>;
}) {
  const profile = getSapRegistrationProfile('https://api.kamiyo.ai');
  const agentPda = pk('agent-pda');
  const state = {
    agent: initial?.agent ?? null,
    protocols: new Map<string, { agents: ReturnType<typeof pk>[] }>(),
    capabilities: new Map<string, { agents: ReturnType<typeof pk>[] }>(),
    categories: new Map<number, { tools: ReturnType<typeof pk>[] }>(),
    tools: initial?.tools ?? new Map<string, ReturnType<typeof buildToolState>>(),
    tx: 0,
  };

  const nextTx = (prefix: string) => `${prefix}-${++state.tx}`;

  const client = {
    agent: {
      deriveAgent: vi.fn(() => [agentPda, 255] as const),
      fetchNullable: vi.fn(async () => state.agent),
      register: vi.fn(async (args) => {
        state.agent = buildAgentState({ ...args, isActive: true });
        return nextTx('register');
      }),
      update: vi.fn(async (args) => {
        state.agent = buildAgentState({ ...args, isActive: state.agent?.isActive ?? true });
        return nextTx('update');
      }),
      reactivate: vi.fn(async () => {
        if (state.agent) {
          state.agent.isActive = true;
        }
        return nextTx('agent-reactivate');
      }),
    },
    tools: {
      deriveTool: vi.fn((_agentPda: unknown, toolName: string) => [pk(`tool-${toolName}`), 1] as const),
      fetchNullable: vi.fn(async (_agentPda: unknown, toolName: string) => state.tools.get(toolName) ?? null),
      publishByName: vi.fn(async (toolName: string, protocolId: string, description: string, inputSchema: string, outputSchema: string, _httpMethod: number, category: number, paramsCount: number, requiredParams: number) => {
        state.tools.set(
          toolName,
          buildToolState(
            toolName,
            protocolId,
            description,
            JSON.parse(inputSchema),
            JSON.parse(outputSchema),
            category === 5 ? 'data' : 'payment',
            paramsCount,
            requiredParams
          )
        );
        return nextTx(`publish-${toolName}`);
      }),
      update: vi.fn(async (toolName: string, args) => {
        const existing = state.tools.get(toolName);
        if (!existing) {
          throw new Error(`Missing tool: ${toolName}`);
        }
        existing.descriptionHash = args.descriptionHash;
        existing.inputSchemaHash = args.inputSchemaHash;
        existing.outputSchemaHash = args.outputSchemaHash;
        existing.paramsCount = args.paramsCount;
        existing.requiredParams = args.requiredParams;
        existing.httpMethod = { post: {} };
        existing.category = args.category === 5 ? { data: {} } : { payment: {} };
        return nextTx(`update-${toolName}`);
      }),
      reactivate: vi.fn(async (toolName: string) => {
        const existing = state.tools.get(toolName);
        if (existing) {
          existing.isActive = true;
        }
        return nextTx(`reactivate-${toolName}`);
      }),
    },
    indexing: {
      fetchProtocolIndexNullable: vi.fn(async (protocolId: string) => state.protocols.get(protocolId) ?? null),
      initProtocolIndex: vi.fn(async (protocolId: string) => {
        state.protocols.set(protocolId, { agents: [agentPda] });
        return nextTx(`init-protocol-${protocolId}`);
      }),
      addToProtocolIndex: vi.fn(async (protocolId: string) => {
        const current = state.protocols.get(protocolId) ?? { agents: [] };
        current.agents.push(agentPda);
        state.protocols.set(protocolId, current);
        return nextTx(`link-protocol-${protocolId}`);
      }),
      fetchCapabilityIndexNullable: vi.fn(async (capabilityId: string) => state.capabilities.get(capabilityId) ?? null),
      initCapabilityIndex: vi.fn(async (capabilityId: string) => {
        state.capabilities.set(capabilityId, { agents: [agentPda] });
        return nextTx(`init-capability-${capabilityId}`);
      }),
      addToCapabilityIndex: vi.fn(async (capabilityId: string) => {
        const current = state.capabilities.get(capabilityId) ?? { agents: [] };
        current.agents.push(agentPda);
        state.capabilities.set(capabilityId, current);
        return nextTx(`link-capability-${capabilityId}`);
      }),
      fetchToolCategoryIndexNullable: vi.fn(async (category: number) => state.categories.get(category) ?? null),
      initToolCategoryIndex: vi.fn(async (category: number) => {
        state.categories.set(category, { tools: [] });
        return nextTx(`init-category-${category}`);
      }),
      addToToolCategory: vi.fn(async (category: number, toolPda: ReturnType<typeof pk>) => {
        const current = state.categories.get(category) ?? { tools: [] };
        current.tools.push(toolPda);
        state.categories.set(category, current);
        return nextTx(`link-category-${category}`);
      }),
    },
  };

  return { client, state, profile };
}

function buildAgentState(args: {
  name: string;
  description: string;
  capabilities: ReturnType<typeof getSapRegistrationProfile>['capabilities'];
  pricing: ReturnType<typeof getSapRegistrationProfile>['pricing'];
  protocols: string[];
  agentId: string;
  agentUri: string;
  x402Endpoint: string;
  isActive: boolean;
}) {
  return {
    name: args.name,
    description: args.description,
    capabilities: args.capabilities,
    pricing: args.pricing.map((tier) => ({
      ...tier,
      pricePerCall: bn(tier.pricePerCall.toString()),
      minPricePerCall: tier.minPricePerCall ? bn(tier.minPricePerCall.toString()) : null,
      maxPricePerCall: tier.maxPricePerCall ? bn(tier.maxPricePerCall.toString()) : null,
      minEscrowDeposit: tier.minEscrowDeposit ? bn(tier.minEscrowDeposit.toString()) : null,
      volumeCurve: tier.volumeCurve?.map((point) => ({
        afterCalls: point.afterCalls,
        pricePerCall: bn(point.pricePerCall.toString()),
      })) ?? null,
    })),
    protocols: args.protocols,
    agentId: args.agentId,
    agentUri: args.agentUri,
    x402Endpoint: args.x402Endpoint,
    isActive: args.isActive,
  };
}

describe('SAP registration reconcile', () => {
  it('registers the agent and publishes the tool set on the first run', async () => {
    const { client } = createClientState();

    const result = await reconcileSapAgent(client as never, 'https://api.kamiyo.ai');

    expect(result.agent.action).toBe('registered');
    expect(result.tools.published).toEqual([
      'x402_check_pricing',
      'x402_fetch',
      'create_escrow',
      'check_escrow_status',
    ]);
    expect(result.discovery.protocolsInitialized).toEqual(['sap', 'kamiyo', 'x402']);
    expect(result.discovery.capabilitiesInitialized).toHaveLength(4);
    expect(result.discovery.categoriesInitialized).toEqual([5, 4]);
    expect(result.discovery.categoriesLinked).toEqual([
      'x402_check_pricing',
      'x402_fetch',
      'create_escrow',
      'check_escrow_status',
    ]);
  });

  it('is idempotent on the second run', async () => {
    const { client } = createClientState();

    await reconcileSapAgent(client as never, 'https://api.kamiyo.ai');
    const result = await reconcileSapAgent(client as never, 'https://api.kamiyo.ai');

    expect(result.agent.action).toBe('unchanged');
    expect(result.agent.reactivated).toBe(false);
    expect(result.tools.published).toEqual([]);
    expect(result.tools.updated).toEqual([]);
    expect(result.tools.reactivated).toEqual([]);
    expect(result.tools.unchanged).toEqual([
      'x402_check_pricing',
      'x402_fetch',
      'create_escrow',
      'check_escrow_status',
    ]);
  });

  it('updates stale state and reactivates disabled agent/tools', async () => {
    const profile = getSapRegistrationProfile('https://api.kamiyo.ai');
    const staleTools = new Map<string, ReturnType<typeof buildToolState>>();
    staleTools.set(
      'create_escrow',
      buildToolState(
        'create_escrow',
        'kamiyo',
        'stale-description',
        { type: 'object', properties: { stale: { type: 'boolean' } }, required: [] },
        { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
        'payment',
        1,
        0,
        false
      )
    );

    const { client } = createClientState({
      agent: buildAgentState({
        ...profile,
        description: 'stale-description',
        x402Endpoint: 'https://stale.example/api/sap/execute',
        isActive: false,
      }),
      tools: staleTools,
    });

    const result = await reconcileSapAgent(client as never, 'https://api.kamiyo.ai');

    expect(result.agent.action).toBe('updated');
    expect(result.agent.reactivated).toBe(true);
    expect(result.tools.updated).toContain('create_escrow');
    expect(result.tools.reactivated).toContain('create_escrow');
  });
});
