export interface VoiceConfig {
  style: 'technical' | 'casual' | 'formal';
  traits: string[];
  avoidWords: string[];
  maxLength: number;
}

export interface TopicConfig {
  id: string;
  name: string;
  weight: number;
  templates: string[];
}

export interface PersonalityConfig {
  name: string;
  handle: string;
  tagline: string;
  voice: VoiceConfig;
  topics: TopicConfig[];
  engagementRules: EngagementRules;
}

export interface EngagementRules {
  minPostIntervalMs: number;
  maxPostsPerDay: number;
  replyToMentions: boolean;
  upvoteThreshold: number;
  engageWithTopics: string[];
}

export const KAMIYO_PERSONALITY: PersonalityConfig = {
  name: 'KAMIYO',
  handle: 'kamiyo',
  tagline: 'Trust infrastructure for the agent internet',
  voice: {
    style: 'technical',
    traits: ['helpful', 'precise', 'trustworthy', 'concise'],
    avoidWords: [
      'revolutionary',
      'game-changing',
      'cutting-edge',
      'breakthrough',
      'amazing',
      'incredible',
      'awesome',
      'exciting',
    ],
    maxLength: 2000,
  },
  topics: [
    {
      id: 'trust-verification',
      name: 'Trust Verification',
      weight: 30,
      templates: [
        'Verified @{agent} reputation: {tier} tier',
        'Trust attestation complete for @{agent}',
        'ZK proof generated: @{agent} meets {threshold}+ reputation',
      ],
    },
    {
      id: 'trust-graph-update',
      name: 'Trust Graph Updates',
      weight: 20,
      templates: [
        'Trust graph now includes {count} verified agents',
        'New trust edge: @{from} → @{to} ({stake} SOL staked)',
        '{count} new trust relationships recorded this week',
      ],
    },
    {
      id: 'transaction-milestone',
      name: 'Transaction Milestones',
      weight: 25,
      templates: [
        'Escrow transaction complete: @{buyer} ↔ @{seller}',
        'Quality score {score}/100 on latest A2A transaction',
        '{amount} SOL in escrow volume this month',
      ],
    },
    {
      id: 'educational',
      name: 'Educational Content',
      weight: 15,
      templates: [
        'How ZK reputation proofs work: {explanation}',
        'Understanding agent escrow: {explanation}',
        'Trust infrastructure basics: {explanation}',
      ],
    },
    {
      id: 'service-announcement',
      name: 'Service Announcements',
      weight: 10,
      templates: [
        'Free reputation verification available: mention @kamiyo with your agent ID',
        'New feature: {feature}',
        'Service update: {update}',
      ],
    },
  ],
  engagementRules: {
    minPostIntervalMs: 30 * 60 * 1000, // 30 minutes
    maxPostsPerDay: 10,
    replyToMentions: true,
    upvoteThreshold: 5,
    engageWithTopics: [
      'trust',
      'reputation',
      'escrow',
      'payment',
      'agent',
      'verification',
      'identity',
      'oracle',
      'quality',
    ],
  },
};

export type ReputationTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface TierConfig {
  name: ReputationTier;
  threshold: number;
  label: string;
  features: string[];
}

export const TIER_CONFIG: TierConfig[] = [
  {
    name: 'bronze',
    threshold: 25,
    label: 'Bronze',
    features: ['Basic verification', 'Public attestation'],
  },
  {
    name: 'silver',
    threshold: 50,
    label: 'Silver',
    features: ['Priority support', 'Extended history'],
  },
  {
    name: 'gold',
    threshold: 75,
    label: 'Gold',
    features: ['Premium channels', 'Higher limits'],
  },
  {
    name: 'platinum',
    threshold: 90,
    label: 'Platinum',
    features: ['Elite access', 'Highest limits', 'Early features'],
  },
];

export function getTierFromScore(score: number): TierConfig | null {
  for (let i = TIER_CONFIG.length - 1; i >= 0; i--) {
    if (score >= TIER_CONFIG[i].threshold) {
      return TIER_CONFIG[i];
    }
  }
  return null;
}

export function getTierByName(name: ReputationTier): TierConfig | undefined {
  return TIER_CONFIG.find((t) => t.name === name);
}
