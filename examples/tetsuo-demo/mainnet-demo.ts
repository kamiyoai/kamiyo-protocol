import 'dotenv/config';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import * as snarkjs from 'snarkjs';
import { buildPoseidon } from 'circomlibjs';
import chalk from 'chalk';
import bs58 from 'bs58';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const c = {
  h: chalk.hex('#00FFFF'),    // cyan
  m: chalk.hex('#FF00FF'),    // magenta
  p: chalk.hex('#AA00FF'),    // purple
  v: chalk.hex('#00FF88'),    // neon green
  d: chalk.hex('#666688'),    // dim purple
  y: chalk.hex('#FFFF00'),    // yellow
  w: chalk.white,
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CIRCUIT_DIR = path.join(__dirname, '../../packages/kamiyo-tetsuo-privacy/circuits/build');

const RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const KAMIYO_PROGRAM_ID = new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');

// BN254 curve order
const R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

function loadWallet(): Wallet {
  const key = process.env.SOLANA_PRIVATE_KEY;
  if (!key) { console.error('SOLANA_PRIVATE_KEY not set'); process.exit(1); }

  let secretKey: Uint8Array;
  if (key.startsWith('[')) {
    secretKey = new Uint8Array(JSON.parse(key));
  } else if (key.length === 88 || key.length === 87) {
    secretKey = bs58.decode(key);
  } else {
    try {
      const decoded = Buffer.from(key, 'base64');
      secretKey = decoded.length === 64 ? decoded : new Uint8Array(JSON.parse(fs.readFileSync(key, 'utf-8')));
    } catch {
      secretKey = new Uint8Array(JSON.parse(fs.readFileSync(key, 'utf-8')));
    }
  }
  return new Wallet(Keypair.fromSecretKey(secretKey));
}

function hex(n: bigint, bytes = 32): string {
  return n.toString(16).padStart(bytes * 2, '0');
}

function truncHex(s: string, len = 16): string {
  return s.length > len * 2 ? s.slice(0, len) + '...' + s.slice(-8) : s;
}

async function main() {
  console.log(`
  ${c.m('╔═══════════════════════════════════════════════════════════════════════════╗')}
  ${c.m('║')}  ${c.h('KAMIYO')} ${c.m('×')} ${c.p('TETSUO')}    ${c.w('Zero-Knowledge Reputation Proof')}                       ${c.m('║')}
  ${c.m('║')}  ${c.d('Groth16 on BN254 (alt_bn128) · Poseidon hash · ~500 R1CS constraints')}     ${c.m('║')}
  ${c.m('╚═══════════════════════════════════════════════════════════════════════════╝')}
`);

  const connection = new Connection(RPC, 'confirmed');
  const wallet = loadWallet();
  const balance = await connection.getBalance(wallet.publicKey);

  console.log(`  ${c.p('Solana Mainnet')}
  ${c.d('├─')} wallet    ${c.h(wallet.publicKey.toBase58())}
  ${c.d('├─')} balance   ${c.v((balance / LAMPORTS_PER_SOL).toFixed(4) + ' SOL')}
  ${c.d('└─')} program   ${c.h(KAMIYO_PROGRAM_ID.toBase58())}
`);

  const modelHash = Buffer.alloc(32);
  Buffer.from('tits-pro-v2').copy(modelHash);
  const [escrowPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('inference_escrow'), wallet.publicKey.toBuffer(), modelHash],
    KAMIYO_PROGRAM_ID
  );

  console.log(`  ${c.p('Escrow PDA')}
  ${c.d('├─')} seeds     ${c.d('["inference_escrow", pubkey, sha256("tits-pro-v2")]')}
  ${c.d('└─')} address   ${c.h(escrowPda.toBase58())}
`);

  const wasmPath = path.join(CIRCUIT_DIR, 'reputation_threshold_js', 'reputation_threshold.wasm');
  const zkeyPath = path.join(CIRCUIT_DIR, 'reputation_threshold_final.zkey');
  const vkeyPath = path.join(CIRCUIT_DIR, 'verification_key.json');

  if (!fs.existsSync(wasmPath)) {
    console.log('  [!] Circuit artifacts not found. Run: cd packages/kamiyo-tetsuo-privacy/circuits && ./build.sh\n');
    process.exit(1);
  }

  const score = 92;
  const threshold = 80;
  const secret = BigInt('0x' + Buffer.from(crypto.getRandomValues(new Uint8Array(31))).toString('hex'));

  console.log(`  ${c.p('Witness')}
  ${c.d('├─')} score     ${c.m(score.toString())}
  ${c.d('├─')} threshold ${c.h(threshold.toString())}
  ${c.d('└─')} secret    ${c.d('0x' + hex(secret).slice(0, 32) + '...')}
`);

  const poseidon = await buildPoseidon();
  const commitment = poseidon.F.toObject(poseidon([BigInt(score), secret]));

  console.log(`  ${c.p('Poseidon')}${c.d('(score, secret) → commitment')}
  ${c.d('├─')} inputs    ${c.d('[' + score + ', 0x' + hex(secret).slice(0, 16) + '...]')}
  ${c.d('├─')} t=3       ${c.d('RF=8 full rounds, RP=57 partial rounds')}
  ${c.d('├─')} MDS       ${c.d('3×3 Cauchy matrix over F_p')}
  ${c.d('└─')} output    ${c.h('0x' + truncHex(hex(commitment)))}
`);

  const input = {
    score,
    secret: secret.toString(),
    threshold,
    commitment: commitment.toString(),
  };

  console.log(`  ${c.p('Groth16 Prover')}`);
  const t0 = performance.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);
  const proveTime = (performance.now() - t0).toFixed(1);

  const piA = [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])];
  const piB = [[BigInt(proof.pi_b[0][0]), BigInt(proof.pi_b[0][1])],
               [BigInt(proof.pi_b[1][0]), BigInt(proof.pi_b[1][1])]];
  const piC = [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])];

  console.log(`  ${c.d('├─')} time     ${c.v(proveTime + 'ms')}
  ${c.d('├─')} curve    ${c.d('BN254 (alt_bn128)')}
  ${c.d('├─')} |F_r|    ${c.d(R.toString().slice(0, 20) + '...')}
  ${c.d('│')}
  ${c.d('├─')} ${c.m('π_A')} ∈ G₁   ${c.d('(64 bytes)')}
  ${c.d('│  ├─')} x     ${c.h('0x' + truncHex(hex(piA[0])))}
  ${c.d('│  └─')} y     ${c.h('0x' + truncHex(hex(piA[1])))}
  ${c.d('│')}
  ${c.d('├─')} ${c.m('π_B')} ∈ G₂   ${c.d('(128 bytes)')}
  ${c.d('│  ├─')} x₀    ${c.h('0x' + truncHex(hex(piB[0][0])))}
  ${c.d('│  ├─')} x₁    ${c.h('0x' + truncHex(hex(piB[0][1])))}
  ${c.d('│  ├─')} y₀    ${c.h('0x' + truncHex(hex(piB[1][0])))}
  ${c.d('│  └─')} y₁    ${c.h('0x' + truncHex(hex(piB[1][1])))}
  ${c.d('│')}
  ${c.d('└─')} ${c.m('π_C')} ∈ G₁   ${c.d('(64 bytes)')}
     ${c.d('├─')} x     ${c.h('0x' + truncHex(hex(piC[0])))}
     ${c.d('└─')} y     ${c.h('0x' + truncHex(hex(piC[1])))}
`);

  console.log(`  ${c.p('Public Signals')}
  ${c.d('├─')} valid     ${c.v(publicSignals[0])}
  ${c.d('├─')} threshold ${c.h(publicSignals[1])}
  ${c.d('└─')} commit    ${c.d(publicSignals[2].slice(0, 20) + '...')}
`);

  const vkey = JSON.parse(fs.readFileSync(vkeyPath, 'utf-8'));
  const t1 = performance.now();
  const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  const verifyTime = (performance.now() - t1).toFixed(1);

  console.log(`  ${c.p('Groth16 Verifier')}
  ${c.d('├─')} pairing   ${c.d('e(π_A, π_B) == e(α, β) · e(Σ pub_i·L_i, γ) · e(π_C, δ)')}
  ${c.d('├─')} time      ${c.v(verifyTime + 'ms')}
  ${c.d('└─')} result    ${valid ? c.v('✓ VALID') : c.m('✗ INVALID')}
`);

  const proofBytes = 256;
  console.log(`  ${c.p('Wire Format')}
  ${c.d('├─')} proof     ${c.h(proofBytes + ' bytes')} ${c.d('(π_A ‖ π_B ‖ π_C)')}
  ${c.d('├─')} signals   ${c.h((publicSignals.length * 32) + ' bytes')}
  ${c.d('└─')} total     ${c.h((proofBytes + publicSignals.length * 32) + ' bytes')}
`);

  console.log(`  ${c.m('═══════════════════════════════════════════════════════════════════════════')}
  ${c.m('score=' + score)} hidden · ${c.h('threshold=' + threshold)} public · ${c.p('proof=' + proofBytes + 'B')} · ${c.v('verify=' + verifyTime + 'ms')}
`);
}

main().catch(console.error);
