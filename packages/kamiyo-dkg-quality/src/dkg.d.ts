declare module 'dkg.js' {
  export interface DKGConfig {
    endpoint: string;
    port?: number;
    blockchain?: {
      name: string;
      publicKey?: string;
      privateKey?: string;
    };
    maxNumberOfRetries?: number;
  }

  export interface DKGAsset {
    public?: {
      assertion?: unknown;
      metadata?: Record<string, unknown>;
    };
    assertion?: unknown;
    metadata?: Record<string, unknown>;
  }

  export interface DKGPublishResult {
    UAL?: string;
  }

  export interface DKGQueryResult {
    data?: unknown[];
  }

  export interface DKGNodeInfo {
    version?: string;
    [key: string]: unknown;
  }

  export class DKG {
    constructor(config: DKGConfig);

    asset: {
      create(
        content: { public?: object },
        options?: { epochs?: number; tokenAmount?: number }
      ): Promise<DKGPublishResult>;
      get(ual: string): Promise<DKGAsset>;
      update(ual: string, content: { public?: object }): Promise<void>;
    };

    graph: {
      query(sparql: string, type: string): Promise<DKGQueryResult>;
    };

    node: {
      info(): Promise<DKGNodeInfo>;
    };
  }

  export default DKG;
}
