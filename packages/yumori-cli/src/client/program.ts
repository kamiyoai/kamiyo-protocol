import { Program } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import BN from 'bn.js';
import { SolanaClient, PROGRAM_ID } from './connection.js';
import { randomBytes } from 'crypto';

// Inline IDL type definition
const IDL = {
  address: 'DmdBbvjNRLNvCQcyeUmyTi5BpDkHdGfUxGzfidgvQe26',
  metadata: {
    name: 'yumori',
    version: '0.1.0',
    spec: '0.1.0',
  },
  instructions: [],
  accounts: [],
} as any;

export interface RegistryState {
  authority: PublicKey;
  agentsRoot: Uint8Array;
  agentCount: number;
  signalCount: number;
  swarmActionCount: number;
  epoch: bigint;
  minStake: bigint;
  minSignalConfidence: number;
  paused: boolean;
}

export interface AgentState {
  registry: PublicKey;
  identityCommitment: Uint8Array;
  stake: bigint;
  registeredSlot: bigint;
  signalCount: number;
  swarmVotes: number;
  active: boolean;
}

export interface SwarmActionState {
  registry: PublicKey;
  proposerNullifier: Uint8Array;
  actionHash: Uint8Array;
  threshold: number;
  votesFor: number;
  votesAgainst: number;
  weightedVotesFor: bigint;
  weightedVotesAgainst: bigint;
  createdSlot: bigint;
  deadlineSlot: bigint;
  executed: boolean;
}

export class YumoriProgram {
  private client: SolanaClient;
  private program: Program | null = null;

  constructor(client: SolanaClient) {
    this.client = client;
  }

  private async getProgram(): Promise<Program> {
    if (this.program) return this.program;

    const provider = this.client.getProvider();
    if (!provider) throw new Error('No wallet connected');

    // Load IDL from the yumori package
    const idlPath = new URL(
      '../../../yumori/src/idl/yumori.json',
      import.meta.url
    );

    let idl: any;
    try {
      const { readFileSync } = await import('fs');
      const { fileURLToPath } = await import('url');
      idl = JSON.parse(readFileSync(fileURLToPath(idlPath), 'utf8'));
    } catch {
      // Fallback: fetch from chain or use minimal IDL
      throw new Error('Could not load program IDL');
    }

    this.program = new Program(idl, provider);
    return this.program;
  }

  // PDA derivations
  static getRegistryPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from('registry')], PROGRAM_ID);
  }

  static getAgentPDA(identityCommitment: Uint8Array): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('agent'), identityCommitment],
      PROGRAM_ID
    );
  }

  static getStakeVaultPDA(registry: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('stake_vault'), registry.toBuffer()],
      PROGRAM_ID
    );
  }

  static getSwarmActionPDA(actionHash: Uint8Array): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('swarm_action'), actionHash],
      PROGRAM_ID
    );
  }

  // Read operations
  async getRegistry(): Promise<RegistryState | null> {
    const program = await this.getProgram();
    const [registryPDA] = YumoriProgram.getRegistryPDA();

    try {
      const account = await (program.account as any).agentRegistry.fetch(registryPDA);
      return {
        authority: account.authority,
        agentsRoot: new Uint8Array(account.agentsRoot),
        agentCount: account.agentCount,
        signalCount: account.signalCount,
        swarmActionCount: account.swarmActionCount,
        epoch: BigInt(account.epoch.toString()),
        minStake: BigInt(account.minStake.toString()),
        minSignalConfidence: account.minSignalConfidence,
        paused: account.paused,
      };
    } catch {
      return null;
    }
  }

  async getAgent(identityCommitment: Uint8Array): Promise<AgentState | null> {
    const program = await this.getProgram();
    const [agentPDA] = YumoriProgram.getAgentPDA(identityCommitment);

    try {
      const account = await (program.account as any).agent.fetch(agentPDA);
      return {
        registry: account.registry,
        identityCommitment: new Uint8Array(account.identityCommitment),
        stake: BigInt(account.stake.toString()),
        registeredSlot: BigInt(account.registeredSlot.toString()),
        signalCount: account.signalCount,
        swarmVotes: account.swarmVotes,
        active: account.active,
      };
    } catch {
      return null;
    }
  }

  async getSwarmAction(actionHash: Uint8Array): Promise<SwarmActionState | null> {
    const program = await this.getProgram();
    const [actionPDA] = YumoriProgram.getSwarmActionPDA(actionHash);

    try {
      const account = await (program.account as any).swarmAction.fetch(actionPDA);
      return {
        registry: account.registry,
        proposerNullifier: new Uint8Array(account.proposerNullifier),
        actionHash: new Uint8Array(account.actionHash),
        threshold: account.threshold,
        votesFor: account.votesFor,
        votesAgainst: account.votesAgainst,
        weightedVotesFor: BigInt(account.weightedVotesFor.toString()),
        weightedVotesAgainst: BigInt(account.weightedVotesAgainst.toString()),
        createdSlot: BigInt(account.createdSlot.toString()),
        deadlineSlot: BigInt(account.deadlineSlot.toString()),
        executed: account.executed,
      };
    } catch {
      return null;
    }
  }

  // Write operations
  async registerAgent(stakeAmount: bigint): Promise<{ signature: string; commitment: Uint8Array }> {
    const program = await this.getProgram();
    const payer = this.client.keypair;
    if (!payer) throw new Error('No wallet connected');

    const [registryPDA] = YumoriProgram.getRegistryPDA();
    const [stakeVault] = YumoriProgram.getStakeVaultPDA(registryPDA);

    // Generate random identity commitment
    const identityCommitment = randomBytes(32);
    const [agentPDA] = YumoriProgram.getAgentPDA(identityCommitment);

    const signature = await program.methods
      .registerAgent(Array.from(identityCommitment), new BN(stakeAmount.toString()))
      .accounts({
        registry: registryPDA,
        agent: agentPDA,
        stakeVault: stakeVault,
        payer: payer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc();

    return { signature, commitment: identityCommitment };
  }

  async createSwarmAction(
    actionHash: Uint8Array,
    threshold: number,
    proof: { a: number[]; b: number[]; c: number[] },
    nullifier: Uint8Array
  ): Promise<string> {
    const program = await this.getProgram();
    const payer = this.client.keypair;
    if (!payer) throw new Error('No wallet connected');

    const [registryPDA] = YumoriProgram.getRegistryPDA();
    const [actionPDA] = YumoriProgram.getSwarmActionPDA(actionHash);

    const signature = await program.methods
      .createSwarmAction(
        Array.from(actionHash),
        proof.a,
        proof.b,
        proof.c,
        Array.from(nullifier),
        threshold
      )
      .accounts({
        registry: registryPDA,
        swarmAction: actionPDA,
        payer: payer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc();

    return signature;
  }
}
