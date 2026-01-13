/**
 * Cyberpunk ASCII Banner
 * KAMIYO x DARK FOREST - Agent-to-Agent ZK Trust
 */

import gradient from 'gradient-string';

const KAMIYO_DARK FOREST = `
██╗  ██╗ █████╗ ███╗   ███╗██╗██╗   ██╗ ██████╗     ██╗  ██╗    ████████╗███████╗████████╗███████╗██╗   ██╗ ██████╗
██║ ██╔╝██╔══██╗████╗ ████║██║╚██╗ ██╔╝██╔═══██╗    ╚██╗██╔╝    ╚══██╔══╝██╔════╝╚══██╔══╝██╔════╝██║   ██║██╔═══██╗
█████╔╝ ███████║██╔████╔██║██║ ╚████╔╝ ██║   ██║     ╚███╔╝        ██║   █████╗     ██║   ███████╗██║   ██║██║   ██║
██╔═██╗ ██╔══██║██║╚██╔╝██║██║  ╚██╔╝  ██║   ██║     ██╔██╗        ██║   ██╔══╝     ██║   ╚════██║██║   ██║██║   ██║
██║  ██╗██║  ██║██║ ╚═╝ ██║██║   ██║   ╚██████╔╝    ██╔╝ ██╗       ██║   ███████╗   ██║   ███████║╚██████╔╝╚██████╔╝
╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝   ╚═╝    ╚═════╝     ╚═╝  ╚═╝       ╚═╝   ╚══════╝   ╚═╝   ╚══════╝ ╚═════╝  ╚═════╝ `;

const SUBTITLE = `                      ╔════════════════════════════════════════════════════════════════════════════════════════╗
                      ║        ◈  AGENT-TO-AGENT ZK TRUST  ◈  PRIVACY-PRESERVING REPUTATION  ◈                 ║
                      ╚════════════════════════════════════════════════════════════════════════════════════════╝`;

const AGENT_COMM = `
         ┌──────────────────┐                                                              ┌──────────────────┐
         │    ╔════════╗    │                       ╭────────────────╮                      │    ╔════════╗    │
         │    ║ AGENT  ║    │      ═══════════>     │  ZK PROOF π    │     <═══════════     │    ║ AGENT  ║    │
         │    ║ ALICE  ║    │                       │  score >= θ    │                      │    ║  BOB   ║    │
         │    ╚════════╝    │      <═══════════     │  binding: ✓    │     ═══════════>     │    ╚════════╝    │
         │                  │                       ╰────────────────╯                      │                  │
         │  ┌────────────┐  │                                                              │  ┌────────────┐  │
         │  │ score: ██  │  │         ◇ commitment = Poseidon(score, secret) ◇             │  │ score: ██  │  │
         │  │ secret: ▓▓ │  │         ◇ proof bound to commitment ◇                        │  │ secret: ▓▓ │  │
         │  └────────────┘  │         ◇ exact scores never revealed ◇                      │  └────────────┘  │
         └──────────────────┘                                                              └──────────────────┘`;

const DATA_FLOW = `
    ╭───────────────────────────────────────────────────────────────────────────────────────────────────────────╮
    │                                                                                                           │
    │       PROVER                              CIRCUIT                              VERIFIER                   │
    │    ┌─────────┐                       ┌─────────────┐                       ┌─────────┐                    │
    │    │ score   │ ──────────────────>   │             │                       │         │                    │
    │    │ secret  │                       │  Groth16    │   ───────────────>    │  check  │                    │
    │    └─────────┘                       │  BN254      │   proof π (192B)      │ pairing │                    │
    │                                      │             │                       │         │                    │
    │    ┌─────────┐                       │  R1CS +     │                       └────┬────┘                    │
    │    │threshold│ ──────────────────>   │  QAP       │                            │                         │
    │    │ commit  │  public inputs        │             │                       ┌────▼────┐                    │
    │    └─────────┘                       └─────────────┘                       │ VALID/  │                    │
    │                                                                            │ INVALID │                    │
    │                                                                            └─────────┘                    │
    │                                                                                                           │
    ╰───────────────────────────────────────────────────────────────────────────────────────────────────────────╯`;

const CIRCUIT_DETAIL = `
                           ┌─────────────────────────────────────────────────────┐
                           │              GROTH16 CIRCUIT (BN254)                │
                           ├─────────────────────────────────────────────────────┤
                           │                                                     │
                           │   ┌─────────────────────────────────────────────┐   │
                           │   │  Private Witness                            │   │
                           │   │    • score ∈ [0, 100]                       │   │
                           │   │    • secret ∈ F_r (256-bit random)          │   │
                           │   └─────────────────────────────────────────────┘   │
                           │                                                     │
                           │   ┌─────────────────────────────────────────────┐   │
                           │   │  Public Inputs                              │   │
                           │   │    • threshold (tier requirement)           │   │
                           │   │    • commitment (Poseidon hash)             │   │
                           │   └─────────────────────────────────────────────┘   │
                           │                                                     │
                           │   ┌─────────────────────────────────────────────┐   │
                           │   │  Constraints (R1CS)                         │   │
                           │   │    1. score >= threshold                    │   │
                           │   │    2. commitment == Poseidon(score, secret) │   │
                           │   └─────────────────────────────────────────────┘   │
                           │                                                     │
                           │   Output: π = (A, B, C) ∈ G1 × G2 × G1             │
                           │           192 bytes                                 │
                           │                                                     │
                           └─────────────────────────────────────────────────────┘`;

// Hot neon cyberpunk gradients - magenta, purple, cyan only
// Built-in presets from gradient-string
const vice = gradient.vice;        // pink -> purple
const cristal = gradient.cristal;  // cyan -> purple
const teen = gradient.teen;        // cyan -> magenta
const mind = gradient.mind;        // purple -> cyan
const passion = gradient.passion;  // red -> magenta -> purple
const instagram = gradient.instagram; // purple -> orange -> pink

// Custom hot neon gradients
const neonPink = gradient(['#ff00ff', '#ff1493', '#ff69b4', '#ff00ff']);
const neonCyan = gradient(['#00ffff', '#00e5ff', '#00bfff', '#00ffff']);
const neonMagenta = gradient(['#ff0080', '#ff00ff', '#ff0080']);
const hotGradient = gradient(['#ff0080', '#ff00ff', '#8000ff', '#0080ff', '#00ffff']);
const electricPurple = gradient(['#8000ff', '#bf00ff', '#ff00ff', '#bf00ff', '#8000ff']);
const deepPurple = gradient(['#4b0082', '#8a2be2', '#9400d3', '#bf00ff']);
const synthwave = gradient(['#ff00ff', '#cc00ff', '#9900ff', '#6600ff', '#00ffff']);
const cyber = gradient(['#00ffff', '#ff00ff', '#00ffff']);
const ultraviolet = gradient(['#4b0082', '#8a2be2', '#bf00ff', '#00ffff']);
const plasma = gradient(['#ff0080', '#bf00ff', '#00ffff', '#bf00ff', '#ff0080']);
const neonViolet = gradient(['#9400d3', '#bf00ff', '#00ffff', '#bf00ff', '#9400d3']);
const vaporwave = gradient(['#ff71ce', '#01cdfe', '#05ffa1', '#b967ff', '#fffb96'].slice(0, 4).concat(['#ff71ce']));
const retrowave = gradient(['#ff00ff', '#00ffff', '#ff00ff']);

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function printBannerAnimated(): Promise<void> {
  console.clear();
  console.log();

  // Dramatic reveal line by line
  const lines = KAMIYO_DARK FOREST.split('\n');
  for (const line of lines) {
    console.log(vice(line));
    await sleep(50);
  }

  console.log();
  console.log(teen.multiline(SUBTITLE));
  console.log();
  console.log(mind.multiline(AGENT_COMM));
  console.log();
}

export function printBanner(): void {
  console.log();
  console.log(vice.multiline(KAMIYO_DARK FOREST));
  console.log();
  console.log(teen.multiline(SUBTITLE));
  console.log();
  console.log(mind.multiline(AGENT_COMM));
  console.log();
}

export function printDataFlow(): void {
  console.log(cristal.multiline(DATA_FLOW));
}

export function printCircuit(): void {
  console.log(mind.multiline(CIRCUIT_DETAIL));
}

export function printSeparator(title?: string): void {
  const width = 100;
  if (title) {
    const padding = Math.floor((width - title.length - 4) / 2);
    console.log();
    console.log(teen('─'.repeat(padding) + '[ ' + title + ' ]' + '─'.repeat(width - padding - title.length - 4)));
    console.log();
  } else {
    console.log(teen('─'.repeat(width)));
  }
}

export function printSuccess(msg: string): void {
  console.log(cristal('  ✓ ' + msg));
}

export function printError(msg: string): void {
  console.log(vice('  ✗ ' + msg));
}

export function printInfo(msg: string): void {
  console.log(mind('  → ' + msg));
}

export function printAgent(name: string, action: string): void {
  console.log(vice(`  [${name}] `) + action);
}

export function printProof(label: string, value: string): void {
  console.log(teen(`    ${label}: `) + cristal(value));
}

export function printBox(title: string, lines: string[]): void {
  const width = 60;
  console.log(mind('  ╔' + '═'.repeat(width - 2) + '╗'));
  console.log(mind('  ║') + vice(` ${title}`.padEnd(width - 2)) + mind('║'));
  console.log(mind('  ╟' + '─'.repeat(width - 2) + '╢'));
  for (const line of lines) {
    console.log(mind('  ║') + cristal(` ${line}`.padEnd(width - 2)) + mind('║'));
  }
  console.log(mind('  ╚' + '═'.repeat(width - 2) + '╝'));
}

export async function printProofGeneration(agent: string, tier: string, timeMs: number): Promise<void> {
  process.stdout.write(vice(`  [${agent}] `) + `Generating ${tier} proof `);

  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  const steps = Math.ceil(timeMs / 100);

  for (let i = 0; i < steps && i < 30; i++) {
    process.stdout.write(teen(frames[i % frames.length]));
    await sleep(100);
    process.stdout.write('\b');
  }

  console.log(cristal('✓'));
}

export { gradient, vice, cristal, teen, mind, passion, instagram, hotGradient, neonCyan, neonMagenta, neonPink, synthwave, cyber, electricPurple, deepPurple, ultraviolet, plasma, neonViolet, retrowave };
