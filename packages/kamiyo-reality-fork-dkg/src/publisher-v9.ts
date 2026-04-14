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
  V9QueryResult,
  V9AgentProfile,
  V9AgentProfileResult,
  V9NetworkStatus,
  V9WorkspaceWriteResult,
  V9WorkspaceEnshrineResult,
  V9EntityLookupResult,
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
  // Lifecycle
  start(): Promise<void>;
  stop(): Promise<void>;

  // Publishing
  publish(
    paranetId: string,
    content: { public?: object; private?: object } | object
  ): Promise<{ ual: string }>;
  ensureParanetLocal(opts: {
    id: string;
    name: string;
    description?: string;
    revealOnChain?: boolean;
  }): Promise<void>;

  // Querying
  query(
    sparql: string,
    options?: { paranetId?: string; includeWorkspace?: boolean }
  ): Promise<{ rows?: Record<string, unknown>[]; data?: unknown[] }>;
  lookupEntity(peerId: string, ual: string): Promise<{ triples?: unknown[]; data?: unknown[] }>;

  // Workspace (fast no-chain writes)
  writeToWorkspace(
    paranetId: string,
    quads: unknown
  ): Promise<{ workspaceOperationId?: string; draftId?: string }>;
  enshrineFromWorkspace(paranetId: string, selection: unknown): Promise<{ ual: string }>;

  // Agent discovery & profile
  publishProfile(profile?: {
    name?: string;
    description?: string;
    skills?: string[];
    endpoint?: string;
  }): Promise<{ peerId?: string; identityId?: string | bigint }>;
  findAgents(options?: { framework?: string }): Promise<unknown[]>;

  // Network
  pingPeers(): Promise<number>;
  getPeerHealth(): ReadonlyMap<string, { latencyMs?: number; online?: boolean }> | unknown[];

  // Identity (readonly properties)
  readonly peerId: string;
  readonly identityId?: bigint;
  readonly multiaddrs?: string[];
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

      // Ensure the paranet exists locally (idempotent — won't throw if already exists)
      await agent.ensureParanetLocal({
        id: this.config.paranetId,
        name: this.config.paranetName ?? `kamiyo-rf-${this.config.paranetId}`,
        description: 'Kamiyo Reality Fork paranet',
      });

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

  // ── V9 Extended Capabilities ───────────────────────────────────────

  /** Execute a SPARQL query against the paranet's local triple store */
  async querySparql(sparql: string): Promise<V9QueryResult> {
    const agent = await this.ensureAgent();
    const start = Date.now();
    const result = await agent.query(sparql, { paranetId: this.config.paranetId });
    return {
      rows: (result.rows ?? result.data ?? []) as Record<string, unknown>[],
      executionMs: Date.now() - start,
    };
  }

  /** Publish this agent's profile to the DKG agent registry */
  async publishAgentProfile(profile: V9AgentProfile): Promise<V9AgentProfileResult> {
    try {
      const agent = await this.ensureAgent();
      const result = await agent.publishProfile({
        name: profile.name,
        description: profile.description,
        skills: profile.skills,
        endpoint: profile.endpoint,
      });
      return {
        success: true,
        peerId: result.peerId ?? agent.peerId,
        identityId: String(result.identityId ?? agent.identityId ?? ''),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'publishProfile failed',
      };
    }
  }

  /** Get P2P network status: peerId, multiaddrs, peers, discovered agents */
  async getNetworkStatus(): Promise<V9NetworkStatus> {
    const agent = await this.ensureAgent();

    const [healthResult, agentsResult] = await Promise.allSettled([
      Promise.resolve(agent.getPeerHealth()),
      agent.findAgents(),
    ]);

    // getPeerHealth may return a Map or array depending on version
    let healthList: Array<{ peerId: string; latencyMs?: number; online: boolean }> = [];
    if (healthResult.status === 'fulfilled') {
      const raw = healthResult.value;
      if (raw instanceof Map) {
        for (const [pid, h] of raw) {
          healthList.push({
            peerId: pid,
            latencyMs: (h as any).latencyMs,
            online: (h as any).online !== false,
          });
        }
      } else if (Array.isArray(raw)) {
        healthList = raw.map((p: any) => ({
          peerId: String(p.peerId ?? ''),
          latencyMs: p.latencyMs,
          online: p.online !== false,
        }));
      }
    }

    return {
      peerId: agent.peerId,
      identityId: agent.identityId != null ? String(agent.identityId) : undefined,
      multiaddrs: agent.multiaddrs ? [...agent.multiaddrs] : [],
      peerCount: healthList.length,
      peerHealth: healthList,
      agents: agentsResult.status === 'fulfilled' ? agentsResult.value : [],
    };
  }

  /** Save quads to workspace (free, no on-chain cost, gossip-replicated) */
  async writeToWorkspace(quads: unknown): Promise<V9WorkspaceWriteResult> {
    try {
      const agent = await this.ensureAgent();
      const result = await agent.writeToWorkspace(this.config.paranetId, quads);
      return {
        success: true,
        draftId: result.workspaceOperationId ?? result.draftId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'workspace write failed',
      };
    }
  }

  /** Promote workspace draft to a finalized on-chain Knowledge Asset */
  async enshrineFromWorkspace(selection: unknown): Promise<V9WorkspaceEnshrineResult> {
    try {
      const agent = await this.ensureAgent();
      const result = await agent.enshrineFromWorkspace(this.config.paranetId, selection);
      return { success: true, ual: result.ual };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'enshrine failed',
      };
    }
  }

  /** Resolve a UAL to its RDF triples via a connected peer */
  async lookupEntity(peerId: string, ual: string): Promise<V9EntityLookupResult> {
    try {
      const agent = await this.ensureAgent();
      const result = await agent.lookupEntity(peerId, ual);
      return {
        success: true,
        ual,
        triples: (result.triples ?? result.data ?? []) as unknown[],
      };
    } catch (error) {
      return {
        success: false,
        ual,
        error: error instanceof Error ? error.message : 'lookupEntity failed',
      };
    }
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
