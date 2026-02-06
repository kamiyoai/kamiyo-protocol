// Opus for high-quality content generation (posts, comments, deliverables)
export const DEFAULT_MODEL = 'claude-opus-4-6';
// Haiku for cheap classification tasks (sentiment, topics, relevance, intent)
export const FAST_MODEL = 'claude-haiku-3-5-20241022';

export interface MoltbookPost {
  id: string;
  title: string;
  body: string;
  author: string;
  submolt: string;
  score: number;
  created_at: string;
  url?: string;
  comments?: MoltbookComment[];
}

export interface MoltbookComment {
  id: string;
  post_id: string;
  author: string;
  content: string;
  parent_id?: string;
  created_at: string;
}

export interface MoltbookSearchResult {
  posts: MoltbookPost[];
  agents: { name: string; description: string }[];
  submolts: { name: string; description: string }[];
}

export interface JobEvaluation {
  relevant: boolean;
  reason: string;
  suggestedPrice?: number;
  complexity?: 'low' | 'medium' | 'high';
}

export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'expired';
export type JobStatus = 'created' | 'in_progress' | 'delivered' | 'completed' | 'disputed';

export interface Offer {
  id: number;
  postId: string;
  priceSol: number;
  offeredAt: number;
  status: OfferStatus;
}

export interface Job {
  id: number;
  postId: string;
  requesterWallet: string;
  escrowAddress: string | null;
  escrowTx: string | null;
  amountSol: number;
  description: string;
  status: JobStatus;
  deliverable: string | null;
  createdAt: number;
  completedAt: number | null;
}

export interface WorkResult {
  complete: boolean;
  deliverable: string;
  error?: string;
}

export interface AgentConfig {
  moltbookApiKey: string;
  anthropicApiKey: string;
  solanaRpcUrl: string;
  agentPrivateKey: string;
  programId: string;
  pollIntervalMs: number;
  minJobPriceSol: number;
  maxConcurrentJobs: number;
  dbPath: string;
  enableProactivePosting?: boolean;
  minPostIntervalMs?: number;
  // Phase 4: DKG + Identity
  dkgEndpoint?: string;
  dkgPort?: number;
  dkgBlockchain?: string;
  dkgPublicKey?: string;
  dkgPrivateKey?: string;
  chainId?: number;
  erc8004RegistryAddress?: string;
  // Escrow treasury
  treasuryAddress?: string;
  // x402 payment protocol
  enableX402?: boolean;
  x402FacilitatorUrl?: string;
}

// Proactive posting types

export interface OwnPost {
  id: number;
  postId: string;
  title: string;
  body: string;
  submolt: string;
  category: string;
  topic: string;
  postedAt: number;
  upvotes: number;
  commentCount: number;
}

export interface TrustEdge {
  id: number;
  fromAgent: string;
  toAgent: string;
  trustLevel: number;
  trustType: 'vouches' | 'delegates' | 'endorses';
  stakeSol: number;
  ual: string | null;
  createdAt: number;
}

export interface ReputationProof {
  id: number;
  agentId: string;
  tier: number;
  nullifierHash: string;
  proofFormat: 'solana' | 'evm';
  ual: string | null;
  moltbookPostId: string | null;
  createdAt: number;
}

export interface Badge {
  id: number;
  badgeId: string;
  agentId: string;
  badgeType: 'reputation-verified' | 'transaction-count' | 'dispute-free';
  tier: number;
  ual: string | null;
  issuedAt: number;
  expiresAt: number | null;
}

export interface AgentJob {
  id: number;
  jobId: string;
  postId: string | null;
  posterAgent: string;
  title: string;
  description: string;
  budgetSol: number;
  capability: string;
  requiredTier: number;
  status: 'open' | 'assigned' | 'in_progress' | 'delivered' | 'completed';
  assignedTo: string | null;
  escrowAddress: string | null;
  createdAt: number;
}

export interface EngagementMetrics {
  postId: string;
  upvotes: number;
  comments: number;
  lastChecked: number;
}
