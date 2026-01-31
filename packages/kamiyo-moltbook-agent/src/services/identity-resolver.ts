import type { JobDatabase } from '../db.js';
import type { DKGPublisher } from './dkg-publisher.js';

const MAX_HANDLE_LENGTH = 50;
const MAX_IDENTITIES_CACHE = 10000;

export interface AgentIdentity {
  moltbookHandle: string;
  globalId: string | null;
  walletAddress: string | null;
  erc8004Id: string | null;
  linkedAt: number;
  verifiedAt: number | null;
}

export interface IdentityResolverConfig {
  db: JobDatabase;
  dkg?: DKGPublisher;
  chainId: number; // e.g., 8453 for Base
  registryAddress?: string; // ERC-8004 registry when available
}

export interface IdentityLinkRequest {
  moltbookHandle: string;
  walletAddress: string;
  signature?: string; // Wallet signature proving ownership
}

export interface ResolveResult {
  found: boolean;
  identity?: AgentIdentity;
  source: 'local' | 'dkg' | 'none';
}

export class IdentityResolver {
  private db: JobDatabase;
  private dkg?: DKGPublisher;
  private chainId: number;
  private registryAddress?: string;

  // In-memory identity cache
  private identities = new Map<string, AgentIdentity>();
  private handleToGlobalId = new Map<string, string>();
  private globalIdToHandle = new Map<string, string>();

  constructor(config: IdentityResolverConfig) {
    this.db = config.db;
    this.dkg = config.dkg;
    this.chainId = config.chainId;
    this.registryAddress = config.registryAddress;
  }

  generateGlobalId(walletAddress: string, agentId?: string): string {
    // EIP-155 chain ID format: eip155:{chainId}:{address}:{agentId}
    // This allows the same wallet to have multiple agent identities
    const suffix = agentId ? `:${agentId}` : '';
    return `eip155:${this.chainId}:${walletAddress}${suffix}`;
  }

  parseGlobalId(globalId: string): {
    chainId: number;
    address: string;
    agentId?: string;
  } | null {
    const match = globalId.match(/^eip155:(\d+):(0x[a-fA-F0-9]+)(?::(.+))?$/);
    if (!match) return null;

    return {
      chainId: parseInt(match[1], 10),
      address: match[2],
      agentId: match[3],
    };
  }

  async linkIdentity(request: IdentityLinkRequest): Promise<{
    success: boolean;
    globalId?: string;
    error?: string;
  }> {
    const { moltbookHandle, walletAddress, signature } = request;

    // Validate handle format
    if (!moltbookHandle || moltbookHandle.length > MAX_HANDLE_LENGTH) {
      return { success: false, error: 'Invalid Moltbook handle length' };
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(moltbookHandle)) {
      return { success: false, error: 'Invalid Moltbook handle format' };
    }

    // Validate wallet address (EVM format)
    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return { success: false, error: 'Invalid wallet address format' };
    }

    // Normalize wallet address to checksum format
    const normalizedWallet = walletAddress.toLowerCase();

    // Check if handle already linked
    const existing = this.identities.get(moltbookHandle);
    if (existing && existing.walletAddress && existing.walletAddress.toLowerCase() !== normalizedWallet) {
      return { success: false, error: 'Handle already linked to different wallet' };
    }

    // Bound cache size
    if (this.identities.size >= MAX_IDENTITIES_CACHE && !existing) {
      return { success: false, error: 'Identity cache capacity reached' };
    }

    // Generate global ID
    const globalId = this.generateGlobalId(walletAddress, moltbookHandle);

    // Create identity record
    const identity: AgentIdentity = {
      moltbookHandle,
      globalId,
      walletAddress,
      erc8004Id: this.registryAddress ? `${this.registryAddress}:${moltbookHandle}` : null,
      linkedAt: Date.now(),
      verifiedAt: signature ? Date.now() : null,
    };

    // Store in cache
    this.identities.set(moltbookHandle, identity);
    this.handleToGlobalId.set(moltbookHandle, globalId);
    this.globalIdToHandle.set(globalId, moltbookHandle);

    // Publish to DKG if available
    if (this.dkg) {
      try {
        await this.publishIdentityToDKG(identity);
      } catch (err) {
        console.error('[IdentityResolver] DKG publish failed:', err);
      }
    }

    return { success: true, globalId };
  }

  private async publishIdentityToDKG(identity: AgentIdentity): Promise<string | null> {
    if (!this.dkg || !identity.globalId) return null;

    // Publish as a linked identity document
    // The DKG publisher doesn't have a specific method for this yet,
    // so we'll use verification attestation as a proxy
    return this.dkg.publishVerificationAttestation({
      agentId: identity.globalId,
      agentHandle: identity.moltbookHandle,
      tier: 'Linked',
      proofHash: `identity:${identity.walletAddress}`,
    });
  }

  resolveByHandle(handle: string): ResolveResult {
    const identity = this.identities.get(handle);
    if (identity) {
      return { found: true, identity, source: 'local' };
    }
    return { found: false, source: 'none' };
  }

  resolveByGlobalId(globalId: string): ResolveResult {
    const handle = this.globalIdToHandle.get(globalId);
    if (handle) {
      const identity = this.identities.get(handle);
      if (identity) {
        return { found: true, identity, source: 'local' };
      }
    }
    return { found: false, source: 'none' };
  }

  resolveByWallet(walletAddress: string): AgentIdentity[] {
    const results: AgentIdentity[] = [];
    for (const identity of this.identities.values()) {
      if (identity.walletAddress === walletAddress) {
        results.push(identity);
      }
    }
    return results;
  }

  getGlobalId(handle: string): string | null {
    return this.handleToGlobalId.get(handle) ?? null;
  }

  getHandle(globalId: string): string | null {
    return this.globalIdToHandle.get(globalId) ?? null;
  }

  isLinked(handle: string): boolean {
    return this.identities.has(handle);
  }

  isVerified(handle: string): boolean {
    const identity = this.identities.get(handle);
    return identity?.verifiedAt !== null && identity?.verifiedAt !== undefined;
  }

  getAllLinkedIdentities(): AgentIdentity[] {
    return Array.from(this.identities.values());
  }

  getStats(): {
    totalLinked: number;
    verified: number;
    withErc8004: number;
  } {
    const all = this.getAllLinkedIdentities();
    return {
      totalLinked: all.length,
      verified: all.filter((i) => i.verifiedAt !== null).length,
      withErc8004: all.filter((i) => i.erc8004Id !== null).length,
    };
  }

  formatIdentityCard(handle: string): string {
    const identity = this.identities.get(handle);

    if (!identity) {
      return `No linked identity for @${handle}`;
    }

    const verified = identity.verifiedAt ? 'Yes' : 'No';
    const linkedDate = new Date(identity.linkedAt).toISOString().split('T')[0];

    let card = `## Identity: @${handle}\n\n`;
    card += `**Global ID:** \`${identity.globalId || 'Not set'}\`\n`;
    card += `**Wallet:** \`${identity.walletAddress || 'Not linked'}\`\n`;
    card += `**Verified:** ${verified}\n`;
    card += `**Linked:** ${linkedDate}\n`;

    if (identity.erc8004Id) {
      card += `**ERC-8004:** \`${identity.erc8004Id}\`\n`;
    }

    return card;
  }

  formatGlobalIdExplainer(): string {
    return `## KAMIYO Global Identity

Global IDs follow the EIP-155 format:
\`eip155:{chainId}:{walletAddress}:{agentId}\`

Example: \`eip155:8453:0x1234...abcd:myagent\`

This format:
- Works across all EVM chains
- Links Moltbook handles to wallet addresses
- Enables cross-platform agent discovery
- Is compatible with ERC-8004 identity registries

To link your identity:
1. Connect your wallet
2. Sign a message proving ownership
3. Your global ID will be generated automatically`;
  }
}
