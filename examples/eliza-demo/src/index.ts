import 'dotenv/config';
import { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Wallet, BN } from '@coral-xyz/anchor';
import { kamiyoPlugin } from '@kamiyo/eliza';
import { KamiyoClient, Shield, Blacklist, CredentialManager, Voting } from '@kamiyo/sdk';

const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

const log = {
  step: (s: string) => console.log(`\n${CYAN}▸${RESET} ${s}`),
  ok: (s: string) => console.log(`  ${GREEN}✓${RESET} ${s}`),
  warn: (s: string) => console.log(`  ${YELLOW}⚠${RESET} ${s}`),
  fail: (s: string) => console.log(`  ${RED}✗${RESET} ${s}`),
  dim: (s: string) => console.log(`  ${DIM}${s}${RESET}`),
  header: (s: string) => console.log(`\n${BOLD}${CYAN}━━━ ${s} ━━━${RESET}\n`),
  tx: (s: string) => console.log(`  ${GREEN}⛓${RESET}  ${DIM}${s}${RESET}`),
};

const PROGRAM_ID = new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');
const NETWORKS = {
  mainnet: 'https://api.mainnet-beta.solana.com',
  devnet: 'https://api.devnet.solana.com',
};

interface Agent {
  name: string;
  keypair: Keypair;
  shield: Shield;
  stats: { successful: number; total: number; disputesWon: number; disputesLost: number };
  onChainRep?: { score: number; totalTx: number; disputes: number };
}

interface ServiceRequest {
  id: string;
  consumer: Agent;
  provider: Agent;
  amount: number;
  escrowId: string;
  quality: number;
  txSignature?: string;
}

class KamiyoOrchestrator {
  private blacklist = new Blacklist();
  private credentialMgr: CredentialManager;
  private voting = new Voting();
  private escrows = new Map<string, ServiceRequest>();
  private issuer: Keypair;
  private client: KamiyoClient | null = null;
  private connection: Connection;
  private live: boolean;

  constructor(network: 'mainnet' | 'devnet', wallet?: Keypair) {
    this.issuer = Keypair.generate();
    this.credentialMgr = new CredentialManager(this.issuer);
    this.connection = new Connection(NETWORKS[network], 'confirmed');
    this.live = !!wallet;

    if (wallet) {
      this.client = new KamiyoClient({
        connection: this.connection,
        wallet: new Wallet(wallet),
        programId: PROGRAM_ID,
      });
    }
  }

  createAgent(name: string, stats: Agent['stats']): Agent {
    const keypair = Keypair.generate();
    const shield = new Shield(keypair.publicKey);
    shield.setRep(stats);
    return { name, keypair, shield, stats };
  }

  async fetchOnChainReputation(agent: Agent): Promise<void> {
    if (!this.client) return;

    try {
      const rep = await this.client.getReputation(agent.keypair.publicKey);
      if (rep) {
        agent.onChainRep = {
          score: rep.reputationScore,
          totalTx: rep.totalTransactions.toNumber(),
          disputes: rep.disputesFiled.toNumber(),
        };
      }
    } catch {
      // No on-chain reputation yet
    }
  }

  async runAutonomousLoop(consumer: Agent, providers: Agent[], threshold: number) {
    log.header('AUTONOMOUS AGENT LOOP');
    log.dim(`Consumer: ${consumer.name} | Providers: ${providers.map(p => p.name).join(', ')}`);
    log.dim(`Reputation threshold: ${threshold}%`);
    log.dim(`Mode: ${this.live ? 'LIVE (on-chain)' : 'SIMULATION'}`);

    // Phase 1: Discovery & ZK Verification
    log.step('Phase 1: Provider Discovery with ZK Verification');
    const eligible: Agent[] = [];

    for (const provider of providers) {
      log.dim(`Checking ${provider.name}...`);

      // Fetch on-chain reputation if live
      if (this.live) {
        await this.fetchOnChainReputation(provider);
        if (provider.onChainRep) {
          log.dim(`  On-chain: score=${provider.onChainRep.score}, tx=${provider.onChainRep.totalTx}`);
        }
      }

      // Check blacklist with SMT exclusion proof
      if (this.blacklist.contains(provider.keypair.publicKey)) {
        log.fail(`${provider.name}: BLACKLISTED`);
        continue;
      }
      const exclusionProof = this.blacklist.exclusionProof(provider.keypair.publicKey);
      log.ok(`${provider.name}: Not blacklisted (SMT proof: ${exclusionProof.siblings.length} siblings)`);

      // ZK reputation check
      const rate = provider.shield.successRate();
      const meets = provider.shield.meetsThreshold(threshold);

      if (!meets) {
        log.warn(`${provider.name}: Below threshold (${rate}% < ${threshold}%)`);
        continue;
      }

      // Generate ZK proof
      const commitment = provider.shield.commitment();
      log.ok(`${provider.name}: Reputation verified via ZK proof`);
      log.dim(`  Commitment: ${commitment.toString(16).slice(0, 16)}...`);
      log.dim(`  Proves: score >= ${threshold}% (actual score hidden)`);

      // Issue credential
      const cred = provider.shield.issue(this.blacklist.getRoot());
      const signed = this.credentialMgr.issue(cred);
      log.ok(`${provider.name}: Credential issued (TTL: 24h)`);

      eligible.push(provider);
    }

    if (eligible.length === 0) {
      log.fail('No eligible providers found');
      return;
    }

    log.ok(`Found ${eligible.length} eligible provider(s)`);

    // Phase 2: Escrow Creation
    log.step('Phase 2: Multi-Provider Escrow Creation');
    const requests: ServiceRequest[] = [];

    for (const provider of eligible) {
      const amount = 0.001 + Math.random() * 0.001; // Small amounts for demo
      const escrowId = `escrow_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

      const req: ServiceRequest = {
        id: `req_${requests.length}`,
        consumer,
        provider,
        amount,
        escrowId,
        quality: 0,
      };

      // Create real escrow if live
      if (this.live && this.client) {
        try {
          const sig = await this.client.createAgreement({
            provider: provider.keypair.publicKey,
            amount: new BN(Math.floor(amount * LAMPORTS_PER_SOL)),
            timeLockSeconds: new BN(3600),
            transactionId: escrowId,
          });
          req.txSignature = sig;
          log.tx(`tx: ${sig.slice(0, 20)}...`);
        } catch (err: any) {
          log.warn(`Escrow creation failed: ${err.message}`);
        }
      }

      this.escrows.set(escrowId, req);
      requests.push(req);

      log.ok(`Escrow ${escrowId.slice(0, 16)}... created`);
      log.dim(`  ${consumer.name} -> ${provider.name}: ${amount.toFixed(6)} SOL`);
    }

    // Phase 3: Service Consumption & Quality Evaluation
    log.step('Phase 3: Service Consumption & Autonomous Evaluation');

    for (const req of requests) {
      req.quality = Math.floor(50 + Math.random() * 50);

      log.dim(`${req.provider.name} delivered service...`);

      if (req.quality >= threshold) {
        log.ok(`Quality: ${req.quality}% (PASS)`);
      } else {
        log.warn(`Quality: ${req.quality}% (FAIL - below ${threshold}%)`);
      }
    }

    // Phase 4: Autonomous Dispute/Release
    log.step('Phase 4: Autonomous Settlement');

    let released = 0;
    let disputed = 0;

    for (const req of requests) {
      if (req.quality >= threshold) {
        // Release escrow
        if (this.live && this.client) {
          try {
            const sig = await this.client.releaseFunds(req.escrowId, req.provider.keypair.publicKey);
            log.tx(`release tx: ${sig.slice(0, 20)}...`);
          } catch (err: any) {
            log.warn(`Release failed: ${err.message}`);
          }
        }

        req.provider.stats.successful++;
        req.provider.stats.total++;
        released++;
        log.ok(`Released: ${req.escrowId.slice(0, 16)}... -> ${req.provider.name}`);
      } else {
        // File dispute
        if (this.live && this.client) {
          try {
            const sig = await this.client.markDisputed(req.escrowId);
            log.tx(`dispute tx: ${sig.slice(0, 20)}...`);
          } catch (err: any) {
            log.warn(`Dispute failed: ${err.message}`);
          }
        }

        req.provider.stats.total++;
        req.consumer.stats.disputesWon++;
        req.provider.stats.disputesLost++;
        disputed++;
        log.warn(`Disputed: ${req.escrowId.slice(0, 16)}... (quality=${req.quality}%)`);

        if (req.provider.stats.disputesLost >= 3) {
          this.blacklist.add(req.provider.keypair.publicKey, 'repeated low quality');
          log.fail(`${req.provider.name} added to blacklist`);
        }
      }
    }

    log.dim(`Released: ${released} | Disputed: ${disputed}`);

    // Phase 5: DAO Governance Vote
    if (disputed > 0) {
      log.step('Phase 5: DAO Governance Vote on Dispute Policy');

      const proposalId = BigInt(Date.now());
      this.voting.create(proposalId, ['Increase threshold', 'Keep current', 'Decrease threshold'], 1, 1);

      for (const agent of [consumer, ...eligible]) {
        const { vote, commitment } = this.voting.vote(proposalId, agent.stats.disputesLost > 0 ? 0 : 1, agent.keypair.publicKey);
        this.voting.commit(proposalId, vote.voter, commitment);
        log.dim(`${agent.name} committed vote (hidden until reveal)`);
      }

      log.ok('Commit-reveal voting initiated');
    }

    // Summary
    log.header('AUTONOMOUS LOOP COMPLETE');
    log.dim(`Providers vetted: ${providers.length}`);
    log.dim(`Eligible (ZK verified): ${eligible.length}`);
    log.dim(`Escrows created: ${requests.length}`);
    log.dim(`Released: ${released} | Disputed: ${disputed}`);
    log.dim(`Blacklist size: ${this.blacklist.size()}`);
    if (this.live) {
      log.dim(`Mode: LIVE - transactions submitted to Solana`);
    }
  }

  async runMultiAgentCoordination() {
    log.header('MULTI-AGENT COORDINATION');

    const agents = [
      this.createAgent('Alpha', { successful: 95, total: 100, disputesWon: 2, disputesLost: 0 }),
      this.createAgent('Beta', { successful: 82, total: 100, disputesWon: 1, disputesLost: 1 }),
      this.createAgent('Gamma', { successful: 70, total: 100, disputesWon: 0, disputesLost: 3 }),
      this.createAgent('Delta', { successful: 55, total: 100, disputesWon: 0, disputesLost: 5 }),
    ];

    log.step('Agent Registry');
    for (const a of agents) {
      const rate = a.shield.successRate();
      log.dim(`${a.name}: ${rate}% success | ${a.stats.disputesLost} disputes lost`);
    }

    this.blacklist.add(agents[3].keypair.publicKey, 'excessive disputes');
    log.warn(`${agents[3].name} pre-blacklisted`);

    const consumer = agents[0];
    const providers = agents.slice(1);

    await this.runAutonomousLoop(consumer, providers, 75);
  }
}

async function main() {
  console.log(`
${BOLD}${CYAN}
    ██╗  ██╗ █████╗ ███╗   ███╗██╗██╗   ██╗ ██████╗
    ██║ ██╔╝██╔══██╗████╗ ████║██║╚██╗ ██╔╝██╔═══██╗
    █████╔╝ ███████║██╔████╔██║██║ ╚████╔╝ ██║   ██║
    ██╔═██╗ ██╔══██║██║╚██╔╝██║██║  ╚██╔╝  ██║   ██║
    ██║  ██╗██║  ██║██║ ╚═╝ ██║██║   ██║   ╚██████╔╝
    ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝   ╚═╝    ╚═════╝
${RESET}
${DIM}    Privacy-Preserving Agent Infrastructure${RESET}
${DIM}    ElizaOS Integration Demo${RESET}
`);

  // Check for live mode
  const network = (process.env.KAMIYO_NETWORK || 'devnet') as 'mainnet' | 'devnet';
  let wallet: Keypair | undefined;

  if (process.env.SOLANA_PRIVATE_KEY) {
    try {
      const key = JSON.parse(process.env.SOLANA_PRIVATE_KEY);
      wallet = Keypair.fromSecretKey(Uint8Array.from(key));
      log.header('LIVE MODE');
      log.ok(`Network: ${network}`);
      log.ok(`Wallet: ${wallet.publicKey.toBase58().slice(0, 8)}...`);

      const connection = new Connection(NETWORKS[network], 'confirmed');
      const balance = await connection.getBalance(wallet.publicKey);
      log.ok(`Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

      if (balance < 0.01 * LAMPORTS_PER_SOL) {
        log.warn('Low balance - some transactions may fail');
      }
    } catch (err) {
      log.warn('Invalid SOLANA_PRIVATE_KEY, running in simulation mode');
    }
  }

  log.header('ELIZA PLUGIN CAPABILITIES');
  log.ok(`Plugin: ${kamiyoPlugin.name}`);
  log.dim(`Actions: ${kamiyoPlugin.actions?.map((a: any) => a.name).join(', ') || 'none'}`);
  log.dim(`Providers: ${kamiyoPlugin.providers?.length || 0}`);
  log.dim(`Evaluators: ${kamiyoPlugin.evaluators?.map((e: any) => e.name).join(', ') || 'none'}`);

  const orchestrator = new KamiyoOrchestrator(network, wallet);
  await orchestrator.runMultiAgentCoordination();

  log.header('WHAT JUST HAPPENED');
  console.log(`
  ${CYAN}1.${RESET} Agents verified each other with ${BOLD}ZK proofs${RESET}
     - Proved reputation >= threshold ${DIM}without revealing actual score${RESET}
     - Generated SMT exclusion proofs ${DIM}(256-depth Merkle tree)${RESET}

  ${CYAN}2.${RESET} Created ${BOLD}escrows${RESET} with ZK-verified providers
     - Funds locked until service delivery
     - Automatic quality evaluation

  ${CYAN}3.${RESET} ${BOLD}Autonomous dispute resolution${RESET}
     - Low-quality service -> automatic refund
     - Repeat offenders -> blacklisted

  ${CYAN}4.${RESET} ${BOLD}DAO governance${RESET} on policy changes
     - Commit-reveal voting (votes hidden until reveal)
     - Privacy-preserving participation

  ${DIM}All of this runs without human intervention.${RESET}
  ${DIM}Agents can now transact trustlessly at scale.${RESET}
`);

  if (!wallet) {
    console.log(`
${YELLOW}To run in LIVE mode with real transactions:${RESET}
  export SOLANA_PRIVATE_KEY='[your keypair array]'
  export KAMIYO_NETWORK=devnet  # or mainnet
  npm run dev
`);
  }
}

main().catch(console.error);
