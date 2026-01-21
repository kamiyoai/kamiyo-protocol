import { PublicKey } from '@solana/web3.js';
import { Wallet, BN } from '@coral-xyz/anchor';
import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '../types';
import { getNetworkConfig, getKeypair, createConnection, generateId, parseAmount, parseAddress, solToLamports } from '../utils';

/**
 * Freelance AI Job Escrow Actions
 *
 * Integration with PayAI's Freelance AI marketplace.
 * Wraps agent-to-agent job payments in Kamiyo escrow for dispute protection.
 */

export interface FreelanceJobSpec {
  title: string;
  description: string;
  deliverables: string[];
  qualityThreshold: number;
  timeLockHours: number;
}

function parseJobSpec(text: string, content: Record<string, unknown>): Partial<FreelanceJobSpec> {
  const spec: Partial<FreelanceJobSpec> = {};

  spec.title = (content.title as string) || extractQuoted(text, 'job') || 'Untitled Job';
  spec.description = (content.description as string) || '';
  spec.deliverables = (content.deliverables as string[]) || [];
  spec.qualityThreshold = (content.qualityThreshold as number) || 70;
  spec.timeLockHours = (content.timeLockHours as number) || parseTimeLock(text) || 24;

  return spec;
}

function extractQuoted(text: string, prefix: string): string | undefined {
  const regex = new RegExp(`${prefix}[:\\s]+"([^"]+)"`, 'i');
  const match = text.match(regex);
  return match?.[1];
}

function parseTimeLock(text: string): number | undefined {
  const match = text.match(/(\d+)\s*(?:hour|hr|h)/i);
  return match ? parseInt(match[1], 10) : undefined;
}

/**
 * POST_FREELANCE_JOB
 *
 * Agent posts a job request on Freelance AI marketplace.
 * Creates escrow with funds locked, job spec stored off-chain.
 */
export const postFreelanceJobAction: Action = {
  name: 'POST_FREELANCE_JOB',
  description: 'Post job to Freelance AI with escrow protection. Locks payment until delivery.',
  similes: ['post job', 'hire agent', 'create task', 'freelance job', 'outsource'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Post job: "Research competitors" for 0.5 SOL to provider ABC123, 48h deadline' } },
      { user: '{{agent}}', content: { text: 'Job posted: 0.5 SOL locked in escrow. Workers can accept.', action: 'POST_FREELANCE_JOB' } },
    ],
    [
      { user: '{{user1}}', content: { text: 'Hire agent 8xYz... to analyze this dataset for 0.1 SOL' } },
      { user: '{{agent}}', content: { text: 'Job created with escrow. Awaiting worker acceptance.', action: 'POST_FREELANCE_JOB' } },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return (
      text.includes('post job') ||
      text.includes('hire agent') ||
      text.includes('freelance') ||
      text.includes('outsource') ||
      (text.includes('create') && text.includes('task'))
    );
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ success: boolean; jobId?: string; escrowAddress?: string; signature?: string; error?: string }> {
    const { rpcUrl, programId } = getNetworkConfig(runtime);
    const keypair = getKeypair(runtime);
    const text = message.content.text || '';
    const content = message.content as Record<string, unknown>;

    const amount = parseAmount(text);
    if (!amount) {
      callback?.({ text: 'Specify payment amount (e.g., "0.5 SOL")' });
      return { success: false, error: 'Amount not specified' };
    }

    const provider = parseAddress(text) || (content.provider as string);
    if (!provider) {
      callback?.({ text: 'Specify worker/provider address' });
      return { success: false, error: 'Provider not specified' };
    }

    if (!keypair) {
      callback?.({ text: 'Wallet not configured. Set SOLANA_PRIVATE_KEY.' });
      return { success: false, error: 'Wallet not configured' };
    }

    const jobSpec = parseJobSpec(text, content);

    try {
      const connection = createConnection(rpcUrl);
      const { KamiyoClient } = await import('@kamiyo/sdk');

      const client = new KamiyoClient({
        connection,
        wallet: new Wallet(keypair),
        programId: new PublicKey(programId),
      });

      const jobId = generateId('job');

      const signature = await client.createAgreement({
        provider: new PublicKey(provider),
        amount: new BN(solToLamports(amount)),
        timeLockSeconds: new BN((jobSpec.timeLockHours || 24) * 3600),
        transactionId: jobId,
      });

      const [escrowPda] = client.getAgreementPDA(keypair.publicKey, jobId);

      callback?.({
        text: `Job posted: ${amount} SOL locked in escrow for ${provider.slice(0, 8)}... Job ID: ${jobId}`,
        content: {
          jobId,
          escrowAddress: escrowPda.toBase58(),
          amount,
          provider,
          spec: jobSpec,
          signature,
        },
      });

      return { success: true, jobId, escrowAddress: escrowPda.toBase58(), signature };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      callback?.({ text: `Failed to post job: ${error}` });
      return { success: false, error };
    }
  },
};

/**
 * APPROVE_FREELANCE_JOB
 *
 * Poster approves delivery and releases escrowed payment to worker.
 */
export const approveFreelanceJobAction: Action = {
  name: 'APPROVE_FREELANCE_JOB',
  description: 'Approve delivery and release payment to worker.',
  similes: ['approve job', 'release payment', 'accept delivery', 'confirm work'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Approve job job_abc123 for provider 8xYz...' } },
      { user: '{{agent}}', content: { text: 'Job approved. 0.5 SOL released to worker.', action: 'APPROVE_FREELANCE_JOB' } },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return (
      text.includes('approve job') ||
      text.includes('release payment') ||
      text.includes('accept delivery') ||
      text.includes('confirm work')
    );
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ success: boolean; jobId?: string; signature?: string; error?: string }> {
    const { rpcUrl, programId } = getNetworkConfig(runtime);
    const keypair = getKeypair(runtime);
    const text = message.content.text || '';
    const content = message.content as Record<string, unknown>;

    const jobId = (content.jobId as string) || extractJobId(text);
    if (!jobId) {
      callback?.({ text: 'Specify job ID' });
      return { success: false, error: 'Job ID not specified' };
    }

    const provider = (content.provider as string) || parseAddress(text);
    if (!provider) {
      callback?.({ text: 'Specify provider address' });
      return { success: false, error: 'Provider not specified' };
    }

    if (!keypair) {
      callback?.({ text: 'Wallet not configured. Set SOLANA_PRIVATE_KEY.' });
      return { success: false, error: 'Wallet not configured' };
    }

    try {
      const connection = createConnection(rpcUrl);
      const { KamiyoClient } = await import('@kamiyo/sdk');

      const client = new KamiyoClient({
        connection,
        wallet: new Wallet(keypair),
        programId: new PublicKey(programId),
      });

      const signature = await client.releaseFunds(jobId, new PublicKey(provider));

      callback?.({
        text: `Job ${jobId} approved. Payment released to ${provider.slice(0, 8)}...`,
        content: {
          jobId,
          provider,
          signature,
          status: 'completed',
          completedAt: Date.now(),
        },
      });

      return { success: true, jobId, signature };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      callback?.({ text: `Failed to approve job: ${error}` });
      return { success: false, error };
    }
  },
};

function extractJobId(text: string): string | undefined {
  const match = text.match(/job[_\s]([a-z0-9]+)/i);
  return match ? `job_${match[1]}` : undefined;
}

/**
 * DISPUTE_FREELANCE_JOB
 *
 * Poster disputes delivery quality. Triggers oracle arbitration.
 * Graduated refund based on quality score from oracles.
 */
export const disputeFreelanceJobAction: Action = {
  name: 'DISPUTE_FREELANCE_JOB',
  description: 'Dispute job delivery. Oracles evaluate quality for graduated refund.',
  similes: ['dispute job', 'reject delivery', 'file complaint', 'quality issue'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Dispute job job_abc123: delivery incomplete' } },
      { user: '{{agent}}', content: { text: 'Dispute filed. Oracles evaluating quality for refund calculation.', action: 'DISPUTE_FREELANCE_JOB' } },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return (
      text.includes('dispute job') ||
      text.includes('reject delivery') ||
      text.includes('file complaint') ||
      text.includes('quality issue')
    );
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ success: boolean; jobId?: string; signature?: string; error?: string }> {
    const { rpcUrl, programId } = getNetworkConfig(runtime);
    const keypair = getKeypair(runtime);
    const text = message.content.text || '';
    const content = message.content as Record<string, unknown>;

    const jobId = (content.jobId as string) || extractJobId(text);
    if (!jobId) {
      callback?.({ text: 'Specify job ID' });
      return { success: false, error: 'Job ID not specified' };
    }

    if (!keypair) {
      callback?.({ text: 'Wallet not configured. Set SOLANA_PRIVATE_KEY.' });
      return { success: false, error: 'Wallet not configured' };
    }

    try {
      const connection = createConnection(rpcUrl);
      const { KamiyoClient } = await import('@kamiyo/sdk');

      const client = new KamiyoClient({
        connection,
        wallet: new Wallet(keypair),
        programId: new PublicKey(programId),
      });

      const signature = await client.markDisputed(jobId);

      callback?.({
        text: `Dispute filed for job ${jobId}. Oracle evaluation in progress.`,
        content: {
          jobId,
          signature,
          status: 'disputed',
          filedAt: Date.now(),
        },
      });

      return { success: true, jobId, signature };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      callback?.({ text: `Failed to file dispute: ${error}` });
      return { success: false, error };
    }
  },
};

/**
 * CHECK_JOB_STATUS
 *
 * Query status of a freelance job including escrow state.
 */
export const checkJobStatusAction: Action = {
  name: 'CHECK_JOB_STATUS',
  description: 'Check freelance job and escrow status.',
  similes: ['job status', 'check job', 'job info', 'escrow status'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Check job job_abc123 status for poster 8xYz...' } },
      { user: '{{agent}}', content: { text: 'Job status: active. Escrow: 0.5 SOL locked. Deadline: 12h remaining.', action: 'CHECK_JOB_STATUS' } },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return (
      text.includes('job status') ||
      text.includes('check job') ||
      (text.includes('status') && text.includes('job'))
    );
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ success: boolean; job?: Record<string, unknown>; error?: string }> {
    const { rpcUrl, programId } = getNetworkConfig(runtime);
    const keypair = getKeypair(runtime);
    const text = message.content.text || '';
    const content = message.content as Record<string, unknown>;

    const jobId = (content.jobId as string) || extractJobId(text);
    if (!jobId) {
      callback?.({ text: 'Specify job ID' });
      return { success: false, error: 'Job ID not specified' };
    }

    const poster = (content.poster as string) || parseAddress(text);
    if (!poster) {
      callback?.({ text: 'Specify job poster address' });
      return { success: false, error: 'Poster address not specified' };
    }

    try {
      const connection = createConnection(rpcUrl);
      const { KamiyoClient } = await import('@kamiyo/sdk');

      const client = new KamiyoClient({
        connection,
        wallet: keypair ? new Wallet(keypair) : new Wallet(new (await import('@solana/web3.js')).Keypair()),
        programId: new PublicKey(programId),
      });

      const [escrowPda] = client.getAgreementPDA(new PublicKey(poster), jobId);
      const escrow = await client.getAgreement(escrowPda);

      if (!escrow) {
        callback?.({ text: `Job ${jobId} not found` });
        return { success: false, error: 'Job not found' };
      }

      const now = Date.now() / 1000;
      const expiresAt = escrow.expiresAt.toNumber();
      const remainingSeconds = Math.max(0, expiresAt - now);
      const remainingHours = Math.round(remainingSeconds / 3600);

      const statusMap = ['active', 'released', 'disputed', 'resolved'];

      const job = {
        jobId,
        escrowAddress: escrowPda.toBase58(),
        poster: escrow.agent.toBase58(),
        worker: escrow.api.toBase58(),
        amount: escrow.amount.toNumber() / 1e9,
        status: statusMap[escrow.status] || 'unknown',
        remainingHours,
        createdAt: new Date(escrow.createdAt.toNumber() * 1000).toISOString(),
        expiresAt: new Date(expiresAt * 1000).toISOString(),
      };

      callback?.({
        text: `Job ${jobId}: ${job.status}. ${job.amount} SOL. ${remainingHours}h remaining.`,
        content: job,
      });

      return { success: true, job };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      callback?.({ text: `Failed to check job: ${error}` });
      return { success: false, error };
    }
  },
};
