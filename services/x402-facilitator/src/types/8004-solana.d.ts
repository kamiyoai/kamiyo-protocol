declare module '8004-solana' {
  import type { PublicKey } from '@solana/web3.js';

  export enum ServiceType {
    MCP = 'MCP',
    A2A = 'A2A',
    OASF = 'OASF',
    ENS = 'ENS',
    SNS = 'SNS',
    DID = 'DID',
    WALLET = 'WALLET',
  }

  export type Service = {
    type: ServiceType;
    value: string;
  };

  export type AgentSummary = {
    averageScore: number;
    totalFeedbacks: number;
    positiveCount: number;
    negativeCount: number;
    nextFeedbackIndex: number;
  };

  export type LoadedAgent = {
    nft_name?: string | null;
    agent_uri?: string | null;
    getOwnerPublicKey(): PublicKey;
    getAgentWalletPublicKey(): PublicKey | null;
  };

  export class SolanaSDK {
    constructor(config: {
      cluster: string;
      rpcUrl: string;
      indexerGraphqlUrl?: string;
    });

    loadAgent(asset: PublicKey): Promise<LoadedAgent | null>;
    getSummary(asset: PublicKey): Promise<AgentSummary>;
  }

  export function buildRegistrationFileJson(input: Record<string, unknown>): Record<string, unknown>;
}
