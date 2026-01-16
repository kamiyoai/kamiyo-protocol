declare module 'circomlibjs' {
  export interface Poseidon {
    (inputs: (bigint | number)[]): Uint8Array;
    F: {
      toObject(element: Uint8Array): bigint;
      fromObject(n: bigint): Uint8Array;
    };
  }

  export function buildPoseidon(): Promise<Poseidon>;
}
