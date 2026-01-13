/*
 * KAMIYO Agent Collaboration Client
 *
 * TypeScript SDK for ZK-private agent coordination.
 */

import { Program, AnchorProvider, BN, web3 } from '@coral-xyz/anchor';
import { PublicKey, Connection, Keypair } from '@solana/web3.js';
import {
  AGENT_COLLAB_PROGRAM_ID,
  Groth16Proof,
  RegistryConfig,
  AgentRegistry,
  Agent,
  Signal,
  SwarmAction,
  NullifierRecord,
} from './types';

// Import the generated IDL
import idlJson from './idl/kamiyo_agent_collab.json';
import { Idl } from '@coral-xyz/anchor';

// Re-export program ID for convenience
export { AGENT_COLLAB_PROGRAM_ID };

export class AgentCollabClient {
  readonly program: Program<Idl>;
  readonly connection: Connection;

  constructor(provider: AnchorProvider) {
    this.connection = provider.connection;
    this.program = new Program(idlJson as Idl, provider);
  }

  // ============================================================================
  // PDA Derivation
  // ============================================================================

  static getRegistryPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('registry')],
      AGENT_COLLAB_PROGRAM_ID
    );
  }

  static getAgentPDA(identityCommitment: Uint8Array): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('agent'), identityCommitment],
      AGENT_COLLAB_PROGRAM_ID
    );
  }

  static getStakeVaultPDA(registry: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('stake_vault'), registry.toBuffer()],
      AGENT_COLLAB_PROGRAM_ID
    );
  }

  static getSignalPDA(signalCommitment: Uint8Array): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('signal'), signalCommitment],
      AGENT_COLLAB_PROGRAM_ID
    );
  }

  static getNullifierPDA(nullifier: Uint8Array): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('nullifier'), nullifier],
      AGENT_COLLAB_PROGRAM_ID
    );
  }

  static getSwarmActionPDA(actionHash: Uint8Array): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('swarm_action'), actionHash],
      AGENT_COLLAB_PROGRAM_ID
    );
  }

  static getVoteNullifierPDA(
    swarmAction: PublicKey,
    nullifier: Uint8Array
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('vote'), swarmAction.toBuffer(), nullifier],
      AGENT_COLLAB_PROGRAM_ID
    );
  }

  // ============================================================================
  // Account Fetching
  // ============================================================================

  async getRegistry(): Promise<AgentRegistry | null> {
    const [registryPDA] = AgentCollabClient.getRegistryPDA();
    try {
      const accounts = this.program.account as Record<string, { fetch: (key: PublicKey) => Promise<unknown> }>;
      return await accounts['agentRegistry'].fetch(registryPDA) as AgentRegistry;
    } catch {
      return null;
    }
  }

  async getAgent(identityCommitment: Uint8Array): Promise<Agent | null> {
    const [agentPDA] = AgentCollabClient.getAgentPDA(identityCommitment);
    try {
      const accounts = this.program.account as Record<string, { fetch: (key: PublicKey) => Promise<unknown> }>;
      return await accounts['agent'].fetch(agentPDA) as Agent;
    } catch {
      return null;
    }
  }

  async getSignal(signalCommitment: Uint8Array): Promise<Signal | null> {
    const [signalPDA] = AgentCollabClient.getSignalPDA(signalCommitment);
    try {
      const accounts = this.program.account as Record<string, { fetch: (key: PublicKey) => Promise<unknown> }>;
      return await accounts['signal'].fetch(signalPDA) as Signal;
    } catch {
      return null;
    }
  }

  async getSwarmAction(actionHash: Uint8Array): Promise<SwarmAction | null> {
    const [actionPDA] = AgentCollabClient.getSwarmActionPDA(actionHash);
    try {
      const accounts = this.program.account as Record<string, { fetch: (key: PublicKey) => Promise<unknown> }>;
      return await accounts['swarmAction'].fetch(actionPDA) as SwarmAction;
    } catch {
      return null;
    }
  }

  // ============================================================================
  // Instructions
  // ============================================================================

  async initializeRegistry(
    authority: Keypair,
    config: RegistryConfig
  ): Promise<string> {
    const [registryPDA] = AgentCollabClient.getRegistryPDA();

    return this.program.methods
      .initializeRegistry(config)
      .accounts({
        registry: registryPDA,
        authority: authority.publicKey,
        systemProgram: web3.SystemProgram.programId,
      })
      .signers([authority])
      .rpc();
  }

  async registerAgent(
    payer: Keypair,
    identityCommitment: Uint8Array,
    stakeAmount: BN
  ): Promise<string> {
    const [registryPDA] = AgentCollabClient.getRegistryPDA();
    const [agentPDA] = AgentCollabClient.getAgentPDA(identityCommitment);
    const [stakeVault] = AgentCollabClient.getStakeVaultPDA(registryPDA);

    return this.program.methods
      .registerAgent(Array.from(identityCommitment), stakeAmount)
      .accounts({
        registry: registryPDA,
        agent: agentPDA,
        stakeVault,
        payer: payer.publicKey,
        systemProgram: web3.SystemProgram.programId,
      })
      .signers([payer])
      .rpc();
  }

  async submitSignal(
    payer: Keypair,
    proof: Groth16Proof,
    nullifier: Uint8Array,
    signalCommitment: Uint8Array
  ): Promise<string> {
    const [registryPDA] = AgentCollabClient.getRegistryPDA();
    const [signalPDA] = AgentCollabClient.getSignalPDA(signalCommitment);
    const [nullifierPDA] = AgentCollabClient.getNullifierPDA(nullifier);

    return this.program.methods
      .submitSignal(
        Array.from(nullifier),
        Array.from(signalCommitment),
        Array.from(proof.a),
        Array.from(proof.b),
        Array.from(proof.c)
      )
      .accounts({
        registry: registryPDA,
        signal: signalPDA,
        nullifierRecord: nullifierPDA,
        payer: payer.publicKey,
        systemProgram: web3.SystemProgram.programId,
      })
      .signers([payer])
      .rpc();
  }

  async createSwarmAction(
    payer: Keypair,
    proof: Groth16Proof,
    nullifier: Uint8Array,
    actionHash: Uint8Array,
    threshold: number
  ): Promise<string> {
    const [registryPDA] = AgentCollabClient.getRegistryPDA();
    const [actionPDA] = AgentCollabClient.getSwarmActionPDA(actionHash);

    return this.program.methods
      .createSwarmAction(
        Array.from(actionHash),
        Array.from(proof.a),
        Array.from(proof.b),
        Array.from(proof.c),
        Array.from(nullifier),
        threshold
      )
      .accounts({
        registry: registryPDA,
        swarmAction: actionPDA,
        payer: payer.publicKey,
        systemProgram: web3.SystemProgram.programId,
      })
      .signers([payer])
      .rpc();
  }

  async voteSwarmAction(
    payer: Keypair,
    proof: Groth16Proof,
    nullifier: Uint8Array,
    actionHash: Uint8Array,
    vote: boolean
  ): Promise<string> {
    const [registryPDA] = AgentCollabClient.getRegistryPDA();
    const [actionPDA] = AgentCollabClient.getSwarmActionPDA(actionHash);
    const [voteNullifierPDA] = AgentCollabClient.getVoteNullifierPDA(
      actionPDA,
      nullifier
    );

    return this.program.methods
      .voteSwarmAction(
        Array.from(nullifier),
        Array.from(proof.a),
        Array.from(proof.b),
        Array.from(proof.c),
        vote
      )
      .accounts({
        registry: registryPDA,
        swarmAction: actionPDA,
        voteNullifier: voteNullifierPDA,
        payer: payer.publicKey,
        systemProgram: web3.SystemProgram.programId,
      })
      .signers([payer])
      .rpc();
  }

  async executeSwarmAction(actionHash: Uint8Array): Promise<string> {
    const [actionPDA] = AgentCollabClient.getSwarmActionPDA(actionHash);

    return this.program.methods
      .executeSwarmAction()
      .accounts({
        swarmAction: actionPDA,
      })
      .rpc();
  }

  async updateAgentsRoot(
    authority: Keypair,
    newRoot: Uint8Array,
    agentCount: number
  ): Promise<string> {
    const [registryPDA] = AgentCollabClient.getRegistryPDA();

    return this.program.methods
      .updateAgentsRoot(Array.from(newRoot), agentCount)
      .accounts({
        registry: registryPDA,
        authority: authority.publicKey,
      })
      .signers([authority])
      .rpc();
  }

  async pauseProtocol(authority: Keypair): Promise<string> {
    const [registryPDA] = AgentCollabClient.getRegistryPDA();

    return this.program.methods
      .pauseProtocol()
      .accounts({
        registry: registryPDA,
        authority: authority.publicKey,
      })
      .signers([authority])
      .rpc();
  }

  async unpauseProtocol(authority: Keypair): Promise<string> {
    const [registryPDA] = AgentCollabClient.getRegistryPDA();

    return this.program.methods
      .unpauseProtocol()
      .accounts({
        registry: registryPDA,
        authority: authority.publicKey,
      })
      .signers([authority])
      .rpc();
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  async getCurrentEpoch(): Promise<BN> {
    const registry = await this.getRegistry();
    if (!registry) {
      throw new Error('Registry not initialized');
    }
    return registry.epoch;
  }

  async isNullifierUsed(nullifier: Uint8Array, epoch: BN): Promise<boolean> {
    const [nullifierPDA] = AgentCollabClient.getNullifierPDA(nullifier);
    try {
      const accounts = this.program.account as Record<string, { fetch: (key: PublicKey) => Promise<unknown> }>;
      const record = await accounts['nullifierRecord'].fetch(nullifierPDA) as NullifierRecord;
      return record.epoch.eq(epoch);
    } catch {
      return false;
    }
  }

  async getAgentsRoot(): Promise<Uint8Array> {
    const registry = await this.getRegistry();
    if (!registry) {
      throw new Error('Registry not initialized');
    }
    return new Uint8Array(registry.agentsRoot);
  }

  async getMinStake(): Promise<BN> {
    const registry = await this.getRegistry();
    if (!registry) {
      throw new Error('Registry not initialized');
    }
    return registry.minStake;
  }

  async getMinSignalConfidence(): Promise<number> {
    const registry = await this.getRegistry();
    if (!registry) {
      throw new Error('Registry not initialized');
    }
    return registry.minSignalConfidence;
  }
}
