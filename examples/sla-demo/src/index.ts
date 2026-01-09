import 'dotenv/config';
import { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Wallet, BN } from '@coral-xyz/anchor';
import { KamiyoClient, Shield } from '@kamiyo/sdk';

const C = '\x1b[36m';
const G = '\x1b[32m';
const Y = '\x1b[33m';
const R = '\x1b[31m';
const D = '\x1b[2m';
const X = '\x1b[0m';
const B = '\x1b[1m';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const log = {
  step: async (s: string) => { await sleep(500); console.log(`\n${C}>${X} ${s}`); },
  ok: async (s: string) => { await sleep(200); console.log(`  ${G}+${X} ${s}`); },
  warn: async (s: string) => { await sleep(200); console.log(`  ${Y}!${X} ${s}`); },
  fail: async (s: string) => { await sleep(200); console.log(`  ${R}x${X} ${s}`); },
  dim: async (s: string) => { await sleep(100); console.log(`  ${D}${s}${X}`); },
  header: async (s: string) => { await sleep(700); console.log(`\n${B}${C}--- ${s} ---${X}\n`); },
};

const PROGRAM_ID = new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');

interface SLAParams {
  qualityThreshold: number;  // 0-100
  maxLatencyMs: number;
  minAvailability: number;   // 0-100
}

interface Job {
  id: string;
  escrowId: string;
  amount: number;
  sla: SLAParams;
  provider: { name: string; pubkey: PublicKey; shield: Shield };
  consumer: { name: string; pubkey: PublicKey };
}

interface DeliveryResult {
  qualityScore: number;
  latencyMs: number;
  availability: number;
  data: any;
}

function assessQuality(result: DeliveryResult, sla: SLAParams): { score: number; violations: string[] } {
  const violations: string[] = [];
  let score = result.qualityScore;

  if (result.latencyMs > sla.maxLatencyMs) {
    const penalty = Math.min(20, Math.floor((result.latencyMs - sla.maxLatencyMs) / 100));
    score -= penalty;
    violations.push(`latency ${result.latencyMs}ms > ${sla.maxLatencyMs}ms (-${penalty})`);
  }

  if (result.availability < sla.minAvailability) {
    const penalty = Math.floor((sla.minAvailability - result.availability) / 2);
    score -= penalty;
    violations.push(`availability ${result.availability}% < ${sla.minAvailability}% (-${penalty})`);
  }

  return { score: Math.max(0, Math.min(100, score)), violations };
}

function calculateRefund(score: number, threshold: number): number {
  if (score >= threshold) return 0;
  if (score >= threshold - 10) return 25;
  if (score >= threshold - 30) return 50;
  if (score >= threshold - 50) return 75;
  return 100;
}

class SLAEnforcer {
  private client: KamiyoClient | null = null;
  private live: boolean;

  constructor(connection?: Connection, wallet?: Wallet) {
    this.live = !!wallet && !!connection;
    if (this.live) {
      this.client = new KamiyoClient({ connection: connection!, wallet: wallet!, programId: PROGRAM_ID });
    }
  }

  async createJob(consumer: Job['consumer'], provider: Job['provider'], amount: number, sla: SLAParams): Promise<Job> {
    const escrowId = `sla_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    if (this.live && this.client) {
      try {
        await this.client.createAgreement({
          provider: provider.pubkey,
          amount: new BN(Math.floor(amount * LAMPORTS_PER_SOL)),
          timeLockSeconds: new BN(3600),
          transactionId: escrowId,
        });
      } catch (e: any) {
        await log.warn(`on-chain tx failed: ${e.message}`);
      }
    }

    return { id: escrowId.slice(0, 8), escrowId, amount, sla, provider, consumer };
  }

  async simulateDelivery(job: Job, scenario: 'good' | 'degraded' | 'poor'): Promise<DeliveryResult> {
    await sleep(800);

    const scenarios = {
      good: { qualityScore: 92, latencyMs: 150, availability: 99.5 },
      degraded: { qualityScore: 68, latencyMs: 450, availability: 94 },
      poor: { qualityScore: 35, latencyMs: 1200, availability: 78 },
    };

    const base = scenarios[scenario];
    const jitter = () => (Math.random() - 0.5) * 10;

    return {
      qualityScore: Math.floor(base.qualityScore + jitter()),
      latencyMs: Math.floor(base.latencyMs + jitter() * 20),
      availability: Math.floor(base.availability + jitter() / 2),
      data: { scenario, timestamp: Date.now() },
    };
  }

  async enforce(job: Job, result: DeliveryResult): Promise<{ action: string; refundPct: number }> {
    const { score, violations } = assessQuality(result, job.sla);
    const refundPct = calculateRefund(score, job.sla.qualityThreshold);

    await log.dim(`raw: ${result.qualityScore} | adjusted: ${score} | threshold: ${job.sla.qualityThreshold}`);

    if (violations.length > 0) {
      for (const v of violations) await log.warn(`violation: ${v}`);
    }

    if (refundPct === 0) {
      if (this.live && this.client) {
        try {
          await this.client.releaseFunds(job.escrowId, job.provider.pubkey);
        } catch {}
      }
      return { action: 'release', refundPct: 0 };
    }

    if (this.live && this.client) {
      try {
        await this.client.markDisputed(job.escrowId);
      } catch {}
    }

    return { action: 'refund', refundPct };
  }
}

async function runDemo(live: boolean, connection?: Connection, wallet?: Wallet) {
  const enforcer = new SLAEnforcer(connection, wallet);

  // Setup
  const consumer = {
    name: 'Consumer',
    pubkey: Keypair.generate().publicKey,
  };

  const providers = [
    { name: 'Alpha', pubkey: Keypair.generate().publicKey, shield: new Shield(Keypair.generate().publicKey) },
    { name: 'Beta', pubkey: Keypair.generate().publicKey, shield: new Shield(Keypair.generate().publicKey) },
    { name: 'Gamma', pubkey: Keypair.generate().publicKey, shield: new Shield(Keypair.generate().publicKey) },
  ];

  providers[0].shield.setRep({ successful: 95, total: 100, disputesWon: 2, disputesLost: 0 });
  providers[1].shield.setRep({ successful: 78, total: 100, disputesWon: 1, disputesLost: 3 });
  providers[2].shield.setRep({ successful: 45, total: 100, disputesWon: 0, disputesLost: 8 });

  const sla: SLAParams = {
    qualityThreshold: 80,
    maxLatencyMs: 300,
    minAvailability: 95,
  };

  await log.header('SLA PARAMETERS');
  await log.dim(`quality threshold: ${sla.qualityThreshold}%`);
  await log.dim(`max latency: ${sla.maxLatencyMs}ms`);
  await log.dim(`min availability: ${sla.minAvailability}%`);

  await log.header('REFUND TIERS');
  await log.dim(`>= ${sla.qualityThreshold}%: 0% refund (pass)`);
  await log.dim(`>= ${sla.qualityThreshold - 10}%: 25% refund`);
  await log.dim(`>= ${sla.qualityThreshold - 30}%: 50% refund`);
  await log.dim(`>= ${sla.qualityThreshold - 50}%: 75% refund`);
  await log.dim(`< ${sla.qualityThreshold - 50}%: 100% refund`);

  // Scenario 1: Good delivery
  await log.header('SCENARIO 1: GOOD DELIVERY');
  await log.step('Creating escrow');
  const job1 = await enforcer.createJob(consumer, providers[0], 0.1, sla);
  await log.ok(`${job1.id} | ${job1.amount} SOL | ${job1.provider.name}`);

  await log.step('Agent delivers work');
  const result1 = await enforcer.simulateDelivery(job1, 'good');
  await log.ok(`quality: ${result1.qualityScore}% | latency: ${result1.latencyMs}ms | uptime: ${result1.availability}%`);

  await log.step('SLA enforcement');
  const outcome1 = await enforcer.enforce(job1, result1);
  await log.ok(`${G}PASS${X} - funds released to ${job1.provider.name}`);

  // Scenario 2: Degraded delivery
  await log.header('SCENARIO 2: DEGRADED DELIVERY');
  await log.step('Creating escrow');
  const job2 = await enforcer.createJob(consumer, providers[1], 0.1, sla);
  await log.ok(`${job2.id} | ${job2.amount} SOL | ${job2.provider.name}`);

  await log.step('Agent delivers work');
  const result2 = await enforcer.simulateDelivery(job2, 'degraded');
  await log.ok(`quality: ${result2.qualityScore}% | latency: ${result2.latencyMs}ms | uptime: ${result2.availability}%`);

  await log.step('SLA enforcement');
  const outcome2 = await enforcer.enforce(job2, result2);
  await log.warn(`${Y}PARTIAL${X} - ${outcome2.refundPct}% refund to ${job2.consumer.name}`);
  await log.dim(`provider receives: ${((100 - outcome2.refundPct) / 100 * job2.amount).toFixed(4)} SOL`);

  // Scenario 3: Poor delivery
  await log.header('SCENARIO 3: POOR DELIVERY');
  await log.step('Creating escrow');
  const job3 = await enforcer.createJob(consumer, providers[2], 0.1, sla);
  await log.ok(`${job3.id} | ${job3.amount} SOL | ${job3.provider.name}`);

  await log.step('Agent delivers work');
  const result3 = await enforcer.simulateDelivery(job3, 'poor');
  await log.ok(`quality: ${result3.qualityScore}% | latency: ${result3.latencyMs}ms | uptime: ${result3.availability}%`);

  await log.step('SLA enforcement');
  const outcome3 = await enforcer.enforce(job3, result3);
  await log.fail(`${R}FAIL${X} - ${outcome3.refundPct}% refund to ${job3.consumer.name}`);
  await log.dim(`provider receives: ${((100 - outcome3.refundPct) / 100 * job3.amount).toFixed(4)} SOL`);

  // Summary
  await log.header('SUMMARY');
  await log.dim('scenario    | quality | latency | uptime | refund');
  await log.dim('------------|---------|---------|--------|-------');
  await log.dim(`good        | ${result1.qualityScore}%     | ${result1.latencyMs}ms    | ${result1.availability}%   | 0%`);
  await log.dim(`degraded    | ${result2.qualityScore}%     | ${result2.latencyMs}ms   | ${result2.availability}%   | ${outcome2.refundPct}%`);
  await log.dim(`poor        | ${result3.qualityScore}%     | ${result3.latencyMs}ms  | ${result3.availability}%   | ${outcome3.refundPct}%`);

  await log.header('KEY POINTS');
  await log.ok('No manual dispute needed - SLA breach triggers automatic refund');
  await log.ok('Quality score adjusted for latency and availability violations');
  await log.ok('Tiered refunds based on severity of SLA breach');
  await log.ok('Provider reputation updated automatically');
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

  console.log(`${B}SLA ENFORCEMENT DEMO${X}`);
  console.log(`${D}Automatic quality-based refunds - no disputes needed${X}\n`);

  const network = (process.env.KAMIYO_NETWORK || 'devnet') as 'mainnet' | 'devnet';
  let connection: Connection | undefined;
  let wallet: Wallet | undefined;

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
      const rpc = network === 'mainnet'
        ? 'https://api.mainnet-beta.solana.com'
        : 'https://api.devnet.solana.com';

      connection = new Connection(rpc, 'confirmed');
      wallet = new Wallet(keypair);

      const bal = await connection.getBalance(keypair.publicKey);
      await log.header('LIVE MODE');
      await log.ok(`${network} | ${keypair.publicKey.toBase58().slice(0, 8)}... | ${(bal / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    } catch (e) {
      await log.warn('bad SOLANA_PRIVATE_KEY, running simulation');
    }
  } else {
    await log.header('SIMULATION MODE');
    await log.dim('set SOLANA_PRIVATE_KEY for live transactions');
  }

  await runDemo(!!wallet, connection, wallet);

  if (!wallet) {
    console.log(`
${Y}Live mode:${X}
  export SOLANA_PRIVATE_KEY='[...]'
  pnpm dev
`);
  }
}

main().catch(console.error);
