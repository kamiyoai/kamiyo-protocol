/**
 * KAMIYO Governance Client
 */

import { Connection, PublicKey, SystemProgram } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { BN } from '@coral-xyz/anchor';

export const GOVERNANCE_PROGRAM_ID = new PublicKey('E3oQcCm55mykVG1A92qGvgWQdxv8TmkpvWwat1NCFGav');
export const STAKING_PROGRAM_ID = new PublicKey('9QZGdEZ13j8fASEuhpj3eVwUPT4BpQjXSabVjRppJW2N');
export const KAMIYO_MINT = new PublicKey('Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump');

const TOKEN_2022_PROGRAM = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const ATA_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

export enum ProposalState {
  Voting,
  Queued,
  Executed,
  Defeated,
  Expired,
  Cancelled,
}

export interface GovernanceConfig {
  admin: PublicKey;
  tokenMint: PublicKey;
  proposalCount: BN;
  proposalThreshold: BN;
  quorumThreshold: BN;
  approvalThresholdBps: BN;
  votingPeriod: BN;
  timelockDuration: BN;
  isPaused: boolean;
  bump: number;
}

export interface Proposal {
  id: BN;
  proposer: PublicKey;
  title: string;
  description: string;
  state: ProposalState;
  createdAt: BN;
  votingEndsAt: BN;
  executionEta: BN;
  votesFor: BN;
  votesAgainst: BN;
  voterCount: number;
  executed: boolean;
  bump: number;
}

export interface VoteRecord {
  proposal: PublicKey;
  voter: PublicKey;
  weight: BN;
  support: boolean;
  votedAt: BN;
  bump: number;
}

export class GovernanceClient {
  private connection: Connection;
  private program: anchor.Program | null = null;
  private wallet: anchor.Wallet | null = null;

  constructor(connection: Connection, wallet?: anchor.Wallet) {
    this.connection = connection;
    this.wallet = wallet ?? null;
  }

  async initializeProgram(idl: any): Promise<void> {
    if (!this.wallet) throw new Error('Wallet required');
    const provider = new anchor.AnchorProvider(this.connection, this.wallet, { commitment: 'confirmed' });
    this.program = new anchor.Program(idl, provider);
  }

  // PDAs

  getConfigPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from('governance')], GOVERNANCE_PROGRAM_ID);
  }

  getProposalPDA(id: BN): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('proposal'), id.toArrayLike(Buffer, 'le', 8)],
      GOVERNANCE_PROGRAM_ID
    );
  }

  getVoteRecordPDA(proposal: PublicKey, voter: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('vote'), proposal.toBuffer(), voter.toBuffer()],
      GOVERNANCE_PROGRAM_ID
    );
  }

  getStakePositionPDA(owner: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from('stake'), owner.toBuffer()], STAKING_PROGRAM_ID);
  }

  private getATA(owner: PublicKey): PublicKey {
    const [ata] = PublicKey.findProgramAddressSync(
      [owner.toBuffer(), TOKEN_2022_PROGRAM.toBuffer(), KAMIYO_MINT.toBuffer()],
      ATA_PROGRAM
    );
    return ata;
  }

  // Read

  async getConfig(): Promise<GovernanceConfig | null> {
    const [pda] = this.getConfigPDA();
    const info = await this.connection.getAccountInfo(pda);
    if (!info) return null;

    const data = info.data;
    let off = 8;
    const read32 = () => { const v = new PublicKey(data.slice(off, off + 32)); off += 32; return v; };
    const read64 = () => { const v = new BN(data.slice(off, off + 8), 'le'); off += 8; return v; };
    const read8 = () => data[off++];

    return {
      admin: read32(),
      tokenMint: read32(),
      proposalCount: read64(),
      proposalThreshold: read64(),
      quorumThreshold: read64(),
      approvalThresholdBps: read64(),
      votingPeriod: read64(),
      timelockDuration: read64(),
      isPaused: read8() === 1,
      bump: read8(),
    };
  }

  async getProposal(id: BN): Promise<Proposal | null> {
    const [pda] = this.getProposalPDA(id);
    const info = await this.connection.getAccountInfo(pda);
    if (!info) return null;

    const data = info.data;
    let off = 8;

    const proposalId = new BN(data.slice(off, off + 8), 'le'); off += 8;
    const proposer = new PublicKey(data.slice(off, off + 32)); off += 32;

    const titleLen = data.readUInt32LE(off); off += 4;
    const title = data.slice(off, off + titleLen).toString('utf8'); off += titleLen;

    const descLen = data.readUInt32LE(off); off += 4;
    const description = data.slice(off, off + descLen).toString('utf8'); off += descLen;

    const state = data[off++] as ProposalState;
    const createdAt = new BN(data.slice(off, off + 8), 'le'); off += 8;
    const votingEndsAt = new BN(data.slice(off, off + 8), 'le'); off += 8;
    const executionEta = new BN(data.slice(off, off + 8), 'le'); off += 8;
    const votesFor = new BN(data.slice(off, off + 8), 'le'); off += 8;
    const votesAgainst = new BN(data.slice(off, off + 8), 'le'); off += 8;
    const voterCount = data.readUInt32LE(off); off += 4;
    const executed = data[off++] === 1;
    const bump = data[off];

    return {
      id: proposalId, proposer, title, description, state, createdAt,
      votingEndsAt, executionEta, votesFor, votesAgainst, voterCount, executed, bump,
    };
  }

  async getVoteRecord(proposal: PublicKey, voter: PublicKey): Promise<VoteRecord | null> {
    const [pda] = this.getVoteRecordPDA(proposal, voter);
    const info = await this.connection.getAccountInfo(pda);
    if (!info) return null;

    const data = info.data;
    let off = 8;

    return {
      proposal: new PublicKey(data.slice(off, off + 32)),
      voter: new PublicKey(data.slice((off += 32), off + 32)),
      weight: new BN(data.slice((off += 32), off + 8), 'le'),
      support: data[(off += 8)] === 1,
      votedAt: new BN(data.slice((off += 1), off + 8), 'le'),
      bump: data[(off += 8)],
    };
  }

  async getAllProposals(): Promise<Proposal[]> {
    const config = await this.getConfig();
    if (!config) return [];

    const proposals: Proposal[] = [];
    for (let i = 0; i < config.proposalCount.toNumber(); i++) {
      const p = await this.getProposal(new BN(i));
      if (p) proposals.push(p);
    }
    return proposals;
  }

  async getActiveProposals(): Promise<Proposal[]> {
    return (await this.getAllProposals()).filter(p => p.state === ProposalState.Voting);
  }

  // Write

  async createProposal(title: string, description: string): Promise<string> {
    this.requireProgram();
    const config = await this.getConfig();
    if (!config) throw new Error('Governance not initialized');

    const [configPDA] = this.getConfigPDA();
    const [proposalPDA] = this.getProposalPDA(config.proposalCount);

    return this.program!.methods
      .createProposal(title, description)
      .accounts({
        config: configPDA,
        proposal: proposalPDA,
        proposerTokenAccount: this.getATA(this.wallet!.publicKey),
        proposer: this.wallet!.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  async castVote(proposalId: BN, support: boolean): Promise<string> {
    this.requireProgram();

    const [configPDA] = this.getConfigPDA();
    const [proposalPDA] = this.getProposalPDA(proposalId);
    const [voteRecordPDA] = this.getVoteRecordPDA(proposalPDA, this.wallet!.publicKey);
    const [stakePositionPDA] = this.getStakePositionPDA(this.wallet!.publicKey);

    const stakeInfo = await this.connection.getAccountInfo(stakePositionPDA);

    const accounts: any = {
      config: configPDA,
      proposal: proposalPDA,
      voteRecord: voteRecordPDA,
      voterTokenAccount: this.getATA(this.wallet!.publicKey),
      voter: this.wallet!.publicKey,
      systemProgram: SystemProgram.programId,
    };
    if (stakeInfo) accounts.stakePosition = stakePositionPDA;

    return this.program!.methods.castVote(support).accounts(accounts).rpc();
  }

  async finalizeProposal(proposalId: BN): Promise<string> {
    this.requireProgram();
    const [configPDA] = this.getConfigPDA();
    const [proposalPDA] = this.getProposalPDA(proposalId);

    return this.program!.methods.finalizeProposal().accounts({ config: configPDA, proposal: proposalPDA }).rpc();
  }

  async executeProposal(proposalId: BN): Promise<string> {
    this.requireProgram();
    const [configPDA] = this.getConfigPDA();
    const [proposalPDA] = this.getProposalPDA(proposalId);

    return this.program!.methods
      .executeProposal()
      .accounts({ config: configPDA, proposal: proposalPDA, executor: this.wallet!.publicKey })
      .rpc();
  }

  async cancelProposal(proposalId: BN): Promise<string> {
    this.requireProgram();
    const [proposalPDA] = this.getProposalPDA(proposalId);

    return this.program!.methods.cancelProposal().accounts({ proposal: proposalPDA, proposer: this.wallet!.publicKey }).rpc();
  }

  // Helpers

  private requireProgram(): void {
    if (!this.program || !this.wallet) throw new Error('Program not initialized');
  }

  async calculateVoteWeight(address: PublicKey): Promise<BN> {
    const ata = this.getATA(address);
    const ataInfo = await this.connection.getAccountInfo(ata);
    let balance = new BN(0);
    if (ataInfo) balance = new BN(ataInfo.data.slice(64, 72), 'le');

    const [stakePDA] = this.getStakePositionPDA(address);
    const stakeInfo = await this.connection.getAccountInfo(stakePDA);
    if (!stakeInfo || stakeInfo.data.length < 56) return balance;

    const stakedAmount = new BN(stakeInfo.data.slice(40, 48), 'le');
    const stakeStart = new BN(stakeInfo.data.slice(48, 56), 'le').toNumber();
    const duration = Math.floor(Date.now() / 1000) - stakeStart;

    let mult = 10000;
    if (duration >= 180 * 86400) mult = 20000;
    else if (duration >= 90 * 86400) mult = 15000;
    else if (duration >= 30 * 86400) mult = 12000;

    return balance.add(stakedAmount.muln(mult).divn(10000));
  }

  proposalStateString(state: ProposalState): string {
    return ['Voting', 'Queued', 'Executed', 'Defeated', 'Expired', 'Cancelled'][state] ?? 'Unknown';
  }

  async checkProposalPassed(proposalId: BN): Promise<{ passed: boolean; reason?: string }> {
    const proposal = await this.getProposal(proposalId);
    const config = await this.getConfig();
    if (!proposal || !config) return { passed: false, reason: 'Not found' };

    const total = proposal.votesFor.add(proposal.votesAgainst);
    if (total.lt(config.quorumThreshold)) return { passed: false, reason: 'Quorum not reached' };

    const approvalBps = proposal.votesFor.muln(10000).div(total);
    if (approvalBps.lt(config.approvalThresholdBps)) return { passed: false, reason: 'Approval threshold not met' };

    return { passed: true };
  }
}
