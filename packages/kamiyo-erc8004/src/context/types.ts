export const MAX_NAME_LENGTH = 256;
export const MAX_DESCRIPTION_LENGTH = 2000;
export const MAX_URI_LENGTH = 2048;
export const MAX_HASH_LENGTH = 66; // 0x + 64 hex chars
export const HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;
export const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
export const GLOBAL_ID_REGEX = /^eip155:\d+:0x[a-fA-F0-9]{40}:\d+$/;

export interface DKGClient {
  query(sparql: string): Promise<unknown[]>;
  get(ual: string): Promise<{ content: unknown; metadata?: Record<string, unknown> }>;
  publish(content: { public: object }, options?: { epochs?: number }): Promise<string>;
}

export type ServiceName = 'A2A' | 'MCP' | 'OASF' | 'ENS' | 'DID' | 'email';

export interface ServiceEndpoint {
  name: ServiceName | string;
  endpoint: string;
  version?: string;
}

export type TrustModel = 'reputation' | 'crypto-economic' | 'tee-attestation' | 'zk-proof';

export interface RegistrationEntry {
  agentId: string;
  agentRegistry: string;
}

// https://eips.ethereum.org/EIPS/eip-8004#registration-v1
export interface ERC8004RegistrationFile {
  type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1';
  name: string;
  description?: string;
  image?: string;
  services: ServiceEndpoint[];
  x402Support?: boolean;
  active: boolean;
  registrations: RegistrationEntry[];
  supportedTrust: TrustModel[];
}

export interface FeedbackRecord {
  agentId: string;
  agentRegistry: string;
  clientAddress: string;
  feedbackIndex: number;
  value: number;
  valueDecimals: number;
  tag1?: string;
  tag2?: string;
  endpoint?: string;
  feedbackURI?: string;
  feedbackHash: string;
  timestamp: string;
  isRevoked?: boolean;
}

export interface ValidationRecord {
  requestHash: string;
  validatorAddress: string;
  agentId: string;
  agentRegistry: string;
  requestURI?: string;
  response?: number;
  responseURI?: string;
  responseHash?: string;
  tag?: string;
  timestamp: string;
}

export interface DecisionTrace {
  agentGlobalId: string;
  actionType: string;
  description: string;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  reasoning?: string;
  timestamp: string;
  outcome?: 'success' | 'failure' | 'pending';
  evidenceUAL?: string;
  counterpartyId?: string;
  value?: { amount: number; currency: string };
}

export interface VerifiableCredential {
  '@context': string[];
  type: string[];
  issuer: string;
  issuanceDate: string;
  expirationDate?: string;
  credentialSubject: {
    id: string;
    [key: string]: unknown;
  };
  proof?: {
    type: string;
    created?: string;
    verificationMethod?: string;
    proofPurpose?: string;
    proofValue?: string;
  };
}

export interface AgentRelationship {
  sourceGlobalId: string;
  targetGlobalId: string;
  relationshipType: 'collaborator' | 'delegator' | 'endorser' | 'trusts' | 'employed_by';
  since: string;
  until?: string;
  context?: string;
  evidenceUAL?: string;
}

export interface AgentContextResult {
  globalId: string;
  ual: string;
  name: string;
  description?: string;
  services: ServiceEndpoint[];
  supportedTrust: TrustModel[];
  active: boolean;
  registrations: RegistrationEntry[];
  feedbackCount: number;
  validationCount: number;
  decisionCount: number;
  averageRating?: number;
}

export interface ReputationQueryResult {
  globalId: string;
  feedbackCount: number;
  averageValue: number;
  tag1?: string;
  tag2?: string;
}

export interface ContextGraphConfig {
  dkg: DKGClient;
  defaultEpochs?: number;
}

export interface PublishResult {
  success: boolean;
  ual?: string;
  error?: string;
}
