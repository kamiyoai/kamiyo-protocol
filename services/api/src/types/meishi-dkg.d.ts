declare module '@kamiyo/meishi/dkg' {
  export interface DKGAssetPayload {
    public: object;
    private?: object;
  }

  export interface DKGClient {
    query(sparql: string): Promise<unknown[]>;
    get(ual: string): Promise<{ content: unknown; metadata?: Record<string, unknown> }>;
    publish(content: DKGAssetPayload, options?: { epochs?: number }): Promise<string>;
  }

  export class MeishiDKGPublisher {
    constructor(config: { dkg: DKGClient; defaultEpochs?: number });
    publishComplianceAudit(params: unknown): Promise<string>;
  }

  export function queryLatestAudit(agentId: string): string;
}
