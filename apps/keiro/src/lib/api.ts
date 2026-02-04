import { API_URL } from './constants';
import type { AgentPersonality, AgentSkill } from '../stores/agent';

// Types matching the API
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

class KeiroApi {
  private baseUrl: string;

  constructor(baseUrl: string = API_URL) {
    this.baseUrl = baseUrl;
  }

  private async fetch<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Agents
  async getAgent(id: string): Promise<ApiAgent> {
    const { agent } = await this.fetch<{ agent: ApiAgent }>(`/api/agents/${id}`);
    return agent;
  }

  async getAgentByWallet(walletAddress: string): Promise<ApiAgent | null> {
    try {
      const { agent } = await this.fetch<{ agent: ApiAgent }>(
        `/api/agents/wallet/${walletAddress}`
      );
      return agent;
    } catch {
      return null;
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
    const { agent } = await this.fetch<{ agent: ApiAgent }>(`/api/agents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    return agent;
  }

  async toggleAgentActive(id: string): Promise<ApiAgent> {
    const { agent } = await this.fetch<{ agent: ApiAgent }>(
      `/api/agents/${id}/toggle-active`,
      { method: 'POST' }
    );
    return agent;
  }

  async getLeaderboard(limit: number = 10): Promise<ApiAgent[]> {
    const { agents } = await this.fetch<{ agents: ApiAgent[] }>(
      `/api/agents/leaderboard?limit=${limit}`
    );
    return agents;
  }

  // Jobs
  async getJobs(status?: string): Promise<ApiJob[]> {
    const query = status ? `?status=${status}` : '';
    const { jobs } = await this.fetch<{ jobs: ApiJob[] }>(`/api/jobs${query}`);
    return jobs;
  }

  async getOpenJobs(): Promise<ApiJob[]> {
    const { jobs } = await this.fetch<{ jobs: ApiJob[] }>('/api/jobs/open');
    return jobs;
  }

  async getMatchingJobs(agentId: string): Promise<ApiJob[]> {
    const { jobs } = await this.fetch<{ jobs: ApiJob[] }>(
      `/api/jobs/matching/${agentId}`
    );
    return jobs;
  }

  async getAgentJobs(agentId: string): Promise<ApiJob[]> {
    const { jobs } = await this.fetch<{ jobs: ApiJob[] }>(
      `/api/jobs/agent/${agentId}`
    );
    return jobs;
  }

  async getJob(id: string): Promise<ApiJob> {
    const { job } = await this.fetch<{ job: ApiJob }>(`/api/jobs/${id}`);
    return job;
  }

  async acceptJob(
    jobId: string,
    agentId: string,
    walletAddress: string
  ): Promise<{ job: ApiJob; escrowId: string }> {
    return this.fetch(`/api/jobs/${jobId}/accept`, {
      method: 'POST',
      body: JSON.stringify({ agentId, walletAddress }),
    });
  }

  async startJob(jobId: string): Promise<ApiJob> {
    const { job } = await this.fetch<{ job: ApiJob }>(`/api/jobs/${jobId}/start`, {
      method: 'POST',
    });
    return job;
  }

  async submitTask(
    jobId: string,
    agentId: string,
    result: string,
    proof?: string
  ): Promise<{ job: ApiJob; submission: any }> {
    return this.fetch(`/api/jobs/${jobId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ agentId, result, proof }),
    });
  }

  async disputeJob(jobId: string): Promise<ApiJob> {
    const { job } = await this.fetch<{ job: ApiJob }>(`/api/jobs/${jobId}/dispute`, {
      method: 'POST',
    });
    return job;
  }

  // Earnings
  async getEarnings(agentId: string, status?: string): Promise<ApiEarning[]> {
    const query = status ? `?status=${status}` : '';
    const { earnings } = await this.fetch<{ earnings: ApiEarning[] }>(
      `/api/earnings/agent/${agentId}${query}`
    );
    return earnings;
  }

  async getEarningsStats(agentId: string): Promise<EarningsStats> {
    const { stats } = await this.fetch<{ stats: EarningsStats }>(
      `/api/earnings/agent/${agentId}/stats`
    );
    return stats;
  }

  async getPendingEarnings(
    agentId: string
  ): Promise<{ earnings: ApiEarning[]; total: { sol: number; usdc: number } }> {
    return this.fetch(`/api/earnings/agent/${agentId}/pending`);
  }

  // Reputation
  async getReputation(agentId: string): Promise<ReputationData> {
    const { reputation } = await this.fetch<{ reputation: ReputationData }>(
      `/api/reputation/agent/${agentId}`
    );
    return reputation;
  }

  async getTiers(): Promise<Record<string, any>> {
    const { tiers } = await this.fetch<{ tiers: Record<string, any> }>(
      '/api/reputation/tiers'
    );
    return tiers;
  }

  // Health check
  async health(): Promise<boolean> {
    try {
      await this.fetch('/health');
      return true;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const api = new KeiroApi();

// Export class for custom instances
export { KeiroApi };
