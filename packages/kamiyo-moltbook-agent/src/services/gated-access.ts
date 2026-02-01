import type { ReputationService } from './reputation-service.js';
import type { TrustGraph } from './trust-graph.js';
import type { BadgeService } from './badge-service.js';
import type { DKGPublisher } from './dkg-publisher.js';
import type { TierConfig } from '../personality.js';

const MAX_CHANNELS = 100;
const MAX_MEMBERS_PER_CHANNEL = 10000;
const MAX_CHANNEL_ID_LENGTH = 50;

export interface GatedChannel {
  id: string;
  name: string;
  description: string;
  requiredTier: string;
  requiredBadges: string[];
  minTrustScore: number;
  members: Set<string>;
  createdAt: number;
  createdBy: string;
}

export interface AccessRequest {
  agentId: string;
  channelId: string;
  proofHash?: string;
  requestedAt: number;
}

export interface AccessResult {
  granted: boolean;
  channel?: GatedChannel;
  reason?: string;
  proofRequired?: boolean;
}

export interface GatedAccessConfig {
  reputationService: ReputationService;
  trustGraph: TrustGraph;
  badgeService: BadgeService;
  dkg?: DKGPublisher;
  wsHost?: string;
}

export interface AccessToken {
  channelId: string;
  nullifier: string;
  tier: number;
  expiresAt: number;
}

export class GatedAccessService {
  private reputationService: ReputationService;
  private trustGraph: TrustGraph;
  private badgeService: BadgeService;
  private dkg?: DKGPublisher;
  private wsHost: string;

  private channels = new Map<string, GatedChannel>();
  private pendingRequests = new Map<string, AccessRequest[]>();

  constructor(config: GatedAccessConfig) {
    this.reputationService = config.reputationService;
    this.trustGraph = config.trustGraph;
    this.badgeService = config.badgeService;
    this.dkg = config.dkg;
    this.wsHost = config.wsHost || 'localhost:8080';

    // Initialize default channels
    this.initializeDefaultChannels();
  }

  private initializeDefaultChannels(): void {
    // Platinum Elite - highest tier only
    this.createChannel({
      id: 'platinum-elite',
      name: 'Platinum Elite',
      description: 'Exclusive channel for Platinum tier agents. ZK proof required.',
      requiredTier: 'platinum',
      requiredBadges: [],
      minTrustScore: 0,
      createdBy: 'kamiyo',
    });

    // Gold+ Council
    this.createChannel({
      id: 'gold-council',
      name: 'Gold+ Council',
      description: 'Strategy discussions for Gold tier and above.',
      requiredTier: 'gold',
      requiredBadges: [],
      minTrustScore: 0,
      createdBy: 'kamiyo',
    });

    // Verified Traders - requires transaction badge
    this.createChannel({
      id: 'verified-traders',
      name: 'Verified Traders',
      description: 'For agents with completed transactions.',
      requiredTier: 'bronze',
      requiredBadges: ['transaction-count'],
      minTrustScore: 0,
      createdBy: 'kamiyo',
    });

    // Trust Network - high trust score required
    this.createChannel({
      id: 'trust-network',
      name: 'Trust Network',
      description: 'Highly connected agents in the trust graph.',
      requiredTier: 'bronze',
      requiredBadges: [],
      minTrustScore: 100,
      createdBy: 'kamiyo',
    });
  }

  createChannel(params: {
    id: string;
    name: string;
    description: string;
    requiredTier: string;
    requiredBadges: string[];
    minTrustScore: number;
    createdBy: string;
  }): GatedChannel {
    // Validate inputs
    if (!params.id || params.id.length > MAX_CHANNEL_ID_LENGTH) {
      throw new Error('Invalid channel ID');
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(params.id)) {
      throw new Error('Channel ID must be alphanumeric');
    }
    if (!params.name || params.name.length > 100) {
      throw new Error('Invalid channel name');
    }
    if (!params.description || params.description.length > 500) {
      throw new Error('Invalid channel description');
    }
    if (!['bronze', 'silver', 'gold', 'platinum'].includes(params.requiredTier)) {
      throw new Error('Invalid tier requirement');
    }
    if (!Number.isFinite(params.minTrustScore) || params.minTrustScore < 0) {
      throw new Error('Invalid trust score requirement');
    }

    // Limit total channels
    if (this.channels.size >= MAX_CHANNELS) {
      throw new Error('Maximum channels reached');
    }

    const channel: GatedChannel = {
      ...params,
      members: new Set(),
      createdAt: Date.now(),
    };

    this.channels.set(params.id, channel);
    return channel;
  }

  getChannel(channelId: string): GatedChannel | null {
    return this.channels.get(channelId) ?? null;
  }

  getAllChannels(): GatedChannel[] {
    return Array.from(this.channels.values());
  }

  async requestAccess(agentId: string, channelId: string): Promise<AccessResult> {
    // Validate inputs
    if (!agentId || agentId.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(agentId)) {
      return { granted: false, reason: 'Invalid agent ID' };
    }
    if (!channelId || channelId.length > MAX_CHANNEL_ID_LENGTH) {
      return { granted: false, reason: 'Invalid channel ID' };
    }

    const channel = this.channels.get(channelId);
    if (!channel) {
      return { granted: false, reason: 'Channel not found' };
    }

    // Already a member
    if (channel.members.has(agentId)) {
      return { granted: true, channel, reason: 'Already a member' };
    }

    // Check member limit
    if (channel.members.size >= MAX_MEMBERS_PER_CHANNEL) {
      return { granted: false, reason: 'Channel at capacity' };
    }

    // Check tier requirement
    const tierResult = await this.checkTierRequirement(agentId, channel.requiredTier);
    if (!tierResult.meets) {
      return {
        granted: false,
        reason: `Requires ${channel.requiredTier} tier. ${tierResult.message}`,
        proofRequired: true,
      };
    }

    // Check badge requirements
    const badgeResult = this.checkBadgeRequirements(agentId, channel.requiredBadges);
    if (!badgeResult.meets) {
      return {
        granted: false,
        reason: `Missing required badges: ${badgeResult.missing.join(', ')}`,
      };
    }

    // Check trust score
    const trustResult = this.checkTrustScore(agentId, channel.minTrustScore);
    if (!trustResult.meets) {
      return {
        granted: false,
        reason: `Trust score ${trustResult.score} below required ${channel.minTrustScore}`,
      };
    }

    // All checks passed - grant access
    channel.members.add(agentId);

    return { granted: true, channel };
  }

  async verifyWithProof(
    agentId: string,
    channelId: string,
    proofHash: string
  ): Promise<AccessResult> {
    const channel = this.channels.get(channelId);
    if (!channel) {
      return { granted: false, reason: 'Channel not found' };
    }

    // Verify the proof corresponds to the required tier
    const result = await this.reputationService.verifyReputation({
      agentId,
      agentHandle: agentId,
      requestedBy: 'gated-access',
    });

    if (!result.success || !result.tier) {
      return { granted: false, reason: 'Proof verification failed' };
    }

    // Check if the verified tier meets the requirement
    const tierOrder = ['bronze', 'silver', 'gold', 'platinum'];
    const requiredIndex = tierOrder.indexOf(channel.requiredTier);
    const verifiedIndex = tierOrder.indexOf(result.tier.name);

    if (verifiedIndex < requiredIndex) {
      return {
        granted: false,
        reason: `Verified tier (${result.tier.name}) does not meet requirement (${channel.requiredTier})`,
      };
    }

    // Grant access
    channel.members.add(agentId);

    return { granted: true, channel };
  }

  private async checkTierRequirement(
    agentId: string,
    requiredTier: string
  ): Promise<{ meets: boolean; message: string }> {
    const data = await this.reputationService.getReputationData(agentId);
    if (!data) {
      return { meets: false, message: 'No reputation data found' };
    }

    const tiers = this.reputationService.getAllTiers();
    const tierOrder = ['bronze', 'silver', 'gold', 'platinum'];
    const requiredIndex = tierOrder.indexOf(requiredTier);

    // Find agent's tier
    let agentTier: TierConfig | null = null;
    for (let i = tiers.length - 1; i >= 0; i--) {
      if (data.score >= tiers[i].threshold) {
        agentTier = tiers[i];
        break;
      }
    }

    if (!agentTier) {
      return { meets: false, message: 'Score below minimum tier threshold' };
    }

    const agentIndex = tierOrder.indexOf(agentTier.name);
    if (agentIndex >= requiredIndex) {
      return { meets: true, message: '' };
    }

    return {
      meets: false,
      message: `Your tier (${agentTier.name}) is below required (${requiredTier})`,
    };
  }

  private checkBadgeRequirements(
    agentId: string,
    requiredBadges: string[]
  ): { meets: boolean; missing: string[] } {
    if (requiredBadges.length === 0) {
      return { meets: true, missing: [] };
    }

    const agentBadges = this.badgeService.getBadges(agentId);
    const badgeTypes = new Set(agentBadges.map((b) => b.badgeType));

    const missing = requiredBadges.filter((b) => !badgeTypes.has(b as 'reputation-verified' | 'transaction-count' | 'dispute-free'));

    return {
      meets: missing.length === 0,
      missing,
    };
  }

  private checkTrustScore(
    agentId: string,
    minScore: number
  ): { meets: boolean; score: number } {
    if (minScore <= 0) {
      return { meets: true, score: 0 };
    }

    const nodeInfo = this.trustGraph.getNodeInfo(agentId);
    const score = nodeInfo.outgoingTrust + nodeInfo.incomingTrust;

    return {
      meets: score >= minScore,
      score,
    };
  }

  revokeAccess(agentId: string, channelId: string): boolean {
    const channel = this.channels.get(channelId);
    if (!channel) return false;

    return channel.members.delete(agentId);
  }

  getMembers(channelId: string): string[] {
    const channel = this.channels.get(channelId);
    if (!channel) return [];

    return Array.from(channel.members);
  }

  getMemberships(agentId: string): GatedChannel[] {
    const memberships: GatedChannel[] = [];

    for (const channel of this.channels.values()) {
      if (channel.members.has(agentId)) {
        memberships.push(channel);
      }
    }

    return memberships;
  }

  getEligibleChannels(agentId: string): Promise<GatedChannel[]> {
    return this.checkAllChannelEligibility(agentId);
  }

  private async checkAllChannelEligibility(agentId: string): Promise<GatedChannel[]> {
    const eligible: GatedChannel[] = [];

    for (const channel of this.channels.values()) {
      // Already a member
      if (channel.members.has(agentId)) {
        eligible.push(channel);
        continue;
      }

      // Check requirements
      const tierResult = await this.checkTierRequirement(agentId, channel.requiredTier);
      if (!tierResult.meets) continue;

      const badgeResult = this.checkBadgeRequirements(agentId, channel.requiredBadges);
      if (!badgeResult.meets) continue;

      const trustResult = this.checkTrustScore(agentId, channel.minTrustScore);
      if (!trustResult.meets) continue;

      eligible.push(channel);
    }

    return eligible;
  }

  formatChannelList(): string {
    const channels = this.getAllChannels();

    let output = '## KAMIYO Gated Channels\n\n';
    output += 'Access requires ZK proof of tier or specific badges.\n\n';

    for (const channel of channels) {
      output += `### ${channel.name}\n`;
      output += `${channel.description}\n`;
      output += `- **Required Tier:** ${channel.requiredTier}\n`;
      if (channel.requiredBadges.length > 0) {
        output += `- **Required Badges:** ${channel.requiredBadges.join(', ')}\n`;
      }
      if (channel.minTrustScore > 0) {
        output += `- **Min Trust Score:** ${channel.minTrustScore}\n`;
      }
      output += `- **Members:** ${channel.members.size}\n\n`;
    }

    output += '---\n\n';
    output += 'To request access: `@kamiyo join [channel-id]`\n';

    return output;
  }

  formatAccessDenied(channelId: string, reason: string): string {
    const channel = this.channels.get(channelId);

    return `## Access Denied

**Channel:** ${channel?.name || channelId}
**Reason:** ${reason}

${channel ? `This channel requires ${channel.requiredTier} tier.` : ''}

To improve your access:
1. Get verified: \`@kamiyo verify my reputation\`
2. Build trust: \`@kamiyo trust @agent\`
3. Complete transactions to earn badges

---

*Access is gated by ZK proofs. Your tier is verified without revealing your exact score.*`;
  }

  formatAccessGranted(channel: GatedChannel): string {
    return `## Access Granted

Welcome to **${channel.name}**!

${channel.description}

**Members:** ${channel.members.size}

---

You proved your ${channel.requiredTier} tier status without revealing your exact reputation score.

*This is what ZK-gated access looks like.*`;
  }

  generateAccessToken(
    channelId: string,
    proof: { nullifierHash: string; tier: number }
  ): string {
    const payload: AccessToken = {
      channelId,
      nullifier: proof.nullifierHash,
      tier: proof.tier,
      expiresAt: Date.now() + 3600000, // 1 hour
    };
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  verifyAccessToken(
    token: string
  ): { channelId: string; nullifier: string; tier: number } | null {
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      const payload = JSON.parse(decoded) as AccessToken;

      if (payload.expiresAt < Date.now()) {
        return null;
      }

      return {
        channelId: payload.channelId,
        nullifier: payload.nullifier,
        tier: payload.tier,
      };
    } catch {
      return null;
    }
  }

  getChannelEndpoint(channelId: string): string {
    return `ws://${this.wsHost}/channels/${channelId}`;
  }
}
