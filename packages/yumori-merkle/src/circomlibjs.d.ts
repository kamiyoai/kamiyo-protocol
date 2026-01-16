declare module 'circomlibjs' {
  export interface PoseidonFunction {
    (inputs: (bigint | string)[]): Uint8Array;
    F: {
      toObject(x: Uint8Array): bigint;
    };
  }
  export function buildPoseidon(): Promise<PoseidonFunction>;
}
