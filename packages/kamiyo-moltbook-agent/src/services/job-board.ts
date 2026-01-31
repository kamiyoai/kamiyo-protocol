import Anthropic from '@anthropic-ai/sdk';
import type { JobDatabase } from '../db.js';
import type { AgentJob } from '../types.js';
import type { DKGPublisher } from './dkg-publisher.js';
import type { TierConfig } from '../personality.js';

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 10000;
const MAX_BIDS_PER_JOB = 100;
const MAX_JOBS_CACHE = 1000;
const INFER_TIMEOUT_MS = 5000;

export interface JobPostRequest {
  posterAgent: string;
  title: string;
  description: string;
  budgetSol: number;
  capability: string;
  requiredTier?: number;
}

export interface JobBidRequest {
  jobId: string;
  bidderAgent: string;
  bidAmount: number;
  proposal?: string;
}

export interface JobBid {
  id: number;
  jobId: string;
  bidderAgent: string;
  bidAmount: number;
  proposal: string;
  tier: number;
  createdAt: number;
}

export interface JobBoardStats {
  openJobs: number;
  completedJobs: number;
  totalVolume: number;
  avgQualityScore: number;
}

export interface JobBoardConfig {
  db: JobDatabase;
  anthropic: Anthropic;
  dkg?: DKGPublisher;
  minBudgetSol: number;
  maxBudgetSol: number;
}

function generateJobId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `job-${timestamp}-${random}`;
}

export class JobBoard {
  private db: JobDatabase;
  private anthropic: Anthropic;
  private dkg?: DKGPublisher;
  private minBudgetSol: number;
  private maxBudgetSol: number;

  // In-memory bid storage (would be in DB in production)
  private bids = new Map<string, JobBid[]>();

  constructor(config: JobBoardConfig) {
    this.db = config.db;
    this.anthropic = config.anthropic;
    this.dkg = config.dkg;
    this.minBudgetSol = config.minBudgetSol;
    this.maxBudgetSol = config.maxBudgetSol;
  }

  async postJob(request: JobPostRequest): Promise<{
    success: boolean;
    jobId?: string;
    error?: string;
  }> {
    // Validate poster agent
    if (!request.posterAgent || !/^[a-zA-Z0-9_-]+$/.test(request.posterAgent)) {
      return { success: false, error: 'Invalid poster agent' };
    }

    // Validate budget
    if (!Number.isFinite(request.budgetSol)) {
      return { success: false, error: 'Invalid budget' };
    }
    if (request.budgetSol < this.minBudgetSol) {
      return { success: false, error: `Budget must be at least ${this.minBudgetSol} SOL` };
    }
    if (request.budgetSol > this.maxBudgetSol) {
      return { success: false, error: `Budget cannot exceed ${this.maxBudgetSol} SOL` };
    }

    // Validate title
    if (!request.title || request.title.length < 5) {
      return { success: false, error: 'Title must be at least 5 characters' };
    }
    if (request.title.length > MAX_TITLE_LENGTH) {
      return { success: false, error: `Title cannot exceed ${MAX_TITLE_LENGTH} characters` };
    }

    // Validate description
    if (!request.description || request.description.length < 20) {
      return { success: false, error: 'Description must be at least 20 characters' };
    }
    if (request.description.length > MAX_DESCRIPTION_LENGTH) {
      return { success: false, error: `Description cannot exceed ${MAX_DESCRIPTION_LENGTH} characters` };
    }

    const jobId = generateJobId();

    // Infer capability if not provided
    let capability = request.capability;
    if (!capability) {
      capability = await this.inferCapability(request.description);
    }

    // Save to database
    this.saveJob({
      jobId,
      postId: null,
      posterAgent: request.posterAgent,
      title: request.title,
      description: request.description,
      budgetSol: request.budgetSol,
      capability,
      requiredTier: request.requiredTier ?? 0,
      status: 'open',
      assignedTo: null,
      escrowAddress: null,
    });

    return { success: true, jobId };
  }

  private async inferCapability(description: string): Promise<string> {
    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 50,
        system: 'Return a single capability category. Options: code-generation, image-generation, copywriting, code-review, data-analysis, research. Just the category name.',
        messages: [{ role: 'user', content: description.slice(0, 500) }],
      });

      const text = response.content[0];
      if (text.type === 'text') {
        const cap = text.text.trim().toLowerCase();
        const valid = ['code-generation', 'image-generation', 'copywriting', 'code-review', 'data-analysis', 'research'];
        if (valid.includes(cap)) return cap;
      }
    } catch {
      // Fall through to default
    }
    return 'research';
  }

  async placeBid(request: JobBidRequest): Promise<{
    success: boolean;
    bidId?: number;
    error?: string;
  }> {
    // Input validation
    if (!request.jobId || !/^job-[a-z0-9-]+$/.test(request.jobId)) {
      return { success: false, error: 'Invalid job ID' };
    }
    if (!request.bidderAgent || !/^[a-zA-Z0-9_-]+$/.test(request.bidderAgent)) {
      return { success: false, error: 'Invalid bidder agent' };
    }
    if (!Number.isFinite(request.bidAmount)) {
      return { success: false, error: 'Invalid bid amount' };
    }

    const job = this.getJob(request.jobId);
    if (!job) {
      return { success: false, error: 'Job not found' };
    }

    if (job.status !== 'open') {
      return { success: false, error: 'Job is not accepting bids' };
    }

    if (request.bidAmount > job.budgetSol) {
      return { success: false, error: 'Bid exceeds job budget' };
    }

    if (request.bidAmount <= 0) {
      return { success: false, error: 'Bid must be positive' };
    }

    const bidsForJob = this.bids.get(request.jobId) ?? [];

    // Limit bids per job
    if (bidsForJob.length >= MAX_BIDS_PER_JOB) {
      return { success: false, error: 'Maximum bids reached for this job' };
    }

    // Check for duplicate bids
    if (bidsForJob.some(b => b.bidderAgent === request.bidderAgent)) {
      return { success: false, error: 'You already have a bid on this job' };
    }

    const bid: JobBid = {
      id: bidsForJob.length + 1,
      jobId: request.jobId,
      bidderAgent: request.bidderAgent,
      bidAmount: request.bidAmount,
      proposal: request.proposal ?? '',
      tier: 0, // Would be populated from reputation service
      createdAt: Date.now(),
    };

    bidsForJob.push(bid);
    this.bids.set(request.jobId, bidsForJob);

    return { success: true, bidId: bid.id };
  }

  async acceptBid(jobId: string, bidId: number, escrowAddress: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    const job = this.getJob(jobId);
    if (!job) {
      return { success: false, error: 'Job not found' };
    }

    const bidsForJob = this.bids.get(jobId) ?? [];
    const bid = bidsForJob.find((b) => b.id === bidId);
    if (!bid) {
      return { success: false, error: 'Bid not found' };
    }

    this.updateJobStatus(jobId, 'assigned', bid.bidderAgent, escrowAddress);

    return { success: true };
  }

  async startWork(jobId: string): Promise<{ success: boolean; error?: string }> {
    const job = this.getJob(jobId);
    if (!job) {
      return { success: false, error: 'Job not found' };
    }

    if (job.status !== 'assigned') {
      return { success: false, error: 'Job is not assigned' };
    }

    this.updateJobStatus(jobId, 'in_progress');
    return { success: true };
  }

  async deliverWork(jobId: string, deliverable: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    const job = this.getJob(jobId);
    if (!job) {
      return { success: false, error: 'Job not found' };
    }

    if (job.status !== 'in_progress') {
      return { success: false, error: 'Job is not in progress' };
    }

    this.updateJobStatus(jobId, 'delivered');
    return { success: true };
  }

  async completeJob(jobId: string, qualityScore: number): Promise<{
    success: boolean;
    error?: string;
  }> {
    const job = this.getJob(jobId);
    if (!job) {
      return { success: false, error: 'Job not found' };
    }

    if (job.status !== 'delivered') {
      return { success: false, error: 'Job is not delivered' };
    }

    this.updateJobStatus(jobId, 'completed');

    // Publish to DKG
    if (this.dkg && job.escrowAddress) {
      try {
        await this.dkg.publishTransactionRecord({
          buyerId: job.posterAgent,
          sellerId: job.assignedTo ?? '',
          amount: job.budgetSol,
          currency: 'SOL',
          qualityScore,
          escrowAddress: job.escrowAddress,
        });
      } catch (err) {
        console.error('[JobBoard] DKG publish failed:', err);
      }
    }

    return { success: true };
  }

  getJob(jobId: string): AgentJob | null {
    // Query from database
    const jobs = this.getOpenJobs();
    const assigned = this.getAssignedJobs();
    const all = [...jobs, ...assigned];
    return all.find((j) => j.jobId === jobId) ?? null;
  }

  getOpenJobs(): AgentJob[] {
    // Would query from database
    return [];
  }

  getAssignedJobs(): AgentJob[] {
    // Would query from database
    return [];
  }

  getBidsForJob(jobId: string): JobBid[] {
    return this.bids.get(jobId) ?? [];
  }

  getStats(): JobBoardStats {
    return {
      openJobs: 0,
      completedJobs: 0,
      totalVolume: 0,
      avgQualityScore: 0,
    };
  }

  formatJobListing(job: AgentJob): string {
    const tierReq = job.requiredTier > 0 ? ` (Requires ${job.requiredTier}+ tier)` : '';

    return `## Job: ${job.title}

**ID:** \`${job.jobId}\`
**Budget:** ${job.budgetSol} SOL
**Capability:** ${job.capability}${tierReq}
**Status:** ${job.status}

${job.description}

---

To bid: \`@kamiyo bid ${job.jobId} [amount]\``;
  }

  formatJobStatus(job: AgentJob): string {
    const bids = this.getBidsForJob(job.jobId);

    let status = `## Job Status: ${job.title}

**ID:** \`${job.jobId}\`
**Status:** ${job.status}
**Budget:** ${job.budgetSol} SOL`;

    if (job.assignedTo) {
      status += `\n**Assigned To:** @${job.assignedTo}`;
    }

    if (job.escrowAddress) {
      status += `\n**Escrow:** \`${job.escrowAddress.slice(0, 8)}...\``;
    }

    if (bids.length > 0) {
      status += `\n\n### Bids (${bids.length})\n`;
      for (const bid of bids.slice(0, 5)) {
        status += `- @${bid.bidderAgent}: ${bid.bidAmount} SOL\n`;
      }
    }

    return status;
  }

  // Database helpers (simplified - in production use proper queries)
  private saveJob(job: Omit<AgentJob, 'id' | 'createdAt'>): void {
    // This would be a proper DB insert
    console.log(`[JobBoard] Saved job: ${job.jobId}`);
  }

  private updateJobStatus(
    jobId: string,
    status: AgentJob['status'],
    assignedTo?: string,
    escrowAddress?: string
  ): void {
    console.log(`[JobBoard] Updated job ${jobId} to ${status}`);
  }
}
