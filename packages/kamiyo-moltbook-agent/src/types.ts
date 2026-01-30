export interface MoltbookPost {
  id: string;
  title: string;
  body: string;
  author: string;
  submolt: string;
  score: number;
  created_at: string;
  url?: string;
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
}
