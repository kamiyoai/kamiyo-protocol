import { LogLevel, LogEntry } from './types';

const COLORS = {
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
} as const;

const DELAYS: Record<LogLevel, number> = {
  step: 300,
  ok: 100,
  warn: 100,
  fail: 100,
  dim: 50,
  header: 400,
  phase: 500,
};

export class Logger {
  private entries: LogEntry[] = [];
  private verbose: boolean;
  private animate: boolean;

  constructor(opts: { verbose?: boolean; animate?: boolean } = {}) {
    this.verbose = opts.verbose ?? false;
    this.animate = opts.animate ?? true;
  }

  private async delay(ms: number): Promise<void> {
    if (this.animate) {
      await new Promise(r => setTimeout(r, ms));
    }
  }

  private record(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    this.entries.push({ level, message, timestamp: Date.now(), data });
  }

  async step(message: string, data?: Record<string, unknown>): Promise<void> {
    await this.delay(DELAYS.step);
    this.record('step', message, data);
    console.log(`\n${COLORS.cyan}>${COLORS.reset} ${message}`);
  }

  async ok(message: string, data?: Record<string, unknown>): Promise<void> {
    await this.delay(DELAYS.ok);
    this.record('ok', message, data);
    console.log(`  ${COLORS.green}+${COLORS.reset} ${message}`);
  }

  async warn(message: string, data?: Record<string, unknown>): Promise<void> {
    await this.delay(DELAYS.warn);
    this.record('warn', message, data);
    console.log(`  ${COLORS.yellow}!${COLORS.reset} ${message}`);
  }

  async fail(message: string, data?: Record<string, unknown>): Promise<void> {
    await this.delay(DELAYS.fail);
    this.record('fail', message, data);
    console.log(`  ${COLORS.red}x${COLORS.reset} ${message}`);
  }

  async dim(message: string, data?: Record<string, unknown>): Promise<void> {
    await this.delay(DELAYS.dim);
    this.record('dim', message, data);
    console.log(`  ${COLORS.dim}${message}${COLORS.reset}`);
  }

  async header(title: string): Promise<void> {
    await this.delay(DELAYS.header);
    this.record('header', title);
    console.log(`\n${COLORS.bold}${COLORS.cyan}--- ${title} ---${COLORS.reset}\n`);
  }

  async phase(num: number, title: string): Promise<void> {
    await this.delay(DELAYS.phase);
    this.record('phase', `[PHASE ${num}] ${title}`);
    console.log(`\n${COLORS.bold}${COLORS.magenta}[PHASE ${num}]${COLORS.reset} ${COLORS.bold}${title}${COLORS.reset}\n`);
  }

  async wait(message: string, durationMs: number = 1500): Promise<void> {
    if (!this.animate) {
      console.log(`  ${COLORS.dim}${message}${COLORS.reset}`);
      return;
    }

    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    const start = Date.now();
    let i = 0;

    process.stdout.write(`  ${COLORS.dim}${frames[0]} ${message}${COLORS.reset}`);

    while (Date.now() - start < durationMs) {
      await new Promise(r => setTimeout(r, 80));
      i = (i + 1) % frames.length;
      process.stdout.write(`\r  ${COLORS.dim}${frames[i]} ${message}${COLORS.reset}`);
    }

    process.stdout.write(`\r  ${COLORS.dim}✓ ${message}${COLORS.reset}\n`);
  }

  async progress(label: string, steps: string[], delayBetween: number = 400): Promise<void> {
    console.log(`  ${COLORS.dim}${label}${COLORS.reset}`);
    for (const step of steps) {
      await this.delay(delayBetween);
      console.log(`    ${COLORS.dim}→ ${step}${COLORS.reset}`);
    }
  }

  table(headers: string[], rows: string[][]): void {
    const widths = headers.map((h, i) =>
      Math.max(h.length, ...rows.map(r => (r[i] || '').length))
    );

    const sep = widths.map(w => '-'.repeat(w)).join(' | ');
    const headerRow = headers.map((h, i) => h.padEnd(widths[i])).join(' | ');

    console.log(`  ${COLORS.dim}${headerRow}${COLORS.reset}`);
    console.log(`  ${COLORS.dim}${sep}${COLORS.reset}`);

    for (const row of rows) {
      const formatted = row.map((c, i) => (c || '').padEnd(widths[i])).join(' | ');
      console.log(`  ${COLORS.dim}${formatted}${COLORS.reset}`);
    }
  }

  metric(label: string, value: string | number, color?: keyof typeof COLORS): void {
    const c = color ? COLORS[color] : '';
    const r = color ? COLORS.reset : '';
    console.log(`  ${COLORS.dim}${label}:${COLORS.reset} ${c}${value}${r}`);
  }

  banner(): void {
    // True color: hot cyan #00FFFF, hot pink #FF00FF
    const c = '\x1b[38;2;0;255;255m';   // electric cyan
    const p = '\x1b[38;2;255;0;255m';   // hot magenta
    const r = '\x1b[0m';

    console.log(`\x1b[1m
    ${c}██╗  ██╗${p} █████╗ ${c}███╗   ███╗${p}██╗${c}██╗   ██╗${p} ██████╗${r}
    ${c}██║ ██╔╝${p}██╔══██╗${c}████╗ ████║${p}██║${c}╚██╗ ██╔╝${p}██╔═══██╗${r}
    ${c}█████╔╝ ${p}███████║${c}██╔████╔██║${p}██║${c} ╚████╔╝ ${p}██║   ██║${r}
    ${c}██╔═██╗ ${p}██╔══██║${c}██║╚██╔╝██║${p}██║${c}  ╚██╔╝  ${p}██║   ██║${r}
    ${c}██║  ██╗${p}██║  ██║${c}██║ ╚═╝ ██║${p}██║${c}   ██║   ${p}╚██████╔╝${r}
    ${c}╚═╝  ╚═╝${p}╚═╝  ╚═╝${c}╚═╝     ╚═╝${p}╚═╝${c}   ╚═╝    ${p}╚═════╝${r}
`);
  }

  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  setAnimate(animate: boolean): void {
    this.animate = animate;
  }
}

export const log = new Logger();
