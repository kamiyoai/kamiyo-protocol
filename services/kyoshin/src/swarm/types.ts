export type SwarmAgentStatus = 'active' | 'paused' | 'retired';
<<<<<<< HEAD
export type SwarmJobSource = 'x402' | 'direct_api' | 'relevance' | 'agent_ai' | 'kore' | 'internal';
export type SwarmMarketplaceSource = Extract<SwarmJobSource, 'relevance' | 'agent_ai' | 'kore'>;
=======
export type SwarmJobSource =
  | 'x402'
  | 'direct_api'
  | 'relevance'
  | 'agent_ai'
  | 'kore'
  | 'near_market'
  | 'internal';
export type SwarmMarketplaceSource = Extract<SwarmJobSource, 'relevance' | 'agent_ai' | 'kore' | 'near_market'>;
>>>>>>> origin/kamiyo/kyoshin-exec-canary
export type SwarmMarketplaceProfileState = 'not_listed' | 'draft' | 'submitted' | 'approved' | 'rejected';

export type SwarmMarketplaceProfile = {
  source: SwarmMarketplaceSource;
  state: SwarmMarketplaceProfileState;
  listingUrl?: string;
  ownerContact?: string;
  notes?: string;
  lastUpdatedAt?: string;
};

export type SwarmAgentProfile = {
  id: string;
  name: string;
  role: string;
  mandate: string;
  mint: string;
  feeVault?: string;
  sourceStakingPool?: string;
  claimerKeypairPath?: string;
  status: SwarmAgentStatus;
  priority: number;
  jobSources: SwarmJobSource[];
  marketplaceProfiles: SwarmMarketplaceProfile[];
  missionHints: string[];
};

export type SwarmRegistry = {
  version: number;
  parent: string;
  agents: SwarmAgentProfile[];
};

export type SwarmMission = {
  missionId: string;
  agentId: string;
  agentName: string;
  role: string;
  mint: string;
  objective: string;
  successMetric: string;
  constraints: string[];
  opportunityId?: string;
  opportunitySource?: string;
  expectedRewardSol?: number;
  assignmentReason?: string;
};

export type SwarmMissionPlan = {
  parent: string;
  registryVersion: number;
  activeAgents: number;
  selectedAgents: number;
  nextCursor: number;
  missions: SwarmMission[];
};
