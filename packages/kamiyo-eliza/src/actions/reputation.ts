import { Wallet } from '@coral-xyz/anchor';
import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '../types';
import { getKeypair } from '../utils';

/**
 * ZK reputation proof actions for x402 payment discounts.
 * Uses @kamiyo/solana-privacy for Groth16 proof generation.
 */

interface ReputationProofResult {
  proof: string;
  commitment: string;
  threshold: number;
  publicKey: string;
  [key: string]: unknown;
}

/**
 * GENERATE_REPUTATION_PROOF
 *
 * Generate a ZK proof that reputation score >= threshold.
 * Proof can be attached to x402 requests for tiered pricing.
 */
export const generateReputationProofAction: Action = {
  name: 'GENERATE_REPUTATION_PROOF',
  description: 'Generate ZK proof of reputation for x402 payment discounts.',
  similes: ['prove reputation', 'generate proof', 'reputation proof', 'zk proof'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Generate reputation proof for threshold 70' } },
      { user: '{{agent}}', content: { text: 'Generated ZK proof: reputation >= 70. Attach to x402 requests for 10% discount.', action: 'GENERATE_REPUTATION_PROOF' } },
    ],
    [
      { user: '{{user1}}', content: { text: 'Prove my reputation score is above 85' } },
      { user: '{{agent}}', content: { text: 'ZK proof generated for threshold 85. Premium tier unlocked.', action: 'GENERATE_REPUTATION_PROOF' } },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return (
      text.includes('prove reputation') ||
      text.includes('reputation proof') ||
      text.includes('generate proof') ||
      (text.includes('zk') && text.includes('proof'))
    );
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ success: boolean; proof?: ReputationProofResult; error?: string }> {
    const keypair = getKeypair(runtime);
    const text = message.content.text || '';
    const content = message.content as Record<string, unknown>;

    if (!keypair) {
      callback?.({ text: 'Wallet not configured. Set SOLANA_PRIVATE_KEY.' });
      return { success: false, error: 'Wallet not configured' };
    }

    const threshold = parseThreshold(text) || (content.threshold as number) || 70;

    try {
      const { PrivateInference, generateSecret } = await import('@kamiyo/solana-privacy');

      const actualScore = await getReputationScore(runtime, keypair.publicKey.toBase58());

      if (actualScore < threshold) {
        callback?.({ text: `Reputation ${actualScore} below required ${threshold}. Cannot generate proof.` });
        return { success: false, error: `Reputation ${actualScore} below threshold ${threshold}` };
      }

      const wallet = new Wallet(keypair);
      const prover = new PrivateInference(wallet);
      const secret = generateSecret();

      const proofResult = await prover.proveReputation({
        score: actualScore,
        threshold,
        secret,
      });

      const encodedProof = PrivateInference.encodeReputationProof(proofResult);

      const proofData: ReputationProofResult = {
        proof: encodedProof,
        commitment: proofResult.commitment,
        threshold,
        publicKey: keypair.publicKey.toBase58(),
      };

      const tier = getTierName(threshold);

      callback?.({
        text: `ZK proof generated: reputation >= ${threshold} (${tier} tier). Use X-402-Reputation-Proof header.`,
        content: proofData,
      });

      return { success: true, proof: proofData };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Proof generation failed';
      callback?.({ text: `Failed to generate proof: ${error}` });
      return { success: false, error };
    }
  },
};

/**
 * CHECK_REPUTATION_TIER
 *
 * Check current reputation tier and available discounts.
 */
export const checkReputationTierAction: Action = {
  name: 'CHECK_REPUTATION_TIER',
  description: 'Check reputation tier and available x402 discounts.',
  similes: ['check tier', 'reputation tier', 'my discount', 'what tier'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'What reputation tier am I?' } },
      { user: '{{agent}}', content: { text: 'Reputation: 82. Tier: Trusted (10% discount). 3 points to Premium.', action: 'CHECK_REPUTATION_TIER' } },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return (
      text.includes('check tier') ||
      text.includes('reputation tier') ||
      text.includes('my discount') ||
      text.includes('what tier')
    );
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ success: boolean; tier?: TierInfo; error?: string }> {
    const keypair = getKeypair(runtime);
    const content = message.content as Record<string, unknown>;

    const publicKey = (content.publicKey as string) || keypair?.publicKey.toBase58();

    if (!publicKey) {
      callback?.({ text: 'Specify public key or configure wallet.' });
      return { success: false, error: 'Public key not specified' };
    }

    try {
      const score = await getReputationScore(runtime, publicKey);
      const tier = getTierInfo(score);

      callback?.({
        text: `Reputation: ${score}. Tier: ${tier.name} (${tier.discount}% discount). ${tier.nextTierInfo}`,
        content: tier,
      });

      return { success: true, tier };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to check tier';
      callback?.({ text: `Failed to check tier: ${error}` });
      return { success: false, error };
    }
  },
};

/**
 * VERIFY_REPUTATION_PROOF
 *
 * Verify a reputation proof from another agent.
 */
export const verifyReputationProofAction: Action = {
  name: 'VERIFY_REPUTATION_PROOF',
  description: 'Verify ZK reputation proof from another agent.',
  similes: ['verify proof', 'check proof', 'validate reputation'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Verify this reputation proof: <proof>' } },
      { user: '{{agent}}', content: { text: 'Proof valid. Agent has reputation >= 70.', action: 'VERIFY_REPUTATION_PROOF' } },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return (
      text.includes('verify proof') ||
      text.includes('check proof') ||
      text.includes('validate reputation')
    );
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ success: boolean; valid?: boolean; threshold?: number; error?: string }> {
    const content = message.content as Record<string, unknown>;

    const proof = (content.proof as string) || extractProof(message.content.text || '');
    const threshold = (content.threshold as number) || 70;

    if (!proof) {
      callback?.({ text: 'Provide proof to verify.' });
      return { success: false, error: 'Proof not provided' };
    }

    try {
      const { verifyReputationProof } = await import('@kamiyo/solana-privacy');

      const result = await verifyReputationProof(proof, {
        minThreshold: threshold,
        requireCrypto: false,
      });

      if (result.valid) {
        callback?.({
          text: `Proof valid. Agent has reputation >= ${result.threshold ?? threshold}.`,
          content: { valid: true, threshold: result.threshold ?? threshold },
        });
        return { success: true, valid: true, threshold: result.threshold ?? threshold };
      } else {
        callback?.({
          text: `Proof invalid: ${result.error || 'verification failed'}`,
          content: { valid: false, error: result.error },
        });
        return { success: true, valid: false, error: result.error };
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Verification failed';
      callback?.({ text: `Failed to verify: ${error}` });
      return { success: false, error };
    }
  },
};

/**
 * UPDATE_REPUTATION
 *
 * Update local reputation after escrow outcome.
 * Syncs with PayAI reputation tracker.
 */
export const updateReputationAction: Action = {
  name: 'UPDATE_REPUTATION',
  description: 'Update reputation after escrow completion.',
  similes: ['update reputation', 'record outcome', 'escrow completed'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Escrow job_abc123 released successfully' } },
      { user: '{{agent}}', content: { text: 'Reputation updated: +5 (clean release). New score: 87.', action: 'UPDATE_REPUTATION' } },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return (
      text.includes('update reputation') ||
      text.includes('record outcome') ||
      (text.includes('escrow') && (text.includes('released') || text.includes('completed')))
    );
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ success: boolean; newScore?: number; delta?: number; error?: string }> {
    const keypair = getKeypair(runtime);
    const text = message.content.text || '';
    const content = message.content as Record<string, unknown>;

    if (!keypair) {
      callback?.({ text: 'Wallet not configured.' });
      return { success: false, error: 'Wallet not configured' };
    }

    const outcome = parseOutcome(text) || (content.outcome as string) || 'released';
    const source = (content.source as string) || 'direct';

    try {
      const {
        PayAIReputationTracker,
        EscrowOutcome,
        ReputationSource,
        calculateReputationDelta,
      } = await import('@kamiyo/x402-client');

      const trackerJson = runtime.getSetting('REPUTATION_TRACKER');
      const tracker = trackerJson
        ? PayAIReputationTracker.deserialize(trackerJson)
        : new PayAIReputationTracker();

      const outcomeEnum = EscrowOutcome[outcome as keyof typeof EscrowOutcome] || EscrowOutcome.Released;
      const sourceEnum = ReputationSource[source as keyof typeof ReputationSource] || ReputationSource.Direct;

      const delta = calculateReputationDelta(outcomeEnum);
      const record = tracker.updateReputation(
        keypair.publicKey.toBase58(),
        outcomeEnum,
        sourceEnum
      );

      if (runtime.setState) {
        await runtime.setState('REPUTATION_TRACKER', tracker.serialize());
      }

      callback?.({
        text: `Reputation updated: ${delta.providerDelta >= 0 ? '+' : ''}${delta.providerDelta} (${delta.reason}). New score: ${record.score}.`,
        content: {
          newScore: record.score,
          delta: delta.providerDelta,
          totalEscrows: record.totalEscrows,
          successRate: Math.round((record.successfulEscrows / record.totalEscrows) * 100),
        },
      });

      return { success: true, newScore: record.score, delta: delta.providerDelta };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to update reputation';
      callback?.({ text: `Failed to update: ${error}` });
      return { success: false, error };
    }
  },
};

// Helper functions

function parseThreshold(text: string): number | undefined {
  const match = text.match(/threshold\s*(\d+)|above\s*(\d+)|>=?\s*(\d+)/i);
  if (match) {
    return parseInt(match[1] || match[2] || match[3], 10);
  }
  return undefined;
}

function getTierName(threshold: number): string {
  if (threshold >= 95) return 'Elite';
  if (threshold >= 85) return 'Premium';
  if (threshold >= 70) return 'Trusted';
  if (threshold >= 50) return 'Basic';
  return 'Untrusted';
}

interface TierInfo {
  name: string;
  score: number;
  discount: number;
  nextTierInfo: string;
  creditLimit: number;
  [key: string]: unknown;
}

function getTierInfo(score: number): TierInfo {
  const tiers = [
    { name: 'Elite', min: 95, discount: 25, creditLimit: 1000 },
    { name: 'Premium', min: 85, discount: 15, creditLimit: 500 },
    { name: 'Trusted', min: 70, discount: 10, creditLimit: 100 },
    { name: 'Basic', min: 50, discount: 5, creditLimit: 0 },
    { name: 'Untrusted', min: 0, discount: 0, creditLimit: 0 },
  ];

  let currentTier = tiers[tiers.length - 1];
  let nextTier: typeof tiers[0] | null = null;

  for (let i = 0; i < tiers.length; i++) {
    if (score >= tiers[i].min) {
      currentTier = tiers[i];
      nextTier = i > 0 ? tiers[i - 1] : null;
      break;
    }
  }

  const nextTierInfo = nextTier
    ? `${nextTier.min - score} points to ${nextTier.name}.`
    : 'Max tier reached.';

  return {
    name: currentTier.name,
    score,
    discount: currentTier.discount,
    nextTierInfo,
    creditLimit: currentTier.creditLimit,
  };
}

function extractProof(text: string): string | undefined {
  const match = text.match(/proof[:\s]+([A-Za-z0-9+/=]{50,})/i);
  return match?.[1];
}

function parseOutcome(text: string): string | undefined {
  const lower = text.toLowerCase();
  if (lower.includes('released') || lower.includes('completed')) return 'Released';
  if (lower.includes('dispute') && lower.includes('won')) {
    if (lower.includes('agent')) return 'DisputeWonAgent';
    if (lower.includes('provider')) return 'DisputeWonProvider';
  }
  if (lower.includes('partial')) return 'DisputePartial';
  if (lower.includes('expired')) return 'Expired';
  return undefined;
}

async function getReputationScore(runtime: IAgentRuntime, publicKey: string): Promise<number> {
  const trackerJson = runtime.getSetting('REPUTATION_TRACKER');
  if (trackerJson) {
    try {
      const { PayAIReputationTracker } = await import('@kamiyo/x402-client');
      const tracker = PayAIReputationTracker.deserialize(trackerJson);
      return tracker.getCombinedScore(publicKey);
    } catch {
      // Fall through to default
    }
  }
  return 50;
}
