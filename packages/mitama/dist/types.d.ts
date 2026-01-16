import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
export declare const MITAMA_PROGRAM_ID: PublicKey;
export interface AgentRegistry {
    authority: PublicKey;
    agentsRoot: Uint8Array;
    agentCount: number;
    signalCount: number;
    swarmActionCount: number;
    epoch: BN;
    minStake: BN;
    minSignalConfidence: number;
    bump: number;
    paused: boolean;
}
export interface Agent {
    registry: PublicKey;
    identityCommitment: Uint8Array;
    stake: BN;
    registeredSlot: BN;
    signalCount: number;
    swarmVotes: number;
    active: boolean;
    bump: number;
}
export interface Signal {
    registry: PublicKey;
    nullifier: Uint8Array;
    commitment: Uint8Array;
    submittedSlot: BN;
    revealed: boolean;
    bump: number;
}
export interface SwarmAction {
    registry: PublicKey;
    proposerNullifier: Uint8Array;
    actionHash: Uint8Array;
    threshold: number;
    votesFor: number;
    votesAgainst: number;
    weightedVotesFor: BN;
    weightedVotesAgainst: BN;
    createdSlot: BN;
    deadlineSlot: BN;
    executed: boolean;
    bump: number;
}
export interface NullifierRecord {
    epoch: BN;
    nullifier: Uint8Array;
    bump: number;
}
export interface VoteNullifier {
    action: PublicKey;
    nullifier: Uint8Array;
    bump: number;
}
export interface SignalAggregator {
    registry: PublicKey;
    epoch: BN;
    totalSignals: number;
    longCount: number;
    shortCount: number;
    neutralCount: number;
    totalConfidence: number;
    totalMagnitude: number;
    lastUpdatedSlot: BN;
    bump: number;
}
export interface WithdrawalRequest {
    agent: PublicKey;
    requester: PublicKey;
    amount: BN;
    requestSlot: BN;
    unlockSlot: BN;
    claimed: boolean;
    bump: number;
}
export interface IdentityLink {
    zkAgent: PublicKey;
    kamiyoAgent: PublicKey;
    owner: PublicKey;
    stakedAmount: BN;
    stakeMultiplier: BN;
    linkedSlot: BN;
    active: boolean;
    bump: number;
}
export interface RegistryConfig {
    minStake: BN;
    minSignalConfidence: number;
}
export interface Groth16Proof {
    a: Uint8Array;
    b: Uint8Array;
    c: Uint8Array;
}
export interface AgentIdentityInputs {
    ownerSecret: Uint8Array;
    agentId: Uint8Array;
    registrationSecret: Uint8Array;
    merkleProof: Uint8Array[];
    merklePathIndices: number[];
}
export interface PrivateSignalInputs {
    signalType: number;
    direction: number;
    confidence: number;
    magnitude: number;
    stakeAmount: bigint;
    secret: Uint8Array;
}
export interface SwarmVoteInputs extends AgentIdentityInputs {
    vote: boolean;
    voteSalt: Uint8Array;
}
export interface RegistryInitializedEvent {
    registry: PublicKey;
    authority: PublicKey;
    minStake: BN;
}
export interface AgentRegisteredEvent {
    registry: PublicKey;
    agent: PublicKey;
    identityCommitment: Uint8Array;
    stake: BN;
}
export interface AgentsRootUpdatedEvent {
    registry: PublicKey;
    newRoot: Uint8Array;
    agentCount: number;
    epoch: BN;
}
export interface SignalSubmittedEvent {
    registry: PublicKey;
    nullifier: Uint8Array;
    commitment: Uint8Array;
    slot: BN;
}
export interface SwarmActionCreatedEvent {
    registry: PublicKey;
    actionHash: Uint8Array;
    threshold: number;
    deadlineSlot: BN;
}
export interface SwarmVoteCastEvent {
    action: PublicKey;
    nullifier: Uint8Array;
    vote: boolean;
    votesFor: number;
    votesAgainst: number;
}
export interface SwarmActionExecutedEvent {
    action: PublicKey;
    actionHash: Uint8Array;
    votesFor: number;
    votesAgainst: number;
}
export declare enum SignalType {
    BUY = 0,
    SELL = 1,
    HOLD = 2,
    ALERT = 3
}
//# sourceMappingURL=types.d.ts.map