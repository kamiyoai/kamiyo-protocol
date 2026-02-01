declare module 'snarkjs' {
  export namespace groth16 {
    function fullProve(
      input: Record<string, string | string[]>,
      wasmPath: string,
      zkeyPath: string
    ): Promise<{
      proof: {
        pi_a: string[];
        pi_b: string[][];
        pi_c: string[];
        protocol: string;
        curve: string;
      };
      publicSignals: string[];
    }>;

    function verify(
      vk: any,
      publicSignals: string[],
      proof: any
    ): Promise<boolean>;
  }
}
