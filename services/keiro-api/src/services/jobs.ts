import type { AgentSkill, AgentTier, Job, JobStatus, ObjectiveSpec } from '../types/index.js';

const jobs = new Map<string, Job>();
const TIER_ORDER: AgentTier[] = ['unverified', 'bronze', 'silver', 'gold', 'platinum'];

type CreateJobInput = Omit<Job, 'id' | 'createdAt' | 'status' | 'objectiveSpec' | 'minimumCreditScore'> & {
  objectiveSpec?: ObjectiveSpec;
  minimumCreditScore?: number;
};

function tierMeetsRequirement(agentTier: AgentTier, requiredTier: AgentTier): boolean {
  return TIER_ORDER.indexOf(agentTier) >= TIER_ORDER.indexOf(requiredTier);
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function clampCreditScore(score: number | undefined): number {
  if (typeof score !== 'number' || !Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function defaultObjectiveSpec(job: Pick<CreateJobInput, 'title' | 'description'>): ObjectiveSpec {
  const headline = job.title.trim();
  const summary = job.description.trim().replace(/\s+/g, ' ').slice(0, 120);

  return {
    acceptanceCriteria: [
      `Deliver a complete result for: ${headline}.`,
      'Include concise evidence or references supporting key claims.',
      `Ensure final output aligns with this scope: ${summary}.`,
    ],
    verification: 'hybrid',
    evidenceRequired: true,
  };
}

function sanitizeObjectiveSpec(
  objectiveSpec: ObjectiveSpec | undefined,
  fallback: Pick<CreateJobInput, 'title' | 'description'>
): ObjectiveSpec {
  if (!objectiveSpec) return defaultObjectiveSpec(fallback);

  const acceptanceCriteria = objectiveSpec.acceptanceCriteria
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);

  if (acceptanceCriteria.length === 0) {
    return defaultObjectiveSpec(fallback);
  }

  return {
    acceptanceCriteria,
    verification: objectiveSpec.verification,
    evidenceRequired: objectiveSpec.evidenceRequired,
  };
}

function seedJobs() {
  const mockJobs: CreateJobInput[] = [
    {
      title: 'Research DeFi Protocol Security',
      description:
        'Analyze the smart contract architecture and identify potential vulnerabilities in a new DeFi lending protocol. Provide a detailed security report.',
      requiredSkills: ['research', 'code_review'],
      requiredTier: 'unverified',
      minimumCreditScore: 10,
      payment: 0.5,
      paymentToken: 'SOL',
      estimatedTime: '2-3 hours',
      poster: 'DefiProtocol.sol',
      posterAddress: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
      objectiveSpec: {
        acceptanceCriteria: [
          'List at least 5 concrete vulnerabilities or risk findings.',
          'Rank each finding by severity with remediation suggestions.',
          'Attach references to specific contract sections or functions.',
        ],
        verification: 'objective',
        evidenceRequired: true,
      },
    },
    {
      title: 'Technical Documentation Update',
      description:
        'Update API documentation for a blockchain indexer service. Must be clear, accurate, and developer-friendly.',
      requiredSkills: ['writing', 'research'],
      requiredTier: 'unverified',
      minimumCreditScore: 0,
      payment: 25,
      paymentToken: 'USDC',
      estimatedTime: '1-2 hours',
      poster: 'IndexerDAO',
      posterAddress: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
      objectiveSpec: {
        acceptanceCriteria: [
          'Update all endpoint descriptions and parameter tables.',
          'Include one working request/response example per endpoint.',
          'Maintain a changelog section for new and deprecated fields.',
        ],
        verification: 'hybrid',
        evidenceRequired: true,
      },
    },
    {
      title: 'Data Analysis - Token Metrics',
      description:
        'Analyze on-chain data for token holder distribution and trading patterns over the past 30 days. Deliver insights report.',
      requiredSkills: ['data_analysis', 'research'],
      requiredTier: 'bronze',
      minimumCreditScore: 25,
      payment: 1.2,
      paymentToken: 'SOL',
      estimatedTime: '3-4 hours',
      poster: 'TokenAnalytics',
      posterAddress: '3fTR8GGL2mniGyHtd3Qy2KDVhZ9LHbW1GHHwqmBVzfPd',
      objectiveSpec: {
        acceptanceCriteria: [
          'Provide holder concentration and distribution metrics over 30 days.',
          'Identify top 3 abnormal trading pattern events with timestamps.',
          'Submit a concise executive summary and raw metric appendix.',
        ],
        verification: 'objective',
        evidenceRequired: true,
      },
    },
    {
      title: 'Smart Contract Code Review',
      description:
        'Review Anchor program for a new NFT staking mechanism. Check for reentrancy, overflow, and access control issues.',
      requiredSkills: ['code_review'],
      requiredTier: 'silver',
      minimumCreditScore: 45,
      payment: 100,
      paymentToken: 'USDC',
      estimatedTime: '4-6 hours',
      poster: 'NFTStaking.xyz',
      posterAddress: 'Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS',
      objectiveSpec: {
        acceptanceCriteria: [
          'Audit access control, arithmetic safety, and account validation paths.',
          'Include exploitability notes and reproducible proof-of-concept steps.',
          'Return a prioritized remediation checklist.',
        ],
        verification: 'objective',
        evidenceRequired: true,
      },
    },
    {
      title: 'Translate Whitepaper to Spanish',
      description:
        'Translate 15-page technical whitepaper from English to Spanish. Must maintain technical accuracy and readability.',
      requiredSkills: ['translation', 'writing'],
      requiredTier: 'unverified',
      minimumCreditScore: 5,
      payment: 0.8,
      paymentToken: 'SOL',
      estimatedTime: '5-6 hours',
      poster: 'GlobalDAO',
      posterAddress: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
      objectiveSpec: {
        acceptanceCriteria: [
          'Translate all sections with terminology consistency.',
          'Preserve technical meaning and equations exactly.',
          'Provide glossary of key protocol-specific terms.',
        ],
        verification: 'hybrid',
        evidenceRequired: false,
      },
    },
    {
      title: 'Market Research Report',
      description:
        'Compile comprehensive market research on AI agent protocols in the Solana ecosystem. Include competitive analysis.',
      requiredSkills: ['research', 'writing'],
      requiredTier: 'bronze',
      minimumCreditScore: 30,
      payment: 2.0,
      paymentToken: 'SOL',
      estimatedTime: '6-8 hours',
      poster: 'VentureDAO',
      posterAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      objectiveSpec: {
        acceptanceCriteria: [
          'Compare at least 8 protocols with feature and moat breakdown.',
          'Quantify TAM assumptions and near-term adoption indicators.',
          'Recommend top 3 opportunities with rationale and risks.',
        ],
        verification: 'objective',
        evidenceRequired: true,
      },
    },
    {
      title: 'API Integration Testing',
      description:
        'Write integration tests for a REST API. Cover all endpoints with positive and negative test cases.',
      requiredSkills: ['code_review', 'general'],
      requiredTier: 'unverified',
      minimumCreditScore: 0,
      payment: 0.3,
      paymentToken: 'SOL',
      estimatedTime: '2 hours',
      poster: 'TestingLabs',
      posterAddress: 'So11111111111111111111111111111111111111112',
      objectiveSpec: {
        acceptanceCriteria: [
          'Cover all documented endpoints with at least one happy-path test.',
          'Add negative-path coverage for auth and validation failures.',
          'Produce a deterministic command to run the full test suite.',
        ],
        verification: 'objective',
        evidenceRequired: true,
      },
    },
    {
      title: 'Content Writing - Blog Series',
      description:
        'Write 3 educational blog posts about Solana development basics. Each post 800-1000 words.',
      requiredSkills: ['writing'],
      requiredTier: 'unverified',
      minimumCreditScore: 15,
      payment: 50,
      paymentToken: 'USDC',
      estimatedTime: '4-5 hours',
      poster: 'SolanaLearn',
      posterAddress: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
      objectiveSpec: {
        acceptanceCriteria: [
          'Deliver 3 posts, each between 800 and 1000 words.',
          'Include runnable examples and one diagram suggestion per post.',
          'Maintain a beginner-friendly tone without factual inaccuracies.',
        ],
        verification: 'hybrid',
        evidenceRequired: false,
      },
    },
  ];

  mockJobs.forEach((job) => {
    const id = newId('job');
    jobs.set(id, {
      ...job,
      id,
      status: 'open',
      objectiveSpec: sanitizeObjectiveSpec(job.objectiveSpec, job),
      minimumCreditScore: clampCreditScore(job.minimumCreditScore),
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

  create(job: CreateJobInput): Job {
    const id = newId('job');
    const newJob: Job = {
      ...job,
      id,
      status: 'open',
      objectiveSpec: sanitizeObjectiveSpec(job.objectiveSpec, job),
      minimumCreditScore: clampCreditScore(job.minimumCreditScore),
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
