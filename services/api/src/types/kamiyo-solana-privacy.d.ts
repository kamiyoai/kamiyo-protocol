declare module '@kamiyo/solana-privacy' {
  export class PrivateInference {
    constructor(wallet: any);
    proveReputation(params: { score: number; threshold: number }): Promise<{
      commitment: string;
      threshold: number;
      proofBytes: Uint8Array;
      groth16Proof?: {
        pi_a: [string, string, string];
        pi_b: [[string, string], [string, string], [string, string]];
        pi_c: [string, string, string];
      };
      publicSignals?: string[];
    }>;
  }
}
