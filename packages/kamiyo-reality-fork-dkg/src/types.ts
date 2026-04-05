// Core types for the Reality Fork DKG integration

/** Configuration for connecting to DKG and the Reality Fork paranet */
export interface RealityForkDKGConfig {
  dkgEndpoint: string;
  dkgPort?: number;
  blockchain: 'base:8453' | 'gnosis:100' | 'otp:2043';
  privateKey?: string;
  rpc?: string;
  epochs?: number;
  paranetUAL: string;
}

/** Input fields for building a Reality Fork Report Knowledge Asset */
export interface RealityForkReportAsset {
  projectId: string;
  projectName: string;
  description: string;
  hypothesisCount: number;
  laneCount: number;
  simulationRounds: number;
  winnerHypothesisId: string;
  probability: number;
  impactScore: number;
  evidenceCount: number;
  reportHash: string;
  createdAt: string;
  tags?: string[];
}

/** Input fields for building a Reality Fork Entity Knowledge Asset */
export interface RealityForkEntityAsset {
  entityId: string;
  projectId: string;
  entityName: string;
  entityType: string;
  description: string;
  hypothesisId: string;
  laneId: string;
  probability: number;
  impactScore: number;
  evidenceHash: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

/** Input fields for building a Reality Fork Simulation Knowledge Asset */
export interface RealityForkSimulationAsset {
  simulationId: string;
  projectId: string;
  hypothesisId: string;
  laneId: string;
  simulationRounds: number;
  probability: number;
  impactScore: number;
  evidenceHash: string;
  createdAt: string;
  parameters?: Record<string, unknown>;
}

/** Result of a DKG publish operation */
export interface RealityForkPublishResult {
  success: boolean;
  ual?: string;
  error?: string;
}

/** Result of a full project publish (report + entities + simulations) */
export interface RealityForkFullPublishResult {
  reportUAL: string;
  entityUALs: string[];
  simulationUALs: string[];
}

/** Configuration for connecting to DKG V9 (embedded P2P edge node) */
export interface RealityForkDKGConfigV9 {
  /** Persistent storage directory for agent keys + triple store */
  dataDir: string;
  /** libp2p multiaddrs of bootstrap peers */
  bootstrapPeers: string[];
  /** EVM RPC URL for on-chain transactions */
  chainRpcUrl: string;
  /** DKG hub contract address */
  chainHubAddress: string;
  /** ECDSA operational keys for chain signing */
  operationalKeys: string[];
  /** V9 paranet URN (e.g. 'urn:paranet:kamiyo-reality-fork') */
  paranetId: string;
  /** Number of epochs for knowledge asset storage (default: 12) */
  epochs?: number;
}

/** DKG client interface (matches dkg.js) */
export interface DKGClient {
  asset: {
    create(
      content: { public: object; private?: object },
      options?: { epochsNum?: number; paranetUAL?: string }
    ): Promise<{ UAL: string }>;
    get(ual: string): Promise<{ public: object; private?: object }>;
    update(ual: string, content: { public?: object; private?: object }): Promise<{ UAL: string }>;
  };
  graph: {
    query(
      sparql: string,
      type: 'SELECT' | 'CONSTRUCT',
      options?: { repository?: string; paranetUAL?: string }
    ): Promise<{ data: unknown[] }>;
  };
  paranet: {
    create(
      ual: string,
      options: {
        paranetName: string;
        paranetDescription: string;
        paranetNodesAccessPolicy: number;
        paranetMinersAccessPolicy: number;
        paranetKcSubmissionPolicy: number;
      }
    ): Promise<unknown>;
  };
}
