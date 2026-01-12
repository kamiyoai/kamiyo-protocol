/**
 * Banner utilities for KAMIYO x Daydreams demo
 */

import gradient from 'gradient-string';

const BANNER = `
██╗  ██╗ █████╗ ███╗   ███╗██╗██╗   ██╗ ██████╗     ██╗  ██╗    ██████╗  █████╗ ██╗   ██╗██████╗ ██████╗ ███████╗ █████╗ ███╗   ███╗███████╗
██║ ██╔╝██╔══██╗████╗ ████║██║╚██╗ ██╔╝██╔═══██╗    ╚██╗██╔╝    ██╔══██╗██╔══██╗╚██╗ ██╔╝██╔══██╗██╔══██╗██╔════╝██╔══██╗████╗ ████║██╔════╝
█████╔╝ ███████║██╔████╔██║██║ ╚████╔╝ ██║   ██║     ╚███╔╝     ██║  ██║███████║ ╚████╔╝ ██║  ██║██████╔╝█████╗  ███████║██╔████╔██║███████╗
██╔═██╗ ██╔══██║██║╚██╔╝██║██║  ╚██╔╝  ██║   ██║     ██╔██╗     ██║  ██║██╔══██║  ╚██╔╝  ██║  ██║██╔══██╗██╔══╝  ██╔══██║██║╚██╔╝██║╚════██║
██║  ██╗██║  ██║██║ ╚═╝ ██║██║   ██║   ╚██████╔╝    ██╔╝ ██╗    ██████╔╝██║  ██║   ██║   ██████╔╝██║  ██║███████╗██║  ██║██║ ╚═╝ ██║███████║
╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝   ╚═╝    ╚═════╝     ╚═╝  ╚═╝    ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝`;

const SUBTITLE = `                    ╔══════════════════════════════════════════════════════════════════════════════════════════════════════╗
                    ║       AI AGENT FRAMEWORK  |  ZK REPUTATION  |  ESCROW PAYMENTS  |  QUALITY ENFORCEMENT                ║
                    ╚══════════════════════════════════════════════════════════════════════════════════════════════════════╝`;

const ARCH = `
    ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
    │                                          KAMIYO x DAYDREAMS ARCHITECTURE                                            │
    ├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
    │                                                                                                                     │
    │     DAYDREAMS AGENT                          KAMIYO EXTENSION                          ON-CHAIN                     │
    │    ┌───────────────┐                        ┌───────────────────┐                    ┌───────────────┐              │
    │    │  createDreams │ ────────────────────>  │  kamiyoExtension  │ ───────────────>   │   Escrow      │              │
    │    │   + model     │                        │                   │    payments        │   Program     │              │
    │    │   + contexts  │                        │  • consumeAPI     │                    │               │              │
    │    │   + actions   │                        │  • proveReputation│                    │   Groth16     │              │
    │    └───────────────┘                        │  • verifyProof    │ <───────────────   │   Verifier    │              │
    │           │                                 │  • fileDispute    │    settlement      │               │              │
    │           │                                 └───────────────────┘                    └───────────────┘              │
    │           │                                          │                                                              │
    │           ▼                                          ▼                                                              │
    │    ┌───────────────┐                        ┌───────────────────┐                                                   │
    │    │  BEHAVIORS    │                        │  ZK REPUTATION    │                                                   │
    │    │               │                        │                   │                                                   │
    │    │  • QualityEnf │                        │  Poseidon commit  │                                                   │
    │    │  • RepProver  │                        │  Groth16 proofs   │                                                   │
    │    │  • SvcDiscov  │                        │  Tier verification│                                                   │
    │    │  • PayOptim   │                        │                   │                                                   │
    │    └───────────────┘                        └───────────────────┘                                                   │
    │                                                                                                                     │
    └─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘`;

export const vice = gradient.vice;
export const cristal = gradient.cristal;
export const teen = gradient.teen;
export const mind = gradient.mind;
export const neonPink = gradient(['#ff00ff', '#ff1493', '#ff69b4', '#ff00ff']);
export const neonCyan = gradient(['#00ffff', '#00e5ff', '#00bfff', '#00ffff']);

export function printBanner(): void {
  console.log();
  console.log(vice.multiline(BANNER));
  console.log();
  console.log(teen.multiline(SUBTITLE));
  console.log();
}

export function printArchitecture(): void {
  console.log(mind.multiline(ARCH));
  console.log();
}

export function printSeparator(title?: string): void {
  const width = 110;
  if (title) {
    const padding = Math.floor((width - title.length - 4) / 2);
    console.log();
    console.log(teen('-'.repeat(padding) + '[ ' + title + ' ]' + '-'.repeat(width - padding - title.length - 4)));
    console.log();
  } else {
    console.log(teen('-'.repeat(width)));
  }
}

export function printSuccess(msg: string): void {
  console.log(cristal('  [ok] ' + msg));
}

export function printError(msg: string): void {
  console.log(neonPink('  [x] ' + msg));
}

export function printInfo(msg: string): void {
  console.log(mind('  -> ' + msg));
}

export function printAgent(name: string, action: string): void {
  console.log(vice(`  [${name}] `) + action);
}

export function printData(label: string, value: string): void {
  console.log(teen(`    ${label}: `) + cristal(value));
}

export function printTier(tier: number): string {
  const names = ['Default', 'Bronze', 'Silver', 'Gold', 'Platinum'];
  const colors = [neonPink, cristal, vice, teen, neonCyan];
  return colors[tier](names[tier]);
}

export function formatHex(n: bigint | string, len = 16): string {
  const hex = typeof n === 'bigint' ? n.toString(16) : n.replace('0x', '');
  return '0x' + hex.padStart(64, '0').slice(0, len) + '..';
}

export function formatMs(ms: number): string {
  return ms < 1 ? `${(ms * 1000).toFixed(0)}us` : `${ms.toFixed(0)}ms`;
}
