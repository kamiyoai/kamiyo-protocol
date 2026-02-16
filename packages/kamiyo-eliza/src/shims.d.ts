declare module '@kamiyo/dkg-quality-oracle' {
  export type QualityStakingManager = any;
  export type OracleProtocolManager = any;
  export type InferenceProvenanceTracker = any;
  export type DisputeResolutionManager = any;
  export type DKGClientInterface = any;

  export const DragQualityClient: any;
  export function createQualityOracleSystem(...args: any[]): any;
  export function createDKGClient(...args: any[]): any;
}

declare module '@kamiyo/solana-privacy' {
  export const PrivateInference: any;
  export function generateSecret(...args: any[]): any;
  export function verifyReputationProof(...args: any[]): any;
}
