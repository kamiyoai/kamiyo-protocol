import type { PublicKey } from '@solana/web3.js';
import { HTTP_METHOD_VALUES, TOOL_CATEGORY_VALUES, hashToArray, sha256 } from '@oobe-protocol-labs/synapse-sap-sdk';
import { getSapRegistrationProfile, type SapToolProfile } from './sap';

type PublicKeyLike = PublicKey | { toBase58(): string };

interface AgentAccountLike {
  name: string;
  description: string;
  agentId: string | null;
  agentUri: string | null;
  x402Endpoint: string | null;
  isActive: boolean;
  capabilities: Array<{
    id: string;
    description: string | null;
    protocolId: string | null;
    version: string | null;
  }>;
  pricing: Array<{
    tierId: string;
    pricePerCall: { toString(): string };
    minPricePerCall: { toString(): string } | null;
    maxPricePerCall: { toString(): string } | null;
    rateLimit: number;
    maxCallsPerSession: number;
    burstLimit: number | null;
    tokenType: Record<string, unknown>;
    tokenMint: PublicKeyLike | null;
    tokenDecimals: number | null;
    settlementMode: Record<string, unknown> | null;
    minEscrowDeposit: { toString(): string } | null;
    batchIntervalSec: number | null;
    volumeCurve: Array<{ afterCalls: number; pricePerCall: { toString(): string } }> | null;
  }>;
  protocols: string[];
}

interface ToolDescriptorLike {
  toolName: string;
  protocolHash: number[];
  descriptionHash: number[];
  inputSchemaHash: number[];
  outputSchemaHash: number[];
  httpMethod: Record<string, unknown>;
  category: Record<string, unknown>;
  paramsCount: number;
  requiredParams: number;
  isActive: boolean;
}

interface ProtocolIndexLike {
  agents: PublicKeyLike[];
}

interface CapabilityIndexLike {
  agents: PublicKeyLike[];
}

interface ToolCategoryIndexLike {
  tools: PublicKeyLike[];
}

export interface SapRegistrationClient {
  agent: {
    deriveAgent(): readonly [PublicKeyLike, number];
    fetchNullable(): Promise<AgentAccountLike | null>;
    register(args: {
      name: string;
      description: string;
      capabilities: AgentAccountLike['capabilities'];
      pricing: AgentAccountLike['pricing'];
      protocols: string[];
      agentId: string;
      agentUri: string;
      x402Endpoint: string;
    }): Promise<string>;
    update(args: {
      name: string;
      description: string;
      capabilities: AgentAccountLike['capabilities'];
      pricing: AgentAccountLike['pricing'];
      protocols: string[];
      agentId: string;
      agentUri: string;
      x402Endpoint: string;
    }): Promise<string>;
    reactivate(): Promise<string>;
  };
  tools: {
    deriveTool(agentPda: PublicKeyLike, toolName: string): readonly [PublicKeyLike, number];
    fetchNullable(agentPda: PublicKeyLike, toolName: string): Promise<ToolDescriptorLike | null>;
    publishByName(
      toolName: string,
      protocolId: string,
      description: string,
      inputSchema: string,
      outputSchema: string,
      httpMethod: number,
      category: number,
      paramsCount: number,
      requiredParams: number,
      isCompound: boolean
    ): Promise<string>;
    update(toolName: string, args: {
      descriptionHash: number[];
      inputSchemaHash: number[];
      outputSchemaHash: number[];
      httpMethod: number;
      category: number;
      paramsCount: number;
      requiredParams: number;
    }): Promise<string>;
    reactivate(toolName: string): Promise<string>;
  };
  indexing: {
    fetchProtocolIndexNullable(protocolId: string): Promise<ProtocolIndexLike | null>;
    initProtocolIndex(protocolId: string): Promise<string>;
    addToProtocolIndex(protocolId: string): Promise<string>;
    fetchCapabilityIndexNullable(capabilityId: string): Promise<CapabilityIndexLike | null>;
    initCapabilityIndex(capabilityId: string): Promise<string>;
    addToCapabilityIndex(capabilityId: string): Promise<string>;
    fetchToolCategoryIndexNullable(category: number): Promise<ToolCategoryIndexLike | null>;
    initToolCategoryIndex(category: number): Promise<string>;
    addToToolCategory(category: number, toolPda: PublicKeyLike): Promise<string>;
  };
}

export interface SapReconciliationResult {
  agent: {
    action: 'registered' | 'updated' | 'unchanged';
    reactivated: boolean;
    transactions: string[];
  };
  discovery: {
    protocolsInitialized: string[];
    protocolsLinked: string[];
    capabilitiesInitialized: string[];
    capabilitiesLinked: string[];
    categoriesInitialized: number[];
    categoriesLinked: string[];
  };
  tools: {
    published: string[];
    updated: string[];
    reactivated: string[];
    unchanged: string[];
  };
}

function publicKeyString(value: PublicKeyLike): string {
  return value.toBase58();
}

function enumKey(value: Record<string, unknown> | null | undefined): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const [key] = Object.keys(value);
  return key || null;
}

function arraysEqual(left: number[], right: number[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function normalizeCapabilities(capabilities: AgentAccountLike['capabilities']) {
  return [...capabilities]
    .map((capability) => ({
      id: capability.id,
      description: capability.description,
      protocolId: capability.protocolId,
      version: capability.version,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function normalizePricing(pricing: AgentAccountLike['pricing']) {
  return [...pricing]
    .map((tier) => ({
      tierId: tier.tierId,
      pricePerCall: tier.pricePerCall.toString(),
      minPricePerCall: tier.minPricePerCall?.toString() ?? null,
      maxPricePerCall: tier.maxPricePerCall?.toString() ?? null,
      rateLimit: tier.rateLimit,
      maxCallsPerSession: tier.maxCallsPerSession,
      burstLimit: tier.burstLimit,
      tokenType: enumKey(tier.tokenType),
      tokenMint: tier.tokenMint ? publicKeyString(tier.tokenMint) : null,
      tokenDecimals: tier.tokenDecimals,
      settlementMode: enumKey(tier.settlementMode),
      minEscrowDeposit: tier.minEscrowDeposit?.toString() ?? null,
      batchIntervalSec: tier.batchIntervalSec,
      volumeCurve: tier.volumeCurve?.map((point) => ({
        afterCalls: point.afterCalls,
        pricePerCall: point.pricePerCall.toString(),
      })) ?? null,
    }))
    .sort((left, right) => left.tierId.localeCompare(right.tierId));
}

function normalizeProtocols(protocols: string[]) {
  return [...protocols].sort();
}

function buildToolHashes(tool: SapToolProfile) {
  return {
    protocolHash: hashToArray(sha256(tool.protocolId)),
    descriptionHash: hashToArray(sha256(tool.description)),
    inputSchemaHash: hashToArray(sha256(JSON.stringify(tool.inputSchema))),
    outputSchemaHash: hashToArray(sha256(JSON.stringify(tool.outputSchema))),
  };
}

function agentNeedsUpdate(existing: AgentAccountLike, desired: ReturnType<typeof getSapRegistrationProfile>): boolean {
  return (
    existing.name !== desired.name ||
    existing.description !== desired.description ||
    existing.agentId !== desired.agentId ||
    existing.agentUri !== desired.agentUri ||
    existing.x402Endpoint !== desired.x402Endpoint ||
    JSON.stringify(normalizeCapabilities(existing.capabilities)) !== JSON.stringify(normalizeCapabilities(desired.capabilities)) ||
    JSON.stringify(normalizePricing(existing.pricing)) !== JSON.stringify(normalizePricing(desired.pricing)) ||
    JSON.stringify(normalizeProtocols(existing.protocols)) !== JSON.stringify(normalizeProtocols(desired.protocols))
  );
}

function toolNeedsUpdate(existing: ToolDescriptorLike, tool: SapToolProfile): boolean {
  const hashes = buildToolHashes(tool);
  const desiredHttpMethod = tool.httpMethod.toLowerCase();
  const desiredCategory = tool.category.toLowerCase();

  if (!arraysEqual(existing.protocolHash, hashes.protocolHash)) {
    throw new Error(`Published SAP tool protocol hash mismatch for ${tool.name}`);
  }

  return (
    !arraysEqual(existing.descriptionHash, hashes.descriptionHash) ||
    !arraysEqual(existing.inputSchemaHash, hashes.inputSchemaHash) ||
    !arraysEqual(existing.outputSchemaHash, hashes.outputSchemaHash) ||
    enumKey(existing.httpMethod) !== desiredHttpMethod ||
    enumKey(existing.category) !== desiredCategory ||
    existing.paramsCount !== tool.paramsCount ||
    existing.requiredParams !== tool.requiredParams
  );
}

function includesPublicKey(values: PublicKeyLike[], target: PublicKeyLike): boolean {
  const targetValue = publicKeyString(target);
  return values.some((value) => publicKeyString(value) === targetValue);
}

async function ensureProtocolIndexes(
  client: SapRegistrationClient,
  protocols: string[],
  agentPda: PublicKeyLike
): Promise<{ initialized: string[]; linked: string[] }> {
  const initialized: string[] = [];
  const linked: string[] = [];

  for (const protocolId of protocols) {
    const existing = await client.indexing.fetchProtocolIndexNullable(protocolId);
    if (!existing) {
      await client.indexing.initProtocolIndex(protocolId);
      initialized.push(protocolId);
      continue;
    }

    if (!includesPublicKey(existing.agents, agentPda)) {
      await client.indexing.addToProtocolIndex(protocolId);
      linked.push(protocolId);
    }
  }

  return { initialized, linked };
}

async function ensureCapabilityIndexes(
  client: SapRegistrationClient,
  capabilities: AgentAccountLike['capabilities'],
  agentPda: PublicKeyLike
): Promise<{ initialized: string[]; linked: string[] }> {
  const initialized: string[] = [];
  const linked: string[] = [];

  for (const capability of capabilities) {
    const existing = await client.indexing.fetchCapabilityIndexNullable(capability.id);
    if (!existing) {
      await client.indexing.initCapabilityIndex(capability.id);
      initialized.push(capability.id);
      continue;
    }

    if (!includesPublicKey(existing.agents, agentPda)) {
      await client.indexing.addToCapabilityIndex(capability.id);
      linked.push(capability.id);
    }
  }

  return { initialized, linked };
}

async function ensureToolCategoryIndex(
  client: SapRegistrationClient,
  tool: SapToolProfile,
  agentPda: PublicKeyLike
): Promise<{ initialized?: number; linked?: string }> {
  const category = TOOL_CATEGORY_VALUES[tool.categoryKey];
  const [toolPda] = client.tools.deriveTool(agentPda, tool.name);
  const existing = await client.indexing.fetchToolCategoryIndexNullable(category);

  let initialized: number | undefined;
  if (!existing) {
    await client.indexing.initToolCategoryIndex(category);
    initialized = category;
  }

  const current = existing ?? (await client.indexing.fetchToolCategoryIndexNullable(category));
  if (!current || !includesPublicKey(current.tools, toolPda)) {
    await client.indexing.addToToolCategory(category, toolPda);
    return { initialized, linked: tool.name };
  }

  return { initialized };
}

async function reconcileTools(
  client: SapRegistrationClient,
  tools: SapToolProfile[],
  agentPda: PublicKeyLike
): Promise<{
  published: string[];
  updated: string[];
  reactivated: string[];
  unchanged: string[];
  categoriesInitialized: number[];
  categoriesLinked: string[];
}> {
  const published: string[] = [];
  const updated: string[] = [];
  const reactivated: string[] = [];
  const unchanged: string[] = [];
  const categoriesInitialized = new Set<number>();
  const categoriesLinked: string[] = [];

  for (const tool of tools) {
    const existing = await client.tools.fetchNullable(agentPda, tool.name);
    const hashes = buildToolHashes(tool);

    if (!existing) {
      await client.tools.publishByName(
        tool.name,
        tool.protocolId,
        tool.description,
        JSON.stringify(tool.inputSchema),
        JSON.stringify(tool.outputSchema),
        HTTP_METHOD_VALUES.Post,
        TOOL_CATEGORY_VALUES[tool.categoryKey],
        tool.paramsCount,
        tool.requiredParams,
        tool.isCompound
      );
      published.push(tool.name);
    } else if (toolNeedsUpdate(existing, tool)) {
      await client.tools.update(tool.name, {
        descriptionHash: hashes.descriptionHash,
        inputSchemaHash: hashes.inputSchemaHash,
        outputSchemaHash: hashes.outputSchemaHash,
        httpMethod: HTTP_METHOD_VALUES.Post,
        category: TOOL_CATEGORY_VALUES[tool.categoryKey],
        paramsCount: tool.paramsCount,
        requiredParams: tool.requiredParams,
      });
      updated.push(tool.name);
    } else {
      unchanged.push(tool.name);
    }

    if (existing && !existing.isActive) {
      await client.tools.reactivate(tool.name);
      reactivated.push(tool.name);
    }

    const categoryResult = await ensureToolCategoryIndex(client, tool, agentPda);
    if (categoryResult.initialized !== undefined) {
      categoriesInitialized.add(categoryResult.initialized);
    }
    if (categoryResult.linked) {
      categoriesLinked.push(categoryResult.linked);
    }
  }

  return {
    published,
    updated,
    reactivated,
    unchanged,
    categoriesInitialized: [...categoriesInitialized],
    categoriesLinked,
  };
}

export async function reconcileSapAgent(
  client: SapRegistrationClient,
  baseUrl: string
): Promise<SapReconciliationResult> {
  const desired = getSapRegistrationProfile(baseUrl);
  const transactions: string[] = [];
  const existing = await client.agent.fetchNullable();

  let action: SapReconciliationResult['agent']['action'] = 'unchanged';

  if (!existing) {
    transactions.push(await client.agent.register({
      name: desired.name,
      description: desired.description,
      capabilities: desired.capabilities,
      pricing: desired.pricing,
      protocols: desired.protocols,
      agentId: desired.agentId,
      agentUri: desired.agentUri,
      x402Endpoint: desired.x402Endpoint,
    }));
    action = 'registered';
  } else if (agentNeedsUpdate(existing, desired)) {
    transactions.push(await client.agent.update({
      name: desired.name,
      description: desired.description,
      capabilities: desired.capabilities,
      pricing: desired.pricing,
      protocols: desired.protocols,
      agentId: desired.agentId,
      agentUri: desired.agentUri,
      x402Endpoint: desired.x402Endpoint,
    }));
    action = 'updated';
  }

  let reactivated = false;
  if (existing && !existing.isActive) {
    transactions.push(await client.agent.reactivate());
    reactivated = true;
  }

  const [agentPda] = client.agent.deriveAgent();
  const protocolIndexes = await ensureProtocolIndexes(client, desired.protocols, agentPda);
  const capabilityIndexes = await ensureCapabilityIndexes(client, desired.capabilities, agentPda);
  const tools = await reconcileTools(client, desired.tools, agentPda);

  return {
    agent: {
      action,
      reactivated,
      transactions,
    },
    discovery: {
      protocolsInitialized: protocolIndexes.initialized,
      protocolsLinked: protocolIndexes.linked,
      capabilitiesInitialized: capabilityIndexes.initialized,
      capabilitiesLinked: capabilityIndexes.linked,
      categoriesInitialized: tools.categoriesInitialized,
      categoriesLinked: tools.categoriesLinked,
    },
    tools: {
      published: tools.published,
      updated: tools.updated,
      reactivated: tools.reactivated,
      unchanged: tools.unchanged,
    },
  };
}
