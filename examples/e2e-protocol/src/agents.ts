import { Keypair, Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Wallet, BN } from '@coral-xyz/anchor';
import { ethers } from 'ethers';
import { KamiyoClient, Shield, Blacklist, CredentialManager, AgentType } from '@kamiyo/sdk';
import { Agent, AgentStats } from './types';
import { PROGRAM_ID, DEFAULTS } from './config';
import { log } from './logger';

interface AgentProfile {
  name: string;
  stats: AgentStats;
  stake: number;
}

const DEFAULT_PROFILES: AgentProfile[] = [
  { name: 'AlphaBot', stats: { successful: 95, total: 100, disputesWon: 3, disputesLost: 0 }, stake: 1.0 },
  { name: 'BetaService', stats: { successful: 82, total: 100, disputesWon: 1, disputesLost: 2 }, stake: 0.5 },
  { name: 'GammaOracle', stats: { successful: 70, total: 100, disputesWon: 0, disputesLost: 4 }, stake: 0.3 },
  { name: 'DeltaAgent', stats: { successful: 55, total: 100, disputesWon: 0, disputesLost: 7 }, stake: 0.1 },
];

export class AgentRegistry {
  private agents: Map<string, Agent> = new Map();
  private blacklist: Blacklist;
  private credentials: CredentialManager;
  private client: KamiyoClient | null = null;

  constructor(connection?: Connection, wallet?: Wallet) {
    this.blacklist = new Blacklist();
    this.credentials = new CredentialManager(Keypair.generate());

    if (connection && wallet) {
      this.client = new KamiyoClient({ connection, wallet, programId: PROGRAM_ID });
    }
  }

  async registerAgents(count: number = 4): Promise<Agent[]> {
    const profiles = DEFAULT_PROFILES.slice(0, count);
    const registered: Agent[] = [];

    for (const profile of profiles) {
      await log.wait(`Generating keypair for ${profile.name}...`, 400);
      const agent = await this.createAgent(profile);
      this.agents.set(agent.id, agent);
      registered.push(agent);

      await log.ok(
        `${agent.name}: ${agent.keypair.publicKey.toBase58().slice(0, 8)}... | stake: ${agent.stake} SOL`
      );
      await log.dim(`  success: ${agent.stats.successful}% | disputes: ${agent.stats.disputesLost}`);
    }

    await log.wait('Initializing reputation shields...', 800);

    for (const agent of registered) {
      if (agent.stats.disputesLost >= DEFAULTS.reputation.blacklistThreshold) {
        this.blacklistAgent(agent, 'excessive disputes');
        await log.warn(`${agent.name} pre-blacklisted (${agent.stats.disputesLost} disputes)`);
      }
    }

    return registered;
  }

  private async createAgent(profile: AgentProfile): Promise<Agent> {
    const keypair = Keypair.generate();
    const shield = new Shield(keypair.publicKey);
    shield.setRep(profile.stats);

    const evmAddress = ethers.keccak256(keypair.publicKey.toBytes()).slice(0, 42);

    const agent: Agent = {
      id: keypair.publicKey.toBase58(),
      name: profile.name,
      keypair,
      evmAddress,
      shield,
      stats: { ...profile.stats },
      stake: profile.stake,
      isBlacklisted: false,
    };

    if (this.client) {
      try {
        await this.client.createAgent({
          name: profile.name,
          agentType: AgentType.Service,
          stakeAmount: new BN(profile.stake * LAMPORTS_PER_SOL),
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        await log.warn(`${profile.name} on-chain registration failed: ${msg.slice(0, 50)}`);
      }
    }

    return agent;
  }

  blacklistAgent(agent: Agent, reason: string): void {
    this.blacklist.add(agent.keypair.publicKey, reason);
    agent.isBlacklisted = true;
  }

  isBlacklisted(agent: Agent): boolean {
    return this.blacklist.contains(agent.keypair.publicKey);
  }

  verifyEligibility(agent: Agent, threshold: number): { eligible: boolean; reason?: string } {
    if (this.isBlacklisted(agent)) {
      return { eligible: false, reason: 'blacklisted' };
    }

    if (!agent.shield.meetsThreshold(threshold)) {
      return { eligible: false, reason: `${agent.shield.successRate()}% < ${threshold}%` };
    }

    return { eligible: true };
  }

  generateZKProof(agent: Agent): { commitment: string; proof: { siblings: unknown[] } } {
    const commitment = agent.shield.commitment().toString(16);
    const proof = this.blacklist.exclusionProof(agent.keypair.publicKey);
    const cred = agent.shield.issue(this.blacklist.getRoot());
    this.credentials.issue(cred);

    return { commitment, proof };
  }

  updateReputation(agent: Agent, delta: number): void {
    const newStats = {
      ...agent.stats,
      successful: Math.max(0, Math.min(100, agent.stats.successful + delta)),
    };
    agent.stats = newStats;
    agent.shield.setRep(newStats);
  }

  recordDispute(agent: Agent, won: boolean): void {
    agent.stats.total++;
    if (won) {
      agent.stats.disputesWon++;
    } else {
      agent.stats.disputesLost++;
      if (agent.stats.disputesLost >= DEFAULTS.reputation.blacklistThreshold) {
        this.blacklistAgent(agent, 'too many lost disputes');
      }
    }
    agent.shield.setRep(agent.stats);
  }

  recordSuccess(agent: Agent): void {
    agent.stats.successful++;
    agent.stats.total++;
    agent.shield.setRep(agent.stats);
  }

  getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  getAllAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  getEligibleProviders(threshold: number, excludeConsumer?: Agent): Agent[] {
    return this.getAllAgents().filter(a => {
      if (excludeConsumer && a.id === excludeConsumer.id) return false;
      return this.verifyEligibility(a, threshold).eligible;
    });
  }

  getBlacklist(): Blacklist {
    return this.blacklist;
  }

  getClient(): KamiyoClient | null {
    return this.client;
  }
}
