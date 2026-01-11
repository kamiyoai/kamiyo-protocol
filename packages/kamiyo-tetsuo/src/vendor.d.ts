/**
 * Type declarations for ZK dependencies
 */

declare module 'snarkjs' {
  export namespace groth16 {
    function fullProve(
      input: Record<string, unknown>,
      wasmPath: string,
      zkeyPath: string
    ): Promise<{
      proof: {
        pi_a: [string, string, string];
        pi_b: [[string, string], [string, string], [string, string]];
        pi_c: [string, string, string];
        protocol: string;
        curve: string;
      };
      publicSignals: string[];
    }>;

    function verify(
      vkey: unknown,
      publicSignals: string[],
      proof: unknown
    ): Promise<boolean>;
  }
}

declare module 'circomlibjs' {
  export function buildPoseidon(): Promise<{
    (inputs: bigint[]): unknown;
    F: {
      toObject(hash: unknown): bigint;
    };
  }>;
}
