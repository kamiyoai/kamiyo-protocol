import type {
  AgentSkill,
  AgentTier,
  Job,
  JobStatus,
  ObjectiveSpec,
} from '../types/index.js';
import {
  keiroUsePostgres,
  newEntityId,
  parseJsonArray,
  parseJsonRecord,
  parseNumeric,
  queryKeiro,
  queryKeiroOne,
  toIsoString,
} from './store.js';

const jobs = new Map<string, Job>();
const TIER_ORDER: AgentTier[] = ['unverified', 'bronze', 'silver', 'gold', 'platinum'];

type CreateJobInput = Omit<
  Job,
  'id' | 'createdAt' | 'status' | 'objectiveSpec' | 'minimumCreditScore' | 'escrowRef' | 'settlementRef' | 'receiptId'
> & {
  objectiveSpec?: ObjectiveSpec;
  minimumCreditScore?: number;
};

type JobUpdateOptions = {
  receiptId?: string | null;
  escrowRef?: string | null;
  settlementRef?: string | null;
};

function tierMeetsRequirement(agentTier: AgentTier, requiredTier: AgentTier): boolean {
  return TIER_ORDER.indexOf(agentTier) >= TIER_ORDER.indexOf(requiredTier);
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

function rowToJob(row: Record<string, unknown>): Job {
  const escrowRef = typeof row.escrow_ref === 'string' ? row.escrow_ref : undefined;

  return {
    id: String(row.id),
    title: String(row.title),
    description: String(row.description),
    requiredSkills: parseJsonArray(row.required_skills),
    requiredTier: row.required_tier as AgentTier,
    payment: parseNumeric(row.payment),
    paymentToken: row.payment_token as 'SOL' | 'USDC',
    estimatedTime: String(row.estimated_time),
    poster: String(row.poster),
    posterAddress: String(row.poster_address),
    status: row.status as JobStatus,
    assignedAgent: typeof row.assigned_agent === 'string' ? row.assigned_agent : undefined,
    escrowId: escrowRef,
    escrowRef,
    settlementRef: typeof row.settlement_ref === 'string' ? row.settlement_ref : undefined,
    receiptId: typeof row.receipt_id === 'string' ? row.receipt_id : undefined,
    objectiveSpec: parseJsonRecord(row.objective_spec, defaultObjectiveSpec({
      title: String(row.title),
      description: String(row.description),
    })) as ObjectiveSpec,
    minimumCreditScore: Number(row.minimum_credit_score ?? 0),
    createdAt: toIsoString(row.created_at),
    deadline: row.deadline ? toIsoString(row.deadline) : undefined,
  };
}

function persistInMemory(job: Job) {
  jobs.set(job.id, job);
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

  for (const job of mockJobs) {
    const seeded: Job = {
      ...job,
      id: newEntityId('job'),
      status: 'open',
      objectiveSpec: sanitizeObjectiveSpec(job.objectiveSpec, job),
      minimumCreditScore: clampCreditScore(job.minimumCreditScore),
      createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
    persistInMemory(seeded);
  }
}

if (!keiroUsePostgres) {
  seedJobs();
}

export const jobService = {
  async getAll(): Promise<Job[]> {
    if (!keiroUsePostgres) {
      return Array.from(jobs.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }

    const rows = await queryKeiro<Record<string, unknown>>(
      `SELECT *
       FROM keiro_jobs
       ORDER BY created_at DESC`
    );
    return rows.map(rowToJob);
  },

  async getById(id: string): Promise<Job | undefined> {
    if (!keiroUsePostgres) {
      return jobs.get(id);
    }

    const row = await queryKeiroOne<Record<string, unknown>>(
      `SELECT *
       FROM keiro_jobs
       WHERE id = $1
       LIMIT 1`,
      [id]
    );
    return row ? rowToJob(row) : undefined;
  },

  async getOpen(): Promise<Job[]> {
    return (await this.getAll()).filter((job) => job.status === 'open');
  },

  async getByStatus(status: JobStatus): Promise<Job[]> {
    return (await this.getAll()).filter((job) => job.status === status);
  },

  async getMatchingJobs(skills: AgentSkill[], tier: AgentTier): Promise<Job[]> {
    return (await this.getOpen()).filter((job) => {
      const hasRequiredSkill = job.requiredSkills.some((skill) => skills.includes(skill));
      const meetsTierRequirement = tierMeetsRequirement(tier, job.requiredTier);
      return hasRequiredSkill && meetsTierRequirement;
    });
  },

  async getByAgent(agentId: string): Promise<Job[]> {
    if (!keiroUsePostgres) {
      return (await this.getAll()).filter((job) => job.assignedAgent === agentId);
    }

    const rows = await queryKeiro<Record<string, unknown>>(
      `SELECT *
       FROM keiro_jobs
       WHERE assigned_agent = $1
       ORDER BY created_at DESC`,
      [agentId]
    );
    return rows.map(rowToJob);
  },

  async create(job: CreateJobInput): Promise<Job> {
    const newJob: Job = {
      ...job,
      id: newEntityId('job'),
      status: 'open',
      objectiveSpec: sanitizeObjectiveSpec(job.objectiveSpec, job),
      minimumCreditScore: clampCreditScore(job.minimumCreditScore),
      createdAt: new Date().toISOString(),
    };

    if (!keiroUsePostgres) {
      persistInMemory(newJob);
      return newJob;
    }

    await queryKeiro(
      `INSERT INTO keiro_jobs (
         id, title, description, required_skills, required_tier, payment,
         payment_token, estimated_time, poster, poster_address, status,
         assigned_agent, escrow_ref, settlement_ref, receipt_id, objective_spec,
         minimum_credit_score, deadline, created_at, updated_at
       )
       VALUES (
         $1, $2, $3, $4::jsonb, $5, $6,
         $7, $8, $9, $10, $11,
         $12, $13, $14, $15, $16::jsonb,
         $17, $18::timestamptz, $19::timestamptz, $19::timestamptz
       )`,
      [
        newJob.id,
        newJob.title,
        newJob.description,
        JSON.stringify(newJob.requiredSkills),
        newJob.requiredTier,
        newJob.payment,
        newJob.paymentToken,
        newJob.estimatedTime,
        newJob.poster,
        newJob.posterAddress,
        newJob.status,
        newJob.assignedAgent ?? null,
        newJob.escrowRef ?? null,
        newJob.settlementRef ?? null,
        newJob.receiptId ?? null,
        JSON.stringify(newJob.objectiveSpec),
        newJob.minimumCreditScore,
        newJob.deadline ?? null,
        newJob.createdAt,
      ]
    );

    return newJob;
  },

  async assign(
    jobId: string,
    agentId: string,
    escrowRef?: string,
    receiptId?: string
  ): Promise<Job | null> {
    const job = await this.getById(jobId);
    if (!job || job.status !== 'open') return null;

    const updatedJob: Job = {
      ...job,
      status: 'assigned',
      assignedAgent: agentId,
      escrowId: escrowRef,
      escrowRef,
      receiptId: receiptId ?? job.receiptId,
    };

    if (!keiroUsePostgres) {
      persistInMemory(updatedJob);
      return updatedJob;
    }

    await queryKeiro(
      `UPDATE keiro_jobs
       SET
         status = 'assigned',
         assigned_agent = $2,
         escrow_ref = $3,
         receipt_id = $4,
         updated_at = NOW()
       WHERE id = $1 AND status = 'open'`,
      [jobId, agentId, escrowRef ?? null, updatedJob.receiptId ?? null]
    );

    return updatedJob;
  },

  async updateStatus(
    jobId: string,
    status: JobStatus,
    options: JobUpdateOptions = {}
  ): Promise<Job | null> {
    const job = await this.getById(jobId);
    if (!job) return null;

    const updatedJob: Job = {
      ...job,
      status,
      receiptId: options.receiptId === undefined ? job.receiptId : options.receiptId ?? undefined,
      escrowId: options.escrowRef === undefined ? job.escrowId : options.escrowRef ?? undefined,
      escrowRef: options.escrowRef === undefined ? job.escrowRef : options.escrowRef ?? undefined,
      settlementRef:
        options.settlementRef === undefined ? job.settlementRef : options.settlementRef ?? undefined,
    };

    if (!keiroUsePostgres) {
      persistInMemory(updatedJob);
      return updatedJob;
    }

    await queryKeiro(
      `UPDATE keiro_jobs
       SET
         status = $2,
         receipt_id = $3,
         escrow_ref = $4,
         settlement_ref = $5,
         updated_at = NOW()
       WHERE id = $1`,
      [
        jobId,
        status,
        updatedJob.receiptId ?? null,
        updatedJob.escrowRef ?? null,
        updatedJob.settlementRef ?? null,
      ]
    );

    return updatedJob;
  },

  async cancel(jobId: string, options: JobUpdateOptions = {}): Promise<boolean> {
    const job = await this.getById(jobId);
    if (!job || !['open', 'assigned'].includes(job.status)) return false;

    const cancelled: Job = {
      ...job,
      status: 'cancelled',
      receiptId: options.receiptId === undefined ? job.receiptId : options.receiptId ?? undefined,
      escrowId: options.escrowRef === undefined ? job.escrowId : options.escrowRef ?? undefined,
      escrowRef: options.escrowRef === undefined ? job.escrowRef : options.escrowRef ?? undefined,
      settlementRef:
        options.settlementRef === undefined ? job.settlementRef : options.settlementRef ?? undefined,
    };

    if (!keiroUsePostgres) {
      persistInMemory(cancelled);
      return true;
    }

    await queryKeiro(
      `UPDATE keiro_jobs
       SET
         status = 'cancelled',
         receipt_id = $2,
         escrow_ref = $3,
         settlement_ref = $4,
         updated_at = NOW()
       WHERE id = $1`,
      [
        jobId,
        cancelled.receiptId ?? null,
        cancelled.escrowRef ?? null,
        cancelled.settlementRef ?? null,
      ]
    );

    return true;
  },
};

export { tierMeetsRequirement };
