import type {
  DKGClient,
  ParanetConfig,
  TaskCompletion,
  CapabilityAttestation,
  TrustRelationship,
  PublishResult,
} from '../types';
import {
  TaskCompletionSchema,
  CapabilityAttestationSchema,
  TrustRelationshipSchema,
  buildTaskCompletionAsset,
  buildCapabilityAttestationAsset,
  buildTrustRelationshipAsset,
} from '../schemas/index';
import { getLogger, createTimer } from '../logger';
import type { Logger } from '../logger';

export class ParanetPublisher {
  private dkg: DKGClient;
  private config: ParanetConfig;
  private logger: Logger;

  constructor(dkg: DKGClient, config: ParanetConfig, logger?: Logger) {
    this.dkg = dkg;
    this.config = config;
    this.logger = logger || getLogger();
  }

  async publishTaskCompletion(task: TaskCompletion): Promise<PublishResult> {
    const timer = createTimer();
    const log = this.logger.child({ operation: 'publishTaskCompletion', provider: task.providerGlobalId });

    const validation = TaskCompletionSchema.safeParse(task);
    if (!validation.success) {
      const errorMsg = validation.error.issues.map((i: { message: string }) => i.message).join(', ');
      log.warn('Validation failed', { error: errorMsg });
      return { success: false, error: `Validation failed: ${errorMsg}` };
    }

    const asset = buildTaskCompletionAsset(task);

    try {
      log.debug('Publishing task');
      const result = await this.dkg.asset.create(
        { public: asset },
        {
          epochsNum: this.config.epochs ?? 12,
          paranetUAL: this.config.paranetUAL,
        }
      );
      log.info('Task completion published', { duration: timer(), ual: result.UAL });
      return { success: true, ual: result.UAL };
    } catch (error) {
      log.error('Publishing failed', { duration: timer(), error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Publishing failed',
      };
    }
  }

  async publishCapabilityAttestation(attestation: CapabilityAttestation): Promise<PublishResult> {
    const timer = createTimer();
    const log = this.logger.child({ operation: 'publishCapabilityAttestation', agent: attestation.agentGlobalId, capability: attestation.capability });

    const validation = CapabilityAttestationSchema.safeParse(attestation);
    if (!validation.success) {
      const errorMsg = validation.error.issues.map((i: { message: string }) => i.message).join(', ');
      log.warn('Validation failed', { error: errorMsg });
      return { success: false, error: `Validation failed: ${errorMsg}` };
    }

    const asset = buildCapabilityAttestationAsset(attestation);

    try {
      log.debug('Publishing attestation');
      const result = await this.dkg.asset.create(
        { public: asset },
        {
          epochsNum: this.config.epochs ?? 12,
          paranetUAL: this.config.paranetUAL,
        }
      );
      log.info('Attestation published', { duration: timer(), ual: result.UAL });
      return { success: true, ual: result.UAL };
    } catch (error) {
      log.error('Publishing failed', { duration: timer(), error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Publishing failed',
      };
    }
  }

  async publishTrustRelationship(trust: TrustRelationship): Promise<PublishResult> {
    const timer = createTimer();
    const log = this.logger.child({ operation: 'publishTrustRelationship', trustor: trust.trustorGlobalId, trustee: trust.trusteeGlobalId });

    const validation = TrustRelationshipSchema.safeParse(trust);
    if (!validation.success) {
      const errorMsg = validation.error.issues.map((i: { message: string }) => i.message).join(', ');
      log.warn('Validation failed', { error: errorMsg });
      return { success: false, error: `Validation failed: ${errorMsg}` };
    }

    const asset = buildTrustRelationshipAsset(trust);

    try {
      log.debug('Publishing trust');
      const result = await this.dkg.asset.create(
        { public: asset },
        {
          epochsNum: this.config.epochs ?? 12,
          paranetUAL: this.config.paranetUAL,
        }
      );
      log.info('Trust published', { duration: timer(), ual: result.UAL });
      return { success: true, ual: result.UAL };
    } catch (error) {
      log.error('Publishing failed', { duration: timer(), error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Publishing failed',
      };
    }
  }

  async publishTaskCompletionBatch(tasks: TaskCompletion[]): Promise<PublishResult[]> {
    return Promise.all(tasks.map(task => this.publishTaskCompletion(task)));
  }

  async publishTaskWithQuality(
    task: TaskCompletion,
    autoAttest = true
  ): Promise<{ task: PublishResult; attestation?: PublishResult }> {
    const taskResult = await this.publishTaskCompletion(task);

    if (!autoAttest || !taskResult.success || task.qualityScore < 70) {
      return { task: taskResult };
    }

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

export async function createDKGClient(config: ParanetConfig): Promise<DKGClient> {
  try {
    const DKG = await import('dkg.js').then(m => m.default || m);

    const dkg = new DKG({
      endpoint: config.dkgEndpoint,
      port: config.dkgPort || 8900,
      blockchain: {
        name: config.blockchain,
        publicKey: config.privateKey ? undefined : 'readonly',
        privateKey: config.privateKey,
      },
      maxNumberOfRetries: 3,
      frequency: 2,
    });

    return dkg as DKGClient;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`DKG client init failed: ${message}`);
  }
}

export async function quickPublishTask(
  config: ParanetConfig,
  task: TaskCompletion
): Promise<PublishResult> {
  const dkg = await createDKGClient(config);
  const publisher = new ParanetPublisher(dkg, config);
  return publisher.publishTaskCompletion(task);
}
