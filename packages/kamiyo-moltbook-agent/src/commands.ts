import type { MoltbookComment } from './types.js';
import { KAMIYO_PERSONALITY, getTierFromScore, TIER_CONFIG } from './personality.js';

export type CommandType = 'verify' | 'trust' | 'escrow' | 'badge' | 'help' | 'status' | 'post-job' | 'bid' | 'job-status' | 'link-identity' | 'my-identity' | 'timeline' | 'join-channel' | 'channels' | 'trust-graph' | 'unknown';

export interface ParsedCommand {
  type: CommandType;
  args: string[];
  rawText: string;
  mentionedAgents: string[];
}

export interface CommandResult {
  success: boolean;
  response: string;
  action?: 'post' | 'comment' | 'none';
  data?: Record<string, unknown>;
}

const COMMAND_PATTERNS: Array<{ type: CommandType; patterns: RegExp[] }> = [
  {
    type: 'verify',
    patterns: [
      /\bverify\s+(my\s+)?reputation\b/i,
      /\bverify\s+(@?\w+)\b/i,
      /\breputation\s+check\b/i,
      /\bcheck\s+(my\s+)?tier\b/i,
    ],
  },
  {
    type: 'trust',
    patterns: [
      /\btrust\s+(@?\w+)\b/i,
      /\bi\s+trust\s+(@?\w+)\b/i,
      /\bvouch\s+for\s+(@?\w+)\b/i,
      /\bendorse\s+(@?\w+)\b/i,
    ],
  },
  {
    type: 'escrow',
    patterns: [
      /\bescrow\s+(\d+(?:\.\d+)?)\s*(?:sol)?\b/i,
      /\bcreate\s+escrow\b/i,
      /\bstart\s+escrow\b/i,
      /\bescrow\s+status\b/i,
    ],
  },
  {
    type: 'badge',
    patterns: [
      /\bbadge\s+(list|check|show)\b/i,
      /\bmy\s+badges?\b/i,
      /\bshow\s+badges?\b/i,
    ],
  },
  {
    type: 'status',
    patterns: [
      /\bstatus\b/i,
      /\bwhat\s+can\s+you\s+do\b/i,
      /\bwho\s+are\s+you\b/i,
    ],
  },
  {
    type: 'help',
    patterns: [/\bhelp\b/i, /\bcommands?\b/i, /\bhow\s+do\s+i\b/i, /\?$/],
  },
  {
    type: 'post-job',
    patterns: [
      /\bpost\s+job\b/i,
      /\bcreate\s+job\b/i,
      /\bnew\s+job\b/i,
      /\bhiring\b/i,
    ],
  },
  {
    type: 'bid',
    patterns: [
      /\bbid\s+(job-[\w-]+)\s+(\d+(?:\.\d+)?)/i,
      /\bbid\s+on\s+(job-[\w-]+)/i,
      /\bapply\s+(?:for\s+)?(job-[\w-]+)/i,
    ],
  },
  {
    type: 'job-status',
    patterns: [
      /\bjob\s+status\s+(job-[\w-]+)/i,
      /\bstatus\s+(job-[\w-]+)/i,
      /\bcheck\s+(job-[\w-]+)/i,
    ],
  },
  {
    type: 'link-identity',
    patterns: [
      /\blink\s+(?:my\s+)?identity\b/i,
      /\blink\s+wallet\s+(0x[a-fA-F0-9]{40})\b/i,
      /\bconnect\s+wallet\b/i,
    ],
  },
  {
    type: 'my-identity',
    patterns: [
      /\bmy\s+identity\b/i,
      /\bwho\s+am\s+i\b/i,
      /\bglobal\s+id\b/i,
    ],
  },
  {
    type: 'timeline',
    patterns: [
      /\bmy\s+timeline\b/i,
      /\bhistory\b/i,
      /\btimeline\s+(@?\w+)\b/i,
    ],
  },
  {
    type: 'join-channel',
    patterns: [
      /\bjoin\s+([\w-]+)\b/i,
      /\brequest\s+access\s+([\w-]+)\b/i,
    ],
  },
  {
    type: 'channels',
    patterns: [
      /\bchannels?\b/i,
      /\bgated\s+access\b/i,
      /\bprivate\s+channels?\b/i,
    ],
  },
  {
    type: 'trust-graph',
    patterns: [
      /\btrust\s+graph\b/i,
      /\bshow\s+graph\b/i,
      /\bnetwork\s+stats?\b/i,
    ],
  },
];

export function parseCommand(comment: MoltbookComment): ParsedCommand {
  const text = comment.content;
  const mentionedAgents = extractMentions(text);

  for (const { type, patterns } of COMMAND_PATTERNS) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return {
          type,
          args: match.slice(1).filter(Boolean),
          rawText: text,
          mentionedAgents,
        };
      }
    }
  }

  return {
    type: 'unknown',
    args: [],
    rawText: text,
    mentionedAgents,
  };
}

function extractMentions(text: string): string[] {
  const matches = text.match(/@(\w+)/g) || [];
  return matches.map((m) => m.slice(1)).filter((m) => m !== 'kamiyo');
}

export function generateHelpResponse(): CommandResult {
  const tierList = TIER_CONFIG.map(
    (t) => `- **${t.label}** (${t.threshold}+): ${t.features.join(', ')}`
  ).join('\n');

  const response = `## ${KAMIYO_PERSONALITY.name} Commands

**Verification**
- \`@kamiyo verify my reputation\` - Get a ZK proof of your tier
- \`@kamiyo verify @agent\` - Check another agent's verified tier

**Trust**
- \`@kamiyo trust @agent\` - Add agent to your trust graph
- \`@kamiyo vouch for @agent\` - Publicly vouch for an agent

**Escrow**
- \`@kamiyo escrow 0.5 SOL\` - Create escrow for a transaction
- \`@kamiyo escrow status\` - Check escrow status

**Badges**
- \`@kamiyo badge list\` - Show your earned badges
- \`@kamiyo my badges\` - Show your badges

**Jobs**
- \`@kamiyo post job [title] | [description] | [budget]\` - Post a job
- \`@kamiyo bid [job-id] [amount]\` - Bid on a job
- \`@kamiyo job status [job-id]\` - Check job status

**Identity**
- \`@kamiyo link wallet 0x...\` - Link your global identity
- \`@kamiyo my identity\` - Show your identity card
- \`@kamiyo my timeline\` - Show your activity history

**Gated Channels**
- \`@kamiyo channels\` - List available gated channels
- \`@kamiyo join [channel-id]\` - Request access to a channel
- \`@kamiyo trust graph\` - Show trust network stats

**Info**
- \`@kamiyo status\` - Show service status
- \`@kamiyo help\` - Show this help

---

### Tier System

${tierList}

---

*${KAMIYO_PERSONALITY.tagline}*`;

  return {
    success: true,
    response,
    action: 'comment',
  };
}

export function generateStatusResponse(stats: {
  verifications: number;
  trustEdges: number;
  escrowVolume: number;
}): CommandResult {
  const response = `## ${KAMIYO_PERSONALITY.name} Status

**Service:** Online
**Verifications:** ${stats.verifications}
**Trust Graph:** ${stats.trustEdges} edges
**Escrow Volume:** ${stats.escrowVolume.toFixed(2)} SOL

---

${KAMIYO_PERSONALITY.tagline}

Need help? Reply with \`@kamiyo help\``;

  return {
    success: true,
    response,
    action: 'comment',
  };
}

export function generateVerifyResponse(
  agentId: string,
  tier: ReturnType<typeof getTierFromScore> | null,
  proofHash?: string
): CommandResult {
  if (!tier) {
    return {
      success: false,
      response: `Unable to verify @${agentId}. Agent not found in reputation registry or reputation below minimum threshold.`,
      action: 'comment',
    };
  }

  const response = `## Verified: @${agentId} has ${tier.label} Tier

**Tier:** ${tier.label} (score >= ${tier.threshold})
${proofHash ? `**Proof Hash:** \`${proofHash.slice(0, 16)}...\`\n` : ''}**Verification Method:** Groth16 ZK-SNARK

Features unlocked:
${tier.features.map((f) => `- ${f}`).join('\n')}

---

The agent proved they meet the ${tier.label} threshold without revealing their exact score.`;

  return {
    success: true,
    response,
    action: 'comment',
    data: {
      agentId,
      tier: tier.name,
      threshold: tier.threshold,
      proofHash,
    },
  };
}

export function generateTrustResponse(
  fromAgent: string,
  toAgent: string,
  success: boolean
): CommandResult {
  if (!success) {
    return {
      success: false,
      response: `Unable to create trust edge. Please verify both agents are registered.`,
      action: 'comment',
    };
  }

  return {
    success: true,
    response: `Trust recorded: @${fromAgent} → @${toAgent}

This trust relationship has been added to the KAMIYO trust graph and will be published to the decentralized knowledge graph.

*Trust edges influence reputation and can be queried by other agents.*`,
    action: 'comment',
    data: {
      from: fromAgent,
      to: toAgent,
    },
  };
}

export function generateEscrowResponse(
  amount: number,
  escrowAddress?: string
): CommandResult {
  if (!escrowAddress) {
    return {
      success: true,
      response: `To create an escrow for ${amount.toFixed(4)} SOL:

1. Send ${amount.toFixed(4)} SOL to the escrow program
2. Include the job post ID in the memo
3. Reply with the transaction signature

I'll confirm once the escrow is funded and start work.`,
      action: 'comment',
    };
  }

  return {
    success: true,
    response: `Escrow created successfully.

**Amount:** ${amount.toFixed(4)} SOL
**Address:** \`${escrowAddress}\`
**Status:** Awaiting deposit

Once funded, work can begin. Payment is protected until quality verification.`,
    action: 'comment',
    data: {
      amount,
      escrowAddress,
    },
  };
}

export function generateBadgeResponse(
  agentId: string,
  badges: Array<{ type: string; tier: number; issuedAt: number }>
): CommandResult {
  if (badges.length === 0) {
    return {
      success: true,
      response: `@${agentId} has no badges yet.

Earn badges by:
- Getting reputation verified
- Completing escrow transactions
- Building trust relationships`,
      action: 'comment',
    };
  }

  const badgeList = badges
    .map((b) => {
      const date = new Date(b.issuedAt).toISOString().split('T')[0];
      return `- **${b.type}** (Tier ${b.tier}) - ${date}`;
    })
    .join('\n');

  return {
    success: true,
    response: `## Badges for @${agentId}

${badgeList}

---

Badges are permanent attestations stored on the decentralized knowledge graph.`,
    action: 'comment',
    data: {
      agentId,
      badges,
    },
  };
}

export function generateUnknownResponse(): CommandResult {
  return {
    success: false,
    response: `I didn't understand that command. Try \`@kamiyo help\` for available commands.`,
    action: 'comment',
  };
}

export function generatePostJobResponse(success: boolean, jobId?: string, error?: string): CommandResult {
  if (!success) {
    return {
      success: false,
      response: error || 'Failed to create job',
      action: 'comment',
    };
  }

  return {
    success: true,
    response: `## Job Created

**Job ID:** \`${jobId}\`

Your job has been posted to the KAMIYO job board. Agents can now bid on it.

To check status: \`@kamiyo job status ${jobId}\`

---

*Jobs are protected by KAMIYO escrow. Payment is held until quality verification.*`,
    action: 'comment',
    data: { jobId },
  };
}

export function generateBidResponse(
  success: boolean,
  jobId: string,
  bidAmount?: number,
  error?: string
): CommandResult {
  if (!success) {
    return {
      success: false,
      response: error || 'Failed to place bid',
      action: 'comment',
    };
  }

  return {
    success: true,
    response: `## Bid Placed

**Job:** \`${jobId}\`
**Bid Amount:** ${bidAmount} SOL

Your bid has been submitted. The job poster will review and may accept your bid.

If accepted, escrow will be created and you can begin work.`,
    action: 'comment',
    data: { jobId, bidAmount },
  };
}

export function generateJobStatusResponse(
  jobId: string,
  status: string,
  budget: number,
  assignedTo?: string,
  escrowAddress?: string,
  bids?: Array<{ agent: string; amount: number }>
): CommandResult {
  let response = `## Job Status

**ID:** \`${jobId}\`
**Status:** ${status}
**Budget:** ${budget} SOL`;

  if (assignedTo) {
    response += `\n**Assigned To:** @${assignedTo}`;
  }

  if (escrowAddress) {
    response += `\n**Escrow:** \`${escrowAddress.slice(0, 12)}...\``;
  }

  if (bids && bids.length > 0) {
    response += `\n\n### Bids (${bids.length})`;
    for (const bid of bids.slice(0, 5)) {
      response += `\n- @${bid.agent}: ${bid.amount} SOL`;
    }
  }

  return {
    success: true,
    response,
    action: 'comment',
    data: { jobId, status },
  };
}

export function generateTransactionCompleteResponse(
  buyer: string,
  seller: string,
  amount: number,
  qualityScore: number,
  escrowAddress: string
): CommandResult {
  const scoreLabel = qualityScore >= 90 ? 'Exceptional' :
                     qualityScore >= 75 ? 'Good' :
                     qualityScore >= 60 ? 'Acceptable' : 'Needs Improvement';

  return {
    success: true,
    response: `## Agent-to-Agent Transaction Complete

**Buyer:** @${buyer}
**Seller:** @${seller}
**Amount:** ${amount.toFixed(4)} SOL
**Quality Score:** ${qualityScore}/100 (${scoreLabel})
**Escrow:** \`${escrowAddress.slice(0, 12)}...\`

Both parties were protected by KAMIYO escrow. Payment was released automatically after quality verification.

---

*This is what trustless agent commerce looks like.*`,
    action: 'post',
    data: { buyer, seller, amount, qualityScore, escrowAddress },
  };
}

export function generateLinkIdentityResponse(
  success: boolean,
  handle: string,
  globalId?: string,
  error?: string
): CommandResult {
  if (!success) {
    return {
      success: false,
      response: error || 'Failed to link identity',
      action: 'comment',
    };
  }

  return {
    success: true,
    response: `## Identity Linked

**Handle:** @${handle}
**Global ID:** \`${globalId}\`

Your Moltbook identity is now linked to a global EIP-155 identifier. This enables:
- Cross-platform agent discovery
- Portable reputation across chains
- ERC-8004 identity registry compatibility

---

*Your identity is now part of the KAMIYO trust graph.*`,
    action: 'comment',
    data: { handle, globalId },
  };
}

export function generateIdentityCardResponse(
  handle: string,
  globalId: string | null,
  walletAddress: string | null,
  verified: boolean,
  linkedAt: number
): CommandResult {
  const linkedDate = new Date(linkedAt).toISOString().split('T')[0];

  let response = `## Identity: @${handle}\n\n`;
  response += `**Global ID:** \`${globalId || 'Not linked'}\`\n`;
  response += `**Wallet:** \`${walletAddress || 'Not linked'}\`\n`;
  response += `**Verified:** ${verified ? 'Yes' : 'No'}\n`;
  response += `**Linked:** ${linkedDate}\n`;

  if (!globalId) {
    response += `\n---\n\nTo link your identity: \`@kamiyo link wallet 0x...\``;
  }

  return {
    success: true,
    response,
    action: 'comment',
    data: { handle, globalId, verified },
  };
}

export function generateTimelineResponse(
  agentId: string,
  events: Array<{ summary: string; timestamp: number }>
): CommandResult {
  if (events.length === 0) {
    return {
      success: true,
      response: `No recorded events for @${agentId}`,
      action: 'comment',
    };
  }

  const lines = events.map((e) => {
    const date = new Date(e.timestamp).toISOString().split('T')[0];
    return `[${date}] ${e.summary}`;
  });

  return {
    success: true,
    response: `## Timeline: @${agentId}\n\n${lines.join('\n')}`,
    action: 'comment',
    data: { agentId, eventCount: events.length },
  };
}

export function generateChannelAccessResponse(
  success: boolean,
  channelName: string,
  memberCount?: number,
  error?: string
): CommandResult {
  if (!success) {
    return {
      success: false,
      response: `## Access Denied

**Channel:** ${channelName}
**Reason:** ${error}

To improve your access:
1. Get verified: \`@kamiyo verify my reputation\`
2. Build trust: \`@kamiyo trust @agent\`
3. Complete transactions to earn badges

---

*Access is gated by ZK proofs. Your tier is verified without revealing your exact score.*`,
      action: 'comment',
    };
  }

  return {
    success: true,
    response: `## Access Granted

Welcome to **${channelName}**!

**Members:** ${memberCount}

You proved your tier status without revealing your exact reputation score.

*This is what ZK-gated access looks like.*`,
    action: 'comment',
    data: { channel: channelName },
  };
}

export function generateChannelListResponse(
  channels: Array<{
    id: string;
    name: string;
    description: string;
    requiredTier: string;
    memberCount: number;
  }>
): CommandResult {
  let response = `## KAMIYO Gated Channels

Access requires ZK proof of tier or specific badges.

`;

  for (const ch of channels) {
    response += `### ${ch.name}
${ch.description}
- **Required:** ${ch.requiredTier} tier
- **Members:** ${ch.memberCount}
- **Join:** \`@kamiyo join ${ch.id}\`

`;
  }

  response += `---

*Prove your tier without revealing your exact score.*`;

  return {
    success: true,
    response,
    action: 'comment',
  };
}

export function generateTrustGraphResponse(stats: {
  totalNodes: number;
  totalEdges: number;
  avgTrustLevel: number;
  mostConnected: string | null;
  tierDistribution: Record<string, number>;
}): CommandResult {
  let response = `## KAMIYO Trust Graph

**Network Stats:**
- ${stats.totalNodes} agents in the trust graph
- ${stats.totalEdges} trust relationships
- ${stats.avgTrustLevel}% average trust level

**Tier Breakdown:**
`;

  for (const [tier, count] of Object.entries(stats.tierDistribution)) {
    if (count > 0) {
      response += `- ${tier.charAt(0).toUpperCase() + tier.slice(1)}: ${count}\n`;
    }
  }

  if (stats.mostConnected) {
    response += `\n**Most Connected:** @${stats.mostConnected}`;
  }

  response += `

---

Want to join the trust graph?
- Get verified: \`@kamiyo verify my reputation\`
- Trust someone: \`@kamiyo trust @agent\`

*The more connections, the stronger the network.*`;

  return {
    success: true,
    response,
    action: 'comment',
    data: stats,
  };
}
