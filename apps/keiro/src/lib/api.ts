import { API_URL } from './constants';
import type { AgentPersonality, AgentSkill } from '../stores/agent';

export interface ApiAgent {
  id: string;
  walletAddress: string;
  name: string;
  personality: AgentPersonality;
  skills: AgentSkill[];
  tier: 'unverified' | 'bronze' | 'silver' | 'gold' | 'platinum';
  creditScore: number;
  tasksCompleted: number;
  disputeCount: number;
  tenureDays: number;
  avgQuality: number;
  isActive: boolean;
  createdAt: string;
  globalId?: string;
}

export interface ApiJob {
  id: string;
  title: string;
  description: string;
  requiredSkills: AgentSkill[];
  requiredTier: string;
  payment: number;
  paymentToken: 'SOL' | 'USDC';
  estimatedTime: string;
  poster: string;
  posterAddress: string;
  status: string;
  assignedAgent?: string;
  escrowId?: string;
  createdAt: string;
  deadline?: string;
}

export interface ApiEarning {
  id: string;
  agentId: string;
  jobId: string;
  amount: number;
  token: 'SOL' | 'USDC';
  status: 'pending' | 'released' | 'disputed';
  createdAt: string;
  releasedAt?: string;
}

export interface EarningsStats {
  today: number;
  thisWeek: number;
  thisMonth: number;
  totalEarned: { sol: number; usdc: number };
  totalPending: { sol: number; usdc: number };
  transactionCount: number;
}

export interface ReputationData {
  agentId: string;
  globalId?: string;
  creditScore: number;
  tier: string;
  components: {
    taskQuality: { score: number; weight: number; raw: number; description: string };
    reliability: { score: number; weight: number; raw: number; description: string };
    disputeRecord: { score: number; weight: number; raw: number; description: string };
    peerTrust: { score: number; weight: number; raw: number; description: string };
    tenure: { score: number; weight: number; raw: number; description: string };
  };
  stats: {
    tasksCompleted: number;
    disputeCount: number;
    tenureDays: number;
    avgQuality: number;
  };
  tierProgress: {
    currentTier: string;
    nextTier: string | null;
    pointsToNext: number;
    progress: number;
  };
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const REQUEST_TIMEOUT = 15_000;
const MAX_RETRIES = 2;

class KeiroApi {
  private baseUrl: string;

  constructor(baseUrl: string = API_URL) {
    this.baseUrl = baseUrl;
  }

  private async fetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            ...options.headers,
          },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new ApiError(
            body.error || `Request failed with status ${response.status}`,
            response.status,
            body.code
          );
        }

        return response.json();
      } catch (err) {
        lastError = err as Error;

        if (err instanceof ApiError && err.status < 500) {
          throw err;
        }

        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }

    clearTimeout(timeoutId);
    throw lastError || new ApiError('Request failed', 500);
  }

  async getAgent(id: string): Promise<ApiAgent> {
    const { agent } = await this.fetch<{ agent: ApiAgent }>(`/api/agents/${encodeURIComponent(id)}`);
    return agent;
  }

  async getAgentByWallet(walletAddress: string): Promise<ApiAgent | null> {
    try {
      const { agent } = await this.fetch<{ agent: ApiAgent }>(
        `/api/agents/wallet/${encodeURIComponent(walletAddress)}`
      );
      return agent;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  }

  async createAgent(data: {
    walletAddress: string;
    name: string;
    personality: AgentPersonality;
    skills: AgentSkill[];
  }): Promise<ApiAgent> {
    const { agent } = await this.fetch<{ agent: ApiAgent }>('/api/agents', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return agent;
  }

  async updateAgent(
    id: string,
    updates: Partial<Pick<ApiAgent, 'name' | 'personality' | 'skills' | 'isActive'>>
  ): Promise<ApiAgent> {
    const { agent } = await this.fetch<{ agent: ApiAgent }>(
      `/api/agents/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(updates) }
    );
    return agent;
  }

  async toggleAgentActive(id: string): Promise<ApiAgent> {
    const { agent } = await this.fetch<{ agent: ApiAgent }>(
      `/api/agents/${encodeURIComponent(id)}/toggle-active`,
      { method: 'POST' }
    );
    return agent;
  }

  async getLeaderboard(limit = 10): Promise<ApiAgent[]> {
    const safeLimit = Math.min(100, Math.max(1, limit));
    const { agents } = await this.fetch<{ agents: ApiAgent[] }>(
      `/api/agents/leaderboard?limit=${safeLimit}`
    );
    return agents;
  }

  async getJobs(status?: string): Promise<ApiJob[]> {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    const { jobs } = await this.fetch<{ jobs: ApiJob[] }>(`/api/jobs${query}`);
    return jobs;
  }

  async getOpenJobs(): Promise<ApiJob[]> {
    const { jobs } = await this.fetch<{ jobs: ApiJob[] }>('/api/jobs/open');
    return jobs;
  }

  async getMatchingJobs(agentId: string): Promise<ApiJob[]> {
    const { jobs } = await this.fetch<{ jobs: ApiJob[] }>(
      `/api/jobs/matching/${encodeURIComponent(agentId)}`
    );
    return jobs;
  }

  async getAgentJobs(agentId: string): Promise<ApiJob[]> {
    const { jobs } = await this.fetch<{ jobs: ApiJob[] }>(
      `/api/jobs/agent/${encodeURIComponent(agentId)}`
    );
    return jobs;
  }

  async getJob(id: string): Promise<ApiJob> {
    const { job } = await this.fetch<{ job: ApiJob }>(`/api/jobs/${encodeURIComponent(id)}`);
    return job;
  }

  async acceptJob(
    jobId: string,
    agentId: string,
    walletAddress: string
  ): Promise<{ job: ApiJob; escrowId: string }> {
    return this.fetch(`/api/jobs/${encodeURIComponent(jobId)}/accept`, {
      method: 'POST',
      body: JSON.stringify({ agentId, walletAddress }),
    });
  }

  async startJob(jobId: string): Promise<ApiJob> {
    const { job } = await this.fetch<{ job: ApiJob }>(
      `/api/jobs/${encodeURIComponent(jobId)}/start`,
      { method: 'POST' }
    );
    return job;
  }

  async submitTask(
    jobId: string,
    agentId: string,
    result: string,
    proof?: string
  ): Promise<{ job: ApiJob; submission: { jobId: string; agentId: string; submittedAt: string } }> {
    return this.fetch(`/api/jobs/${encodeURIComponent(jobId)}/submit`, {
      method: 'POST',
      body: JSON.stringify({ agentId, result, proof }),
    });
  }

  async disputeJob(jobId: string): Promise<ApiJob> {
    const { job } = await this.fetch<{ job: ApiJob }>(
      `/api/jobs/${encodeURIComponent(jobId)}/dispute`,
      { method: 'POST' }
    );
    return job;
  }

  async getEarnings(agentId: string, status?: string): Promise<ApiEarning[]> {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    const { earnings } = await this.fetch<{ earnings: ApiEarning[] }>(
      `/api/earnings/agent/${encodeURIComponent(agentId)}${query}`
    );
    return earnings;
  }

  async getEarningsStats(agentId: string): Promise<EarningsStats> {
    const { stats } = await this.fetch<{ stats: EarningsStats }>(
      `/api/earnings/agent/${encodeURIComponent(agentId)}/stats`
    );
    return stats;
  }

  async getPendingEarnings(
    agentId: string
  ): Promise<{ earnings: ApiEarning[]; total: { sol: number; usdc: number } }> {
    return this.fetch(`/api/earnings/agent/${encodeURIComponent(agentId)}/pending`);
  }

  async getReputation(agentId: string): Promise<ReputationData> {
    const { reputation } = await this.fetch<{ reputation: ReputationData }>(
      `/api/reputation/agent/${encodeURIComponent(agentId)}`
    );
    return reputation;
  }

  async getTiers(): Promise<Record<string, unknown>> {
    const { tiers } = await this.fetch<{ tiers: Record<string, unknown> }>('/api/reputation/tiers');
    return tiers;
  }

  async health(): Promise<boolean> {
    try {
      await this.fetch('/health');
      return true;
    } catch {
      return false;
    }
  }
}

export const api = new KeiroApi();
export { KeiroApi };
