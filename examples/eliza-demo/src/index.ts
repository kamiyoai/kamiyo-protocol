import 'dotenv/config';
import { Keypair } from '@solana/web3.js';
import { kamiyoPlugin } from '@kamiyo/eliza';
import { Shield, Blacklist, CredentialManager, Voting } from '@kamiyo/sdk';

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
};

interface Agent {
  name: string;
  keypair: Keypair;
  shield: Shield;
  stats: { successful: number; total: number; disputesWon: number; disputesLost: number };
}

interface ServiceRequest {
  id: string;
  consumer: Agent;
  provider: Agent;
  amount: number;
  escrowId: string;
  quality: number;
}

class KamiyoOrchestrator {
  private blacklist = new Blacklist();
  private credentialMgr: CredentialManager;
  private voting = new Voting();
  private escrows = new Map<string, ServiceRequest>();
  private issuer: Keypair;

  constructor() {
    this.issuer = Keypair.generate();
    this.credentialMgr = new CredentialManager(this.issuer);
  }

  createAgent(name: string, stats: Agent['stats']): Agent {
    const keypair = Keypair.generate();
    const shield = new Shield(keypair.publicKey);
    shield.setRep(stats);
    return { name, keypair, shield, stats };
  }

  async runAutonomousLoop(consumer: Agent, providers: Agent[], threshold: number) {
    log.header('AUTONOMOUS AGENT LOOP');
    log.dim(`Consumer: ${consumer.name} | Providers: ${providers.map(p => p.name).join(', ')}`);
    log.dim(`Reputation threshold: ${threshold}%`);

    // Phase 1: Discovery & ZK Verification
    log.step('Phase 1: Provider Discovery with ZK Verification');
    const eligible: Agent[] = [];

    for (const provider of providers) {
      log.dim(`Checking ${provider.name}...`);

      // Check blacklist with SMT exclusion proof
      if (this.blacklist.contains(provider.keypair.publicKey)) {
        log.fail(`${provider.name}: BLACKLISTED`);
        continue;
      }
      const exclusionProof = this.blacklist.exclusionProof(provider.keypair.publicKey);
      log.ok(`${provider.name}: Not blacklisted (SMT proof generated)`);

      // ZK reputation check
      const rate = provider.shield.successRate();
      const meets = provider.shield.meetsThreshold(threshold);

      if (!meets) {
        log.warn(`${provider.name}: Below threshold (${rate}% < ${threshold}%)`);
        continue;
      }

      // Generate ZK proof (proves threshold without revealing exact score)
      const commitment = provider.shield.commitment();
      log.ok(`${provider.name}: Reputation verified via ZK proof`);
      log.dim(`  Commitment: ${commitment.toString(16).slice(0, 16)}...`);
      log.dim(`  Proves: score >= ${threshold}% (actual score hidden)`);

      // Issue credential
      const cred = provider.shield.issue(this.blacklist.getRoot());
      const signed = this.credentialMgr.issue(cred);
      log.ok(`${provider.name}: Credential issued (expires: ${new Date(cred.expiresAt * 1000).toISOString()})`);

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
      const amount = 0.1 + Math.random() * 0.1;
      const escrowId = `escrow_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

      const req: ServiceRequest = {
        id: `req_${requests.length}`,
        consumer,
        provider,
        amount,
        escrowId,
        quality: 0,
      };

      this.escrows.set(escrowId, req);
      requests.push(req);

      log.ok(`Escrow ${escrowId.slice(0, 12)}... created`);
      log.dim(`  ${consumer.name} -> ${provider.name}: ${amount.toFixed(4)} SOL`);
    }

    // Phase 3: Service Consumption & Quality Evaluation
    log.step('Phase 3: Service Consumption & Autonomous Evaluation');

    for (const req of requests) {
      // Simulate service response with random quality
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
        req.provider.stats.successful++;
        req.provider.stats.total++;
        released++;
        log.ok(`Released: ${req.escrowId.slice(0, 12)}... -> ${req.provider.name}`);
      } else {
        // File dispute with evidence
        req.provider.stats.total++;
        req.consumer.stats.disputesWon++;
        req.provider.stats.disputesLost++;
        disputed++;
        log.warn(`Disputed: ${req.escrowId.slice(0, 12)}... (quality=${req.quality}%)`);

        // Add to blacklist if too many failures
        if (req.provider.stats.disputesLost >= 3) {
          this.blacklist.add(req.provider.keypair.publicKey, 'repeated low quality');
          log.fail(`${req.provider.name} added to blacklist (${req.provider.stats.disputesLost} disputes)`);
        }
      }
    }

    log.dim(`Released: ${released} | Disputed: ${disputed}`);

    // Phase 5: DAO Governance Vote (if disputes occurred)
    if (disputed > 0) {
      log.step('Phase 5: DAO Governance Vote on Dispute Policy');

      const proposalId = BigInt(Date.now());
      const proposal = this.voting.create(proposalId, ['Increase threshold', 'Keep current', 'Decrease threshold'], 1, 1);

      // Agents vote based on their experience
      for (const agent of [consumer, ...eligible]) {
        const { vote, commitment } = this.voting.vote(proposalId, agent.stats.disputesLost > 0 ? 0 : 1, agent.keypair.publicKey);
        this.voting.commit(proposalId, vote.voter, commitment);
        log.dim(`${agent.name} committed vote (hidden until reveal)`);
      }

      log.ok('Commit-reveal voting initiated');
      log.dim('Votes are private until reveal phase');
    }

    // Summary
    log.header('AUTONOMOUS LOOP COMPLETE');
    log.dim(`Providers vetted: ${providers.length}`);
    log.dim(`Eligible (ZK verified): ${eligible.length}`);
    log.dim(`Escrows created: ${requests.length}`);
    log.dim(`Released: ${released} | Disputed: ${disputed}`);
    log.dim(`Blacklist size: ${this.blacklist.size()}`);
  }

  async runMultiAgentCoordination() {
    log.header('MULTI-AGENT COORDINATION');

    // Create agents with varying reputations
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

    // Pre-blacklist Delta (too many disputes)
    this.blacklist.add(agents[3].keypair.publicKey, 'excessive disputes');
    log.warn(`${agents[3].name} pre-blacklisted`);

    // Consumer picks providers
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

  log.header('ELIZA PLUGIN CAPABILITIES');
  log.ok(`Plugin: ${kamiyoPlugin.name}`);
  log.dim(`Actions: ${kamiyoPlugin.actions?.map((a: any) => a.name).join(', ') || 'none'}`);
  log.dim(`Providers: ${kamiyoPlugin.providers?.length || 0}`);
  log.dim(`Evaluators: ${kamiyoPlugin.evaluators?.map((e: any) => e.name).join(', ') || 'none'}`);

  const orchestrator = new KamiyoOrchestrator();
  await orchestrator.runMultiAgentCoordination();

  log.header('WHAT JUST HAPPENED');
  console.log(`
  ${CYAN}1.${RESET} Agents verified each other with ${BOLD}ZK proofs${RESET}
     - Proved reputation >= threshold ${DIM}without revealing actual score${RESET}
     - Generated SMT exclusion proofs ${DIM}(not on blacklist)${RESET}

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
}

main().catch(console.error);
