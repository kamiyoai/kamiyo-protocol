import type { Job, JobStatus, AgentSkill, AgentTier } from '../types/index.js';

const jobs = new Map<string, Job>();
const TIER_ORDER: AgentTier[] = ['unverified', 'bronze', 'silver', 'gold', 'platinum'];

function tierMeetsRequirement(agentTier: AgentTier, requiredTier: AgentTier): boolean {
  return TIER_ORDER.indexOf(agentTier) >= TIER_ORDER.indexOf(requiredTier);
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function seedJobs() {
  const mockJobs: Omit<Job, 'id' | 'createdAt'>[] = [
    {
      title: 'Research DeFi Protocol Security',
      description:
        'Analyze the smart contract architecture and identify potential vulnerabilities in a new DeFi lending protocol. Provide a detailed security report.',
      requiredSkills: ['research', 'code_review'],
      requiredTier: 'unverified',
      payment: 0.5,
      paymentToken: 'SOL',
      estimatedTime: '2-3 hours',
      poster: 'DefiProtocol.sol',
      posterAddress: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
      status: 'open',
    },
    {
      title: 'Technical Documentation Update',
      description:
        'Update API documentation for a blockchain indexer service. Must be clear, accurate, and developer-friendly.',
      requiredSkills: ['writing', 'research'],
      requiredTier: 'unverified',
      payment: 25,
      paymentToken: 'USDC',
      estimatedTime: '1-2 hours',
      poster: 'IndexerDAO',
      posterAddress: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
      status: 'open',
    },
    {
      title: 'Data Analysis - Token Metrics',
      description:
        'Analyze on-chain data for token holder distribution and trading patterns over the past 30 days. Deliver insights report.',
      requiredSkills: ['data_analysis', 'research'],
      requiredTier: 'bronze',
      payment: 1.2,
      paymentToken: 'SOL',
      estimatedTime: '3-4 hours',
      poster: 'TokenAnalytics',
      posterAddress: '3fTR8GGL2mniGyHtd3Qy2KDVhZ9LHbW1GHHwqmBVzfPd',
      status: 'open',
    },
    {
      title: 'Smart Contract Code Review',
      description:
        'Review Anchor program for a new NFT staking mechanism. Check for reentrancy, overflow, and access control issues.',
      requiredSkills: ['code_review'],
      requiredTier: 'silver',
      payment: 100,
      paymentToken: 'USDC',
      estimatedTime: '4-6 hours',
      poster: 'NFTStaking.xyz',
      posterAddress: 'Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS',
      status: 'open',
    },
    {
      title: 'Translate Whitepaper to Spanish',
      description:
        'Translate 15-page technical whitepaper from English to Spanish. Must maintain technical accuracy and readability.',
      requiredSkills: ['translation', 'writing'],
      requiredTier: 'unverified',
      payment: 0.8,
      paymentToken: 'SOL',
      estimatedTime: '5-6 hours',
      poster: 'GlobalDAO',
      posterAddress: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
      status: 'open',
    },
    {
      title: 'Market Research Report',
      description:
        'Compile comprehensive market research on AI agent protocols in the Solana ecosystem. Include competitive analysis.',
      requiredSkills: ['research', 'writing'],
      requiredTier: 'bronze',
      payment: 2.0,
      paymentToken: 'SOL',
      estimatedTime: '6-8 hours',
      poster: 'VentureDAO',
      posterAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      status: 'open',
    },
    {
      title: 'API Integration Testing',
      description:
        'Write integration tests for a REST API. Cover all endpoints with positive and negative test cases.',
      requiredSkills: ['code_review', 'general'],
      requiredTier: 'unverified',
      payment: 0.3,
      paymentToken: 'SOL',
      estimatedTime: '2 hours',
      poster: 'TestingLabs',
      posterAddress: 'So11111111111111111111111111111111111111112',
      status: 'open',
    },
    {
      title: 'Content Writing - Blog Series',
      description:
        'Write 3 educational blog posts about Solana development basics. Each post 800-1000 words.',
      requiredSkills: ['writing'],
      requiredTier: 'unverified',
      payment: 50,
      paymentToken: 'USDC',
      estimatedTime: '4-5 hours',
      poster: 'SolanaLearn',
      posterAddress: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
      status: 'open',
    },
  ];

  mockJobs.forEach((job, index) => {
    const id = newId('job');
    jobs.set(id, {
      ...job,
      id,
      createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
  });
}

seedJobs();

export const jobService = {
  getAll(): Job[] {
    return Array.from(jobs.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },

  getById(id: string): Job | undefined {
    return jobs.get(id);
  },

  getOpen(): Job[] {
    return this.getAll().filter((job) => job.status === 'open');
  },

  getByStatus(status: JobStatus): Job[] {
    return this.getAll().filter((job) => job.status === status);
  },

  getMatchingJobs(skills: AgentSkill[], tier: AgentTier): Job[] {
    return this.getOpen().filter((job) => {
      const hasRequiredSkill = job.requiredSkills.some((skill) => skills.includes(skill));
      const meetsTierRequirement = tierMeetsRequirement(tier, job.requiredTier);
      return hasRequiredSkill && meetsTierRequirement;
    });
  },

  getByAgent(agentId: string): Job[] {
    return this.getAll().filter((job) => job.assignedAgent === agentId);
  },

  create(job: Omit<Job, 'id' | 'createdAt' | 'status'>): Job {
    const id = newId('job');
    const newJob: Job = {
      ...job,
      id,
      status: 'open',
      createdAt: new Date().toISOString(),
    };
    jobs.set(id, newJob);
    return newJob;
  },

  assign(jobId: string, agentId: string, escrowId?: string): Job | null {
    const job = jobs.get(jobId);
    if (!job || job.status !== 'open') return null;

    const updatedJob: Job = {
      ...job,
      status: 'assigned',
      assignedAgent: agentId,
      escrowId,
    };
    jobs.set(jobId, updatedJob);
    return updatedJob;
  },

  updateStatus(jobId: string, status: JobStatus): Job | null {
    const job = jobs.get(jobId);
    if (!job) return null;

    const updatedJob: Job = { ...job, status };
    jobs.set(jobId, updatedJob);
    return updatedJob;
  },

  cancel(jobId: string): boolean {
    const job = jobs.get(jobId);
    if (!job || !['open', 'assigned'].includes(job.status)) return false;

    jobs.set(jobId, { ...job, status: 'cancelled' });
    return true;
  },
};
