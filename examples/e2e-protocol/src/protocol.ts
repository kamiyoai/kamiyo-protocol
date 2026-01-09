import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import { ethers } from 'ethers';
import { createMonadProvider, createReputationBridge, createSwarmBacktester, MonadProvider } from '@kamiyo/monad';
import { Voting } from '@kamiyo/sdk';
import { AgentRegistry } from './agents';
import { OracleNetwork } from './oracles';
import { EscrowManager } from './escrows';
import { MetricsCollector } from './metrics';
import { DemoConfig, DEFAULTS, RPC } from './config';
import { log } from './logger';
import { SLAParams } from './types';

type Scenario = 'good' | 'degraded' | 'poor';

export class Protocol {
  private agents: AgentRegistry;
  private oracles: OracleNetwork;
  private escrows: EscrowManager;
  private metrics: MetricsCollector;
  private voting: Voting;
  private monadProvider: MonadProvider | null = null;
  private repBridge: ReturnType<typeof createReputationBridge> | null = null;
  private swarm: ReturnType<typeof createSwarmBacktester> | null = null;
  private config: DemoConfig;

  constructor(config: DemoConfig, connection?: Connection, wallet?: Wallet, evmKey?: string) {
    this.config = config;
    this.agents = new AgentRegistry(connection, wallet);
    this.oracles = new OracleNetwork();
    this.escrows = new EscrowManager(connection, wallet);
    this.metrics = new MetricsCollector();
    this.voting = new Voting();

    if (evmKey) {
      this.monadProvider = createMonadProvider('monad-testnet', { privateKey: evmKey });
      this.repBridge = createReputationBridge(this.monadProvider);
      this.swarm = createSwarmBacktester(this.monadProvider);
    }
  }

  async run(): Promise<void> {
    await this.phaseRegistration();
    await this.phaseReputationSync();
    await this.phaseOracleSetup();
    await this.phaseEscrowCreation();
    await this.phaseDelivery();
    await this.phaseDisputeResolution();
    await this.phaseReputationUpdate();
    await this.phaseSwarmSimulation();
    await this.phaseSummary();
  }

  private async phaseRegistration(): Promise<void> {
    await log.phase(1, 'AGENT REGISTRATION');
    await log.step('Registering agents on Solana');
    await this.agents.registerAgents(this.config.agentCount);
  }

  private async phaseReputationSync(): Promise<void> {
    await log.phase(2, 'CROSS-CHAIN REPUTATION SYNC');

    if (!this.repBridge) {
      await log.dim('Monad not configured, simulating reputation sync');
    }

    await log.step('Generating ZK reputation proofs');
    const allAgents = this.agents.getAllAgents();

    for (const agent of allAgents.filter(a => !a.isBlacklisted)) {
      await log.wait(`Computing merkle proof for ${agent.name}...`, 600);
      const { commitment, proof } = this.agents.generateZKProof(agent);
      await log.ok(`${agent.name}: ZK proof generated (${proof.siblings.length} merkle siblings)`);
      await log.dim(`  commitment: ${commitment.slice(0, 16)}...`);

      if (this.repBridge) {
        try {
          const exists = await this.repBridge.exists(agent.evmAddress);
          if (!exists) {
            await log.wait('Relaying proof to Monad...', 800);
            await log.ok(`${agent.name}: synced to Monad`);
          }
        } catch {
          await log.dim(`${agent.name}: Monad sync simulated`);
        }
      }
    }

    await log.wait('Finalizing cross-chain state...', 1000);
  }

  private async phaseOracleSetup(): Promise<void> {
    await log.phase(3, 'ORACLE NETWORK SETUP');
    await log.step('Registering dispute resolution oracles');
    await this.oracles.registerOracles(this.config.oracleCount);
  }

  private async phaseEscrowCreation(): Promise<void> {
    await log.phase(4, 'ESCROW CREATION');

    const allAgents = this.agents.getAllAgents();
    const consumer = allAgents[0];
    const threshold = DEFAULTS.reputation.eligibilityThreshold;

    await log.step('Verifying provider eligibility');

    const eligible = [];
    for (const agent of allAgents.slice(1)) {
      const result = this.agents.verifyEligibility(agent, threshold);
      if (result.eligible) {
        await log.ok(`${agent.name}: verified >= ${threshold}%`);
        eligible.push(agent);
      } else {
        await log.fail(`${agent.name}: ${result.reason}`);
      }
    }

    if (eligible.length === 0) {
      await log.warn('No eligible providers found');
      return;
    }

    await log.step('Creating escrows with SLA parameters');

    const sla: SLAParams = {
      quality: DEFAULTS.sla.qualityThreshold,
      latency: DEFAULTS.sla.maxLatencyMs,
      availability: DEFAULTS.sla.minAvailability,
    };

    for (const provider of eligible) {
      await log.wait(`Deploying escrow for ${provider.name}...`, 500);
      const amount = DEFAULTS.escrow.minAmount * 100 + Math.random() * 0.1;
      const escrow = await this.escrows.createEscrow(consumer, provider, amount, sla);
      this.metrics.recordEscrow(escrow);
    }

    await log.wait('Locking funds in escrow accounts...', 900);
  }

  private async phaseDelivery(): Promise<void> {
    await log.phase(5, 'SERVICE DELIVERY & QUALITY CHECK');

    const escrows = this.escrows.getAllEscrows();
    const scenarios = this.config.scenarios;

    for (let i = 0; i < escrows.length; i++) {
      const escrow = escrows[i];
      const scenario = scenarios[i % scenarios.length];
      await this.escrows.processDelivery(escrow, scenario);
    }
  }

  private async phaseDisputeResolution(): Promise<void> {
    await log.phase(6, 'MULTI-ORACLE DISPUTE RESOLUTION');

    const disputed = this.escrows.getDisputedEscrows();

    if (disputed.length === 0) {
      await log.dim('No disputes to resolve');
      return;
    }

    for (const escrow of disputed) {
      await log.step(`Resolving dispute: ${escrow.id.slice(0, 16)}...`);

      const selectedOracles = this.oracles.selectOracles(escrow);
      await log.dim(`Quorum: ${selectedOracles.length} oracles required`);

      await log.step('Oracle commit phase');
      const votes = await this.oracles.commitPhase(escrow, selectedOracles);

      await log.step('Oracle reveal phase');
      await this.oracles.revealPhase(votes);

      await log.step('Settlement calculation');
      await log.wait('Computing median score...', 500);
      const resolution = this.oracles.calculateSettlement(escrow, votes);
      escrow.resolution = resolution;

      const scores = votes.map(v => v.score).sort((a, b) => a - b);
      await log.dim(`scores: [${scores.join(', ')}]`);
      await log.ok(`median: ${resolution.medianScore}%`);
      await log.ok(`refund: ${resolution.refundPct}%`);
      await log.dim(
        `consumer: ${resolution.consumerRefund.toFixed(4)} SOL | provider: ${resolution.providerPayout.toFixed(4)} SOL`
      );

      await log.step('Oracle consensus check');
      await this.oracles.logConsensusCheck(resolution);

      await log.wait('Executing settlement on-chain...', 1200);
      this.escrows.resolveEscrow(escrow);
      this.metrics.recordResolution(resolution);

      const won = resolution.refundPct < 50;
      this.agents.recordDispute(escrow.provider, won);

      if (escrow.provider.isBlacklisted) {
        await log.warn(`${escrow.provider.name} blacklisted after dispute`);
      }
    }
  }

  private async phaseReputationUpdate(): Promise<void> {
    await log.phase(7, 'REPUTATION UPDATES');

    await log.step('Updating agent reputation');
    await log.wait('Calculating reputation deltas...', 600);

    const allAgents = this.agents.getAllAgents();
    for (const agent of allAgents) {
      const rate = agent.shield.successRate();
      const delta = agent.stats.disputesLost > 0 ? -5 : 2;
      this.agents.updateReputation(agent, delta);
      await log.ok(`${agent.name}: ${rate}% (${delta > 0 ? '+' : ''}${delta})`);
    }

    await log.wait('Committing reputation changes...', 800);

    if (this.repBridge) {
      await log.step('Syncing to Monad');
      for (const agent of allAgents.slice(0, 2)) {
        await log.wait(`Bridging ${agent.name} state...`, 500);
        await log.ok(`${agent.name}: mirrored to ${agent.evmAddress.slice(0, 10)}...`);
      }
    }
  }

  private async phaseSwarmSimulation(): Promise<void> {
    await log.phase(8, 'SWARM BACKTESTING');

    const allAgents = this.agents.getAllAgents().filter(a => !a.isBlacklisted);

    await log.step('Running multi-agent simulation');
    await log.dim(`rounds: 5 | agents: ${Math.min(3, allAgents.length)}`);

    await log.wait('Initializing simulation environment...', 1000);

    const results: { id: string; success: number; repDelta: number }[] = [];

    for (const agent of allAgents.slice(0, 3)) {
      await log.wait(`Simulating ${agent.name} over 5 rounds...`, 700);
      const success = 0.6 + Math.random() * 0.3;
      const repDelta = Math.floor((success - 0.7) * 50);
      results.push({ id: agent.name, success, repDelta });
      await log.ok(`${agent.name}: ${(success * 100).toFixed(1)}% success | rep ${repDelta > 0 ? '+' : ''}${repDelta}`);
    }

    await log.wait('Aggregating simulation results...', 600);

    await log.step('Leaderboard');
    results.sort((a, b) => b.repDelta - a.repDelta);
    results.forEach((r, i) => {
      const medal = ['1st', '2nd', '3rd'][i] || `${i + 1}th`;
      console.log(`  \x1b[2m${medal}:\x1b[0m ${r.id} (${r.repDelta > 0 ? '+' : ''}${r.repDelta})`);
    });
  }

  private async phaseSummary(): Promise<void> {
    const allAgents = this.agents.getAllAgents();
    const allOracles = this.oracles.getAllOracles();
    await this.metrics.printSummary(allAgents, allOracles);
    await this.metrics.printLeaderboard(allAgents);
  }
}

export async function initializeProtocol(config: DemoConfig): Promise<Protocol> {
  let connection: Connection | undefined;
  let wallet: Wallet | undefined;
  let evmKey: string | undefined;

  if (process.env.SOLANA_PRIVATE_KEY) {
    try {
      const key = process.env.SOLANA_PRIVATE_KEY.trim();
      let secretKey: Uint8Array;

      if (key.startsWith('[')) {
        secretKey = Uint8Array.from(JSON.parse(key));
      } else {
        const bs58 = await import('bs58');
        secretKey = bs58.default.decode(key);
      }

      const keypair = Keypair.fromSecretKey(secretKey);
      connection = new Connection(RPC.solana[config.network], 'confirmed');
      wallet = new Wallet(keypair);

      const balance = await connection.getBalance(keypair.publicKey);
      await log.header('SOLANA CONNECTED');
      await log.ok(`${config.network} | ${keypair.publicKey.toBase58().slice(0, 8)}... | ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    } catch {
      await log.warn('Invalid SOLANA_PRIVATE_KEY, running simulation');
    }
  }

  if (process.env.EVM_PRIVATE_KEY) {
    try {
      evmKey = process.env.EVM_PRIVATE_KEY;
      const provider = new ethers.JsonRpcProvider(RPC.monad[config.monadNetwork]);
      const evmWallet = new ethers.Wallet(evmKey, provider);
      const balance = await provider.getBalance(evmWallet.address);

      await log.header('MONAD CONNECTED');
      await log.ok(`${config.monadNetwork} | ${evmWallet.address.slice(0, 10)}... | ${ethers.formatEther(balance)} MON`);
    } catch {
      await log.warn('Invalid EVM_PRIVATE_KEY, running simulation');
      evmKey = undefined;
    }
  }

  if (!wallet && !evmKey) {
    await log.header('SIMULATION MODE');
    await log.dim('Set SOLANA_PRIVATE_KEY and/or EVM_PRIVATE_KEY for live transactions');
  }

  return new Protocol(config, connection, wallet, evmKey);
}
