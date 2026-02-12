import gradient from 'gradient-string';
import chalk from 'chalk';

const BANNER_ASCII = `
  ██╗  ██╗ █████╗ ███╗   ███╗██╗██╗   ██╗ ██████╗     ███████╗██╗    ██╗ █████╗ ██████╗ ███╗   ███╗████████╗███████╗ █████╗ ███╗   ███╗███████╗
  ██║ ██╔╝██╔══██╗████╗ ████║██║╚██╗ ██╔╝██╔═══██╗    ██╔════╝██║    ██║██╔══██╗██╔══██╗████╗ ████║╚══██╔══╝██╔════╝██╔══██╗████╗ ████║██╔════╝
  █████╔╝ ███████║██╔████╔██║██║ ╚████╔╝ ██║   ██║    ███████╗██║ █╗ ██║███████║██████╔╝██╔████╔██║   ██║   █████╗  ███████║██╔████╔██║███████╗
  ██╔═██╗ ██╔══██║██║╚██╔╝██║██║  ╚██╔╝  ██║   ██║    ╚════██║██║███╗██║██╔══██║██╔══██╗██║╚██╔╝██║   ██║   ██╔══╝  ██╔══██║██║╚██╔╝██║╚════██║
  ██║  ██╗██║  ██║██║ ╚═╝ ██║██║   ██║   ╚██████╔╝    ███████║╚███╔███╔╝██║  ██║██║  ██║██║ ╚═╝ ██║   ██║   ███████╗██║  ██║██║ ╚═╝ ██║███████║
  ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝   ╚═╝    ╚═════╝     ╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝`;


const FOREST_ICON = `
                         ⣀⣤⣶⣶⣤⣀
                      ⣴⣿⣿⣿⣿⣿⣿⣿⣦
                     ⣿⣿⣿⡟⠁⠈⢻⣿⣿⣿
                    ⣿⣿⣿⠃  ⢀⣤ ⠘⣿⣿⣿
                    ⣿⣿⣿  ⣿⣿⣿  ⣿⣿⣿
                     ⠻⣿⣷⣄⠙⠿⠋⣠⣾⣿⠟
                        ⠙⠿⣿⣿⣿⠿⠋`;

// Gradient: magenta -> purple -> cyan
const swarmteamsGradient = gradient(['#ff00ff', '#bf00ff', '#00ffff']);

// Accent gradient for highlights
const accentGradient = gradient(['#38a169', '#68d391', '#9ae6b4']);

export function showBanner(): void {
  console.clear();
  console.log(swarmteamsGradient.multiline(BANNER_ASCII));
  console.log();
}

export function showCompactBanner(): void {
  console.log();
  console.log(chalk.gray('  SWARMTEAMS | ZK Agent Collaboration'));
  console.log();
}

export function showDivider(): void {
  console.log(chalk.gray('  ─────────────────────────────────────────────────'));
}

export function showSuccess(message: string): void {
  console.log(chalk.green('  ✓ ') + message);
}

export function showError(message: string): void {
  console.log(chalk.red('  ✗ ') + message);
}

export function showInfo(message: string): void {
  console.log(chalk.cyan('  ℹ ') + message);
}

export function showWarning(message: string): void {
  console.log(chalk.yellow('  ⚠ ') + message);
}

export function formatSol(lamports: number | bigint): string {
  const sol = Number(lamports) / 1e9;
  return chalk.yellow(sol.toFixed(4)) + chalk.gray(' SOL');
}

export function formatAddress(address: string, short = true): string {
  if (short) {
    return chalk.cyan(address.slice(0, 4) + '...' + address.slice(-4));
  }
  return chalk.cyan(address);
}

export function formatCommitment(commitment: string): string {
  return chalk.magenta(commitment.slice(0, 8) + '...' + commitment.slice(-8));
}

export { swarmteamsGradient, accentGradient };
