// RealityForkPublisherV9 - experimental DKG V9 adapter using embedded P2P edge node
//
// V9 is architecturally different from V8: instead of an HTTP client talking to
// a remote OT-node, it embeds a full libp2p node with a local triple store.
// The agent lazily initializes on first publish and stays running for reuse.

import type {
  RealityForkDKGConfigV9,
  RealityForkReportAsset,
  RealityForkEntityAsset,
  RealityForkSimulationAsset,
  RealityForkPublishResult,
  RealityForkFullPublishResult,
} from './types';
import {
  RealityForkReportSchema,
  RealityForkEntitySchema,
  RealityForkSimulationSchema,
  buildReportAsset,
  buildEntityAsset,
  buildSimulationAsset,
} from './schemas';

// V9 DKGAgent type (from @origintrail-official/dkg-agent)
// Using interface to avoid hard dep — the actual import is dynamic
interface DKGAgentV9 {
  publish(
    paranetId: string,
    content: { public?: object; private?: object } | object
  ): Promise<{ ual: string }>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

interface DKGAgentV9Static {
  create(config: {
    name: string;
    framework?: string;
    nodeRole?: 'core' | 'edge';
    dataDir?: string;
    bootstrapPeers?: string[];
    chainConfig?: {
      rpcUrl: string;
      hubAddress: string;
      operationalKeys: string[];
    };
  }): Promise<DKGAgentV9>;
}

export class RealityForkPublisherV9 {
  private agent: DKGAgentV9 | null = null;
  private initPromise: Promise<DKGAgentV9> | null = null;
  private config: RealityForkDKGConfigV9;
  private agentFactory: DKGAgentV9Static;

  /**
   * @param config V9 configuration
   * @param agentFactory The DKGAgent class from @origintrail-official/dkg-agent.
   *   Must be passed by the caller because the package is installed in services/api,
   *   not in this library package.
   */
  constructor(config: RealityForkDKGConfigV9, agentFactory: DKGAgentV9Static) {
    this.config = config;
    this.agentFactory = agentFactory;
  }

  /** Lazily initialize the V9 edge node. Thread-safe — concurrent calls share one init. */
  private async ensureAgent(): Promise<DKGAgentV9> {
    if (this.agent) return this.agent;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const agent = await this.agentFactory.create({
        name: 'kamiyo-reality-fork',
        framework: 'kamiyo',
        nodeRole: 'edge',
        dataDir: this.config.dataDir,
        bootstrapPeers: this.config.bootstrapPeers,
        chainConfig: {
          rpcUrl: this.config.chainRpcUrl,
          hubAddress: this.config.chainHubAddress,
          operationalKeys: this.config.operationalKeys,
        },
      });

      await agent.start();
      this.agent = agent;
      return agent;
    })();

    try {
      return await this.initPromise;
    } catch (error) {
      this.initPromise = null;
      throw error;
    }
  }

  async publishReport(data: RealityForkReportAsset): Promise<RealityForkPublishResult> {
    const validation = RealityForkReportSchema.safeParse(data);
    if (!validation.success) {
      const errorMsg = validation.error.issues
        .map((i: { message: string }) => i.message)
        .join(', ');
      return { success: false, error: `Validation failed: ${errorMsg}` };
    }

    const asset = buildReportAsset(data);

    try {
      const agent = await this.ensureAgent();
      const result = await agent.publish(this.config.paranetId, { public: asset });
      return { success: true, ual: result.ual };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'V9 publishing report failed',
      };
    }
  }

  async publishEntity(data: RealityForkEntityAsset): Promise<RealityForkPublishResult> {
    const validation = RealityForkEntitySchema.safeParse(data);
    if (!validation.success) {
      const errorMsg = validation.error.issues
        .map((i: { message: string }) => i.message)
        .join(', ');
      return { success: false, error: `Validation failed: ${errorMsg}` };
    }

    const asset = buildEntityAsset(data);

    try {
      const agent = await this.ensureAgent();
      const result = await agent.publish(this.config.paranetId, { public: asset });
      return { success: true, ual: result.ual };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'V9 publishing entity failed',
      };
    }
  }

  async publishSimulation(data: RealityForkSimulationAsset): Promise<RealityForkPublishResult> {
    const validation = RealityForkSimulationSchema.safeParse(data);
    if (!validation.success) {
      const errorMsg = validation.error.issues
        .map((i: { message: string }) => i.message)
        .join(', ');
      return { success: false, error: `Validation failed: ${errorMsg}` };
    }

    const asset = buildSimulationAsset(data);

    try {
      const agent = await this.ensureAgent();
      const result = await agent.publish(this.config.paranetId, { public: asset });
      return { success: true, ual: result.ual };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'V9 publishing simulation failed',
      };
    }
  }

  async publishFullProject(data: {
    report: RealityForkReportAsset;
    entities: RealityForkEntityAsset[];
    simulations: RealityForkSimulationAsset[];
  }): Promise<RealityForkFullPublishResult> {
    const projectId = data.report.projectId;

    const reportResult = await this.publishReport(data.report);
    if (!reportResult.success || !reportResult.ual) {
      throw new Error(`V9 failed to publish report: ${reportResult.error}`);
    }

    const entityResults: RealityForkPublishResult[] = [];
    for (const entity of data.entities) {
      if (entity.projectId !== projectId) {
        entityResults.push({
          success: false,
          error: `Entity projectId "${entity.projectId}" does not match "${projectId}"`,
        });
        continue;
      }
      entityResults.push(await this.publishEntity(entity));
    }

    const failedEntities = entityResults.filter(r => !r.success);
    if (failedEntities.length > 0) {
      const errors = failedEntities.map(r => r.error).join('; ');
      throw new Error(
        `V9 published report (${reportResult.ual}) but ${failedEntities.length} entity publish(es) failed: ${errors}`
      );
    }

    const simResults: RealityForkPublishResult[] = [];
    for (const sim of data.simulations) {
      if (sim.projectId !== projectId) {
        simResults.push({
          success: false,
          error: `Simulation projectId "${sim.projectId}" does not match "${projectId}"`,
        });
        continue;
      }
      simResults.push(await this.publishSimulation(sim));
    }

    const failedSims = simResults.filter(r => !r.success);
    if (failedSims.length > 0) {
      const errors = failedSims.map(r => r.error).join('; ');
      throw new Error(
        `V9 published report + entities but ${failedSims.length} simulation publish(es) failed: ${errors}`
      );
    }

    return {
      reportUAL: reportResult.ual,
      entityUALs: entityResults.map(r => r.ual!),
      simulationUALs: simResults.map(r => r.ual!),
    };
  }

  /** Gracefully stop the embedded P2P node */
  async shutdown(): Promise<void> {
    if (this.agent) {
      await this.agent.stop();
      this.agent = null;
      this.initPromise = null;
    }
  }
}
