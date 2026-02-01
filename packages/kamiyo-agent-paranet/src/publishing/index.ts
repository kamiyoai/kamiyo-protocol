/**
 * Paranet Publisher
 * Publishes Knowledge Assets to the KAMIYO Agent Paranet on OriginTrail DKG
 */

import type {
  DKGClient,
  ParanetConfig,
  TaskCompletion,
  CapabilityAttestation,
  TrustRelationship,
  PublishResult,
} from '../types.js';
import {
  TaskCompletionSchema,
  CapabilityAttestationSchema,
  TrustRelationshipSchema,
  buildTaskCompletionAsset,
  buildCapabilityAttestationAsset,
  buildTrustRelationshipAsset,
} from '../schemas/index.js';

export class ParanetPublisher {
  private dkg: DKGClient;
  private config: ParanetConfig;

  constructor(dkg: DKGClient, config: ParanetConfig) {
    this.dkg = dkg;
    this.config = config;
  }

  /**
   * Publish a task completion to the paranet
   */
  async publishTaskCompletion(task: TaskCompletion): Promise<PublishResult> {
    // Validate input
    const validation = TaskCompletionSchema.safeParse(task);
    if (!validation.success) {
      return {
        success: false,
        error: `Validation failed: ${validation.error.issues.map(i => i.message).join(', ')}`,
      };
    }

    const asset = buildTaskCompletionAsset(task);

    try {
      const result = await this.dkg.asset.create(
        { public: asset },
        {
          epochs: this.config.epochs ?? 12,
          paranetUAL: this.config.paranetUAL,
        }
      );
      return { success: true, ual: result.UAL };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Publishing failed',
      };
    }
  }

  /**
   * Publish a capability attestation to the paranet
   */
  async publishCapabilityAttestation(attestation: CapabilityAttestation): Promise<PublishResult> {
    // Validate input
    const validation = CapabilityAttestationSchema.safeParse(attestation);
    if (!validation.success) {
      return {
        success: false,
        error: `Validation failed: ${validation.error.issues.map(i => i.message).join(', ')}`,
      };
    }

    const asset = buildCapabilityAttestationAsset(attestation);

    try {
      const result = await this.dkg.asset.create(
        { public: asset },
        {
          epochs: this.config.epochs ?? 12,
          paranetUAL: this.config.paranetUAL,
        }
      );
      return { success: true, ual: result.UAL };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Publishing failed',
      };
    }
  }

  /**
   * Publish a trust relationship to the paranet
   */
  async publishTrustRelationship(trust: TrustRelationship): Promise<PublishResult> {
    // Validate input
    const validation = TrustRelationshipSchema.safeParse(trust);
    if (!validation.success) {
      return {
        success: false,
        error: `Validation failed: ${validation.error.issues.map(i => i.message).join(', ')}`,
      };
    }

    const asset = buildTrustRelationshipAsset(trust);

    try {
      const result = await this.dkg.asset.create(
        { public: asset },
        {
          epochs: this.config.epochs ?? 12,
          paranetUAL: this.config.paranetUAL,
        }
      );
      return { success: true, ual: result.UAL };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Publishing failed',
      };
    }
  }

  /**
   * Batch publish multiple task completions
   */
  async publishTaskCompletionBatch(tasks: TaskCompletion[]): Promise<PublishResult[]> {
    return Promise.all(tasks.map(task => this.publishTaskCompletion(task)));
  }

  /**
   * Publish task completion with automatic quality attestation
   * Used by clients after receiving service from a provider
   */
  async publishTaskWithQuality(
    task: TaskCompletion,
    autoAttest = true
  ): Promise<{ task: PublishResult; attestation?: PublishResult }> {
    const taskResult = await this.publishTaskCompletion(task);

    if (!autoAttest || !taskResult.success || task.qualityScore < 70) {
      return { task: taskResult };
    }

    // Auto-attest capability if quality is good
    const attestation: CapabilityAttestation = {
      agentGlobalId: task.providerGlobalId,
      capability: task.taskType,
      attestorGlobalId: task.clientGlobalId,
      attestationType: 'peer',
      confidence: task.qualityScore,
      evidenceUALs: taskResult.ual ? [taskResult.ual] : undefined,
      context: `Based on completed ${task.taskType} task`,
    };

    const attestationResult = await this.publishCapabilityAttestation(attestation);

    return { task: taskResult, attestation: attestationResult };
  }

  /**
   * Revoke a trust relationship
   */
  async revokeTrust(
    trustorGlobalId: string,
    trusteeGlobalId: string,
    reason?: string
  ): Promise<PublishResult> {
    const trust: TrustRelationship = {
      trustorGlobalId,
      trusteeGlobalId,
      trustLevel: 0,
      trustType: 'general',
      since: new Date().toISOString(),
      until: new Date().toISOString(),
      reason: reason || 'Trust revoked',
    };

    return this.publishTrustRelationship(trust);
  }
}

/**
 * Create a DKG client from config
 * This wraps the dkg.js library
 */
export async function createDKGClient(config: ParanetConfig): Promise<DKGClient> {
  // Dynamic import to support environments without dkg.js
  const DKG = await import('dkg.js').then(m => m.default || m);

  const dkg = new DKG({
    endpoint: config.dkgEndpoint,
    port: config.dkgPort || 8900,
    blockchain: {
      name: config.blockchain.split(':')[0],
      publicKey: config.privateKey ? undefined : 'readonly',
      privateKey: config.privateKey,
    },
    maxNumberOfRetries: 3,
    frequency: 2,
  });

  return dkg as DKGClient;
}

/**
 * Quick publish function for one-off task completions
 */
export async function quickPublishTask(
  config: ParanetConfig,
  task: TaskCompletion
): Promise<PublishResult> {
  const dkg = await createDKGClient(config);
  const publisher = new ParanetPublisher(dkg, config);
  return publisher.publishTaskCompletion(task);
}
