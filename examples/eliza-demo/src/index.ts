import 'dotenv/config';
import { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Wallet, BN } from '@coral-xyz/anchor';
import { kamiyoPlugin } from '@kamiyo/eliza';
import { KamiyoClient, Shield, Blacklist, CredentialManager, Voting } from '@kamiyo/sdk';

const C = '\x1b[36m';
const G = '\x1b[32m';
const Y = '\x1b[33m';
const R = '\x1b[31m';
const D = '\x1b[2m';
const X = '\x1b[0m';
const B = '\x1b[1m';

const log = {
  step: (s: string) => console.log(`\n${C}>${X} ${s}`),
  ok: (s: string) => console.log(`  ${G}+${X} ${s}`),
  warn: (s: string) => console.log(`  ${Y}!${X} ${s}`),
  fail: (s: string) => console.log(`  ${R}x${X} ${s}`),
  dim: (s: string) => console.log(`  ${D}${s}${X}`),
  header: (s: string) => console.log(`\n${B}${C}--- ${s} ---${X}\n`),
};

const PROGRAM_ID = new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');
const RPC = {
  mainnet: 'https://api.mainnet-beta.solana.com',
  devnet: 'https://api.devnet.solana.com',
};

interface Agent {
  name: string;
  keypair: Keypair;
  shield: Shield;
  stats: { successful: number; total: number; disputesWon: number; disputesLost: number };
}

interface Request {
  consumer: Agent;
  provider: Agent;
  amount: number;
  escrowId: string;
  quality: number;
}

class Orchestrator {
  private blacklist = new Blacklist();
  private creds: CredentialManager;
  private voting = new Voting();
  private client: KamiyoClient | null = null;
  private live: boolean;

  constructor(network: 'mainnet' | 'devnet', wallet?: Keypair) {
    this.creds = new CredentialManager(Keypair.generate());
    this.live = !!wallet;

    if (wallet) {
      this.client = new KamiyoClient({
        connection: new Connection(RPC[network], 'confirmed'),
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

  async run(consumer: Agent, providers: Agent[], threshold: number) {
    log.header('AUTONOMOUS AGENT LOOP');
    log.dim(`${consumer.name} -> [${providers.map(p => p.name).join(', ')}]`);
    log.dim(`Threshold: ${threshold}% | Mode: ${this.live ? 'LIVE' : 'SIM'}`);

    // 1. ZK verification
    log.step('Provider verification');
    const eligible: Agent[] = [];

    for (const p of providers) {
      if (this.blacklist.contains(p.keypair.publicKey)) {
        log.fail(`${p.name}: blacklisted`);
        continue;
      }

      const proof = this.blacklist.exclusionProof(p.keypair.publicKey);
      log.ok(`${p.name}: not blacklisted (${proof.siblings.length} siblings)`);

      const rate = p.shield.successRate();
      if (!p.shield.meetsThreshold(threshold)) {
        log.warn(`${p.name}: ${rate}% < ${threshold}%`);
        continue;
      }

      const commitment = p.shield.commitment();
      log.ok(`${p.name}: ZK verified >= ${threshold}%`);
      log.dim(`  commit: ${commitment.toString(16).slice(0, 16)}...`);

      const cred = p.shield.issue(this.blacklist.getRoot());
      this.creds.issue(cred);
      eligible.push(p);
    }

    if (!eligible.length) {
      log.fail('No eligible providers');
      return;
    }

    // 2. Escrow
    log.step('Escrow creation');
    const requests: Request[] = [];

    for (const provider of eligible) {
      const amount = 0.001 + Math.random() * 0.001;
      const escrowId = `esc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

      if (this.live && this.client) {
        try {
          await this.client.createAgreement({
            provider: provider.keypair.publicKey,
            amount: new BN(Math.floor(amount * LAMPORTS_PER_SOL)),
            timeLockSeconds: new BN(3600),
            transactionId: escrowId,
          });
        } catch (e: any) {
          log.warn(`tx failed: ${e.message}`);
        }
      }

      requests.push({ consumer, provider, amount, escrowId, quality: 0 });
      log.ok(`${escrowId.slice(0, 12)}... | ${amount.toFixed(6)} SOL`);
    }

    // 3. Quality check
    log.step('Quality evaluation');
    for (const req of requests) {
      req.quality = Math.floor(50 + Math.random() * 50);
      const pass = req.quality >= threshold;
      (pass ? log.ok : log.warn)(`${req.provider.name}: ${req.quality}% ${pass ? 'PASS' : 'FAIL'}`);
    }

    // 4. Settlement
    log.step('Settlement');
    let released = 0, disputed = 0;

    for (const req of requests) {
      if (req.quality >= threshold) {
        if (this.live && this.client) {
          try {
            await this.client.releaseFunds(req.escrowId, req.provider.keypair.publicKey);
          } catch {}
        }
        req.provider.stats.successful++;
        req.provider.stats.total++;
        released++;
        log.ok(`released -> ${req.provider.name}`);
      } else {
        if (this.live && this.client) {
          try {
            await this.client.markDisputed(req.escrowId);
          } catch {}
        }
        req.provider.stats.total++;
        req.provider.stats.disputesLost++;
        disputed++;
        log.warn(`disputed: ${req.escrowId.slice(0, 12)}...`);

        if (req.provider.stats.disputesLost >= 3) {
          this.blacklist.add(req.provider.keypair.publicKey, 'low quality');
          log.fail(`${req.provider.name} blacklisted`);
        }
      }
    }

    log.dim(`released: ${released} | disputed: ${disputed}`);

    // 5. DAO vote (if disputes)
    if (disputed > 0) {
      log.step('DAO vote');
      const proposalId = BigInt(Date.now());
      this.voting.create(proposalId, ['raise threshold', 'keep', 'lower'], 1, 1);

      for (const agent of [consumer, ...eligible]) {
        const choice = agent.stats.disputesLost > 0 ? 0 : 1;
        const { vote, commitment } = this.voting.vote(proposalId, choice, agent.keypair.publicKey);
        this.voting.commit(proposalId, vote.voter, commitment);
        log.dim(`${agent.name} voted (hidden)`);
      }
      log.ok('commit-reveal initiated');
    }

    log.header('DONE');
    log.dim(`vetted: ${providers.length} | eligible: ${eligible.length} | escrows: ${requests.length}`);
  }

  async demo() {
    log.header('MULTI-AGENT DEMO');

    const agents = [
      this.createAgent('Alpha', { successful: 95, total: 100, disputesWon: 2, disputesLost: 0 }),
      this.createAgent('Beta', { successful: 82, total: 100, disputesWon: 1, disputesLost: 1 }),
      this.createAgent('Gamma', { successful: 70, total: 100, disputesWon: 0, disputesLost: 3 }),
      this.createAgent('Delta', { successful: 55, total: 100, disputesWon: 0, disputesLost: 5 }),
    ];

    log.step('Agents');
    for (const a of agents) {
      log.dim(`${a.name}: ${a.shield.successRate()}% | ${a.stats.disputesLost} disputes`);
    }

    this.blacklist.add(agents[3].keypair.publicKey, 'too many disputes');
    log.warn('Delta pre-blacklisted');

    await this.run(agents[0], agents.slice(1), 75);
  }
}

async function main() {
  console.log(`${B}${C}
    ██╗  ██╗ █████╗ ███╗   ███╗██╗██╗   ██╗ ██████╗
    ██║ ██╔╝██╔══██╗████╗ ████║██║╚██╗ ██╔╝██╔═══██╗
    █████╔╝ ███████║██╔████╔██║██║ ╚████╔╝ ██║   ██║
    ██╔═██╗ ██╔══██║██║╚██╔╝██║██║  ╚██╔╝  ██║   ██║
    ██║  ██╗██║  ██║██║ ╚═╝ ██║██║   ██║   ╚██████╔╝
    ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝   ╚═╝    ╚═════╝
${X}`);

  const network = (process.env.KAMIYO_NETWORK || 'devnet') as 'mainnet' | 'devnet';
  let wallet: Keypair | undefined;

  if (process.env.SOLANA_PRIVATE_KEY) {
    try {
      wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.SOLANA_PRIVATE_KEY)));
      const conn = new Connection(RPC[network], 'confirmed');
      const bal = await conn.getBalance(wallet.publicKey);
      log.header('LIVE MODE');
      log.ok(`${network} | ${wallet.publicKey.toBase58().slice(0, 8)}... | ${(bal / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    } catch {
      log.warn('bad SOLANA_PRIVATE_KEY, running sim');
    }
  }

  log.header('ELIZA PLUGIN');
  log.ok(kamiyoPlugin.name);
  log.dim(`actions: ${kamiyoPlugin.actions?.map((a: any) => a.name).join(', ')}`);

  const orch = new Orchestrator(network, wallet);
  await orch.demo();

  if (!wallet) {
    console.log(`
${Y}Live mode:${X}
  export SOLANA_PRIVATE_KEY='[...]'
  pnpm dev
`);
  }
}

main().catch(console.error);
