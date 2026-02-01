declare module 'dkg.js' {
  interface DKGOptions {
    endpoint: string;
    port?: number;
    blockchain?: {
      name?: string;
      publicKey?: string;
      privateKey?: string;
    };
    maxNumberOfRetries?: number;
    frequency?: number;
  }

  interface DKGAsset {
    create(
      content: { public: object; private?: object },
      options?: { epochs?: number; paranetUAL?: string }
    ): Promise<{ UAL: string }>;
    get(ual: string): Promise<{ public: object; private?: object }>;
    update(ual: string, content: { public?: object; private?: object }): Promise<{ UAL: string }>;
  }

  interface DKGGraph {
    query(sparql: string, type: 'SELECT' | 'CONSTRUCT'): Promise<{ data: unknown[] }>;
  }

  class DKG {
    constructor(options: DKGOptions);
    asset: DKGAsset;
    graph: DKGGraph;
  }

  export default DKG;
}
