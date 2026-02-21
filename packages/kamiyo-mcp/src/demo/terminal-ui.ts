const ANSI_RESET = '\x1b[0m';
const ANSI_DIM = '\x1b[2m';
const ANSI_BOLD = '\x1b[1m';
const ANSI_RED = '\x1b[31m';
const ANSI_GREEN = '\x1b[32m';
const ANSI_YELLOW = '\x1b[33m';
const ANSI_BLUE = '\x1b[34m';
const ANSI_MAGENTA = '\x1b[35m';
const ANSI_CYAN = '\x1b[36m';
const ANSI_WHITE = '\x1b[37m';

const LOGO_LINES = [
  '  _______     _______ _   _ _____   _   _  ___  ____  ___ ________  _   _ ',
  ' | ____\\ \\   / / ____| \\ | |_   _| | | | |/ _ \\|  _ \\|_ _|__  / _ \\| \\ | |',
  ' |  _|  \\ \\ / /|  _| |  \\| | | |   | |_| | | | | |_) || |  / / | | |  \\| |',
  ' | |___  \\ V / | |___| |\\  | | |   |  _  | |_| |  _ < | | / /| |_| | |\\  |',
  ' |_____|  \\_/  |_____|_| \\_| |_|   |_| |_|\\___/|_| \\_\\___/____\\___/|_| \\_|',
];

const isTty = Boolean(process.stdout.isTTY);
const disableColor =
  process.env.NO_COLOR === '1' ||
  process.env.NO_COLOR === 'true' ||
  process.env.EVENT_HORIZON_NO_COLOR === '1';

const enableColor = isTty && !disableColor;
const enableAnimation =
  isTty && process.env.CI !== 'true' && process.env.EVENT_HORIZON_NO_ANIM !== '1';
const richUi = isTty && process.env.EVENT_HORIZON_PLAIN_UI !== '1';

function paint(text: string, color: string): string {
  if (!enableColor) {
    return text;
  }
  return `${color}${text}${ANSI_RESET}`;
}

function stripAnsi(value: string): string {
  let output = '';
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (value.charCodeAt(index) === 27 && value[index + 1] === '[') {
      index += 2;
      while (index < value.length && value[index] !== 'm') {
        index += 1;
      }
      continue;
    }
    output += char;
  }
  return output;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function rightPad(text: string, width: number): string {
  const visible = stripAnsi(text).length;
  if (visible >= width) {
    return text;
  }
  return `${text}${' '.repeat(width - visible)}`;
}

function truncate(text: string, width: number): string {
  if (text.length <= width) {
    return text;
  }
  if (width < 4) {
    return text.slice(0, width);
  }
  return `${text.slice(0, width - 3)}...`;
}

function panelWidth(lines: string[], title: string): number {
  const contentMax = Math.max(
    stripAnsi(title).length + 2,
    ...lines.map(line => stripAnsi(line).length)
  );
  const terminalLimit = process.stdout.columns
    ? Math.max(56, Math.min(110, process.stdout.columns - 2))
    : 96;
  return Math.min(terminalLimit, Math.max(56, contentMax + 4));
}

function tab(label: string, active: boolean): string {
  const upper = label.toUpperCase();
  if (active) {
    return paint(`[ ${upper} ]`, `${ANSI_BOLD}${ANSI_CYAN}`);
  }
  return paint(`[ ${upper} ]`, ANSI_DIM);
}

export function isRichUiEnabled(): boolean {
  return richUi;
}

export function formatStatus(
  status: string,
  tone: 'live' | 'pass' | 'warn' | 'fail' | 'info' = 'info'
): string {
  const text = `[${status.toUpperCase()}]`;
  if (!enableColor) {
    return text;
  }
  if (tone === 'live') {
    return paint(text, `${ANSI_BOLD}${ANSI_CYAN}`);
  }
  if (tone === 'pass') {
    return paint(text, `${ANSI_BOLD}${ANSI_GREEN}`);
  }
  if (tone === 'warn') {
    return paint(text, `${ANSI_BOLD}${ANSI_YELLOW}`);
  }
  if (tone === 'fail') {
    return paint(text, `${ANSI_BOLD}${ANSI_RED}`);
  }
  return paint(text, `${ANSI_BOLD}${ANSI_MAGENTA}`);
}

export function printEventHorizonHeader(options: {
  activeTab: 'trust' | 'compliance' | 'verify';
  mode?: string;
  policy?: string;
}): void {
  if (!richUi) {
    return;
  }

  console.log('');
  for (const [index, line] of LOGO_LINES.entries()) {
    const color = index % 2 === 0 ? ANSI_CYAN : ANSI_MAGENTA;
    console.log(paint(line, `${ANSI_BOLD}${color}`));
  }
  console.log(paint('                                   by KAMIYO', `${ANSI_DIM}${ANSI_WHITE}`));
  console.log(
    paint(
      '--------------------------------------------------------------------------------',
      ANSI_DIM
    )
  );
  console.log(
    `  ${tab('Trust Graph', options.activeTab === 'trust')}  ${tab(
      'Meishi Compliance',
      options.activeTab === 'compliance' || options.activeTab === 'verify'
    )}`
  );

  const details: string[] = [];
  if (options.mode) {
    details.push(`mode=${options.mode}`);
  }
  if (options.policy) {
    details.push(`policy=${options.policy}`);
  }
  if (details.length) {
    console.log(`  ${paint(details.join(' | '), ANSI_DIM)}`);
  }
  console.log(
    paint(
      '--------------------------------------------------------------------------------',
      ANSI_DIM
    )
  );
}

export async function printBootSequence(lines: string[]): Promise<void> {
  if (!richUi || !lines.length) {
    return;
  }

  for (const line of lines) {
    if (!enableAnimation) {
      console.log(`  ${paint('>', ANSI_CYAN)} ${line}`);
      continue;
    }
    process.stdout.write(`  ${paint('>', ANSI_CYAN)} `);
    for (const ch of line) {
      process.stdout.write(ch);
      await sleep(6);
    }
    process.stdout.write('\n');
  }
}

export async function withSpinner<T>(label: string, task: () => Promise<T>): Promise<T> {
  if (!richUi || !enableAnimation) {
    return task();
  }

  const frames = ['|', '/', '-', '\\'];
  let frame = 0;
  process.stdout.write(`  ${paint('[...]', ANSI_DIM)} ${label}`);
  const timer = setInterval(() => {
    const marker = frames[frame % frames.length];
    frame += 1;
    process.stdout.write(`\r  ${paint(`[${marker}]`, `${ANSI_BOLD}${ANSI_BLUE}`)} ${label}`);
  }, 80);

  try {
    const value = await task();
    clearInterval(timer);
    process.stdout.write(`\r  ${paint('[OK ]', `${ANSI_BOLD}${ANSI_GREEN}`)} ${label}\n`);
    return value;
  } catch (error) {
    clearInterval(timer);
    process.stdout.write(`\r  ${paint('[ERR]', `${ANSI_BOLD}${ANSI_RED}`)} ${label}\n`);
    throw error;
  }
}

export function printPanel(title: string, lines: string[]): void {
  if (!richUi) {
    return;
  }

  const safeLines = lines.length ? lines : ['(no data)'];
  const width = panelWidth(safeLines, title);
  const top = `+${'-'.repeat(width - 2)}+`;
  console.log(paint(top, ANSI_DIM));

  console.log(
    `${paint('|', ANSI_DIM)}${paint(
      rightPad(` ${truncate(title.toUpperCase(), width - 4)}`, width - 2),
      `${ANSI_BOLD}${ANSI_WHITE}`
    )}${paint('|', ANSI_DIM)}`
  );

  const divider = `+${'-'.repeat(width - 2)}+`;
  console.log(paint(divider, ANSI_DIM));

  for (const line of safeLines) {
    const text = truncate(line, width - 4);
    const row = rightPad(` ${text}`, width - 2);
    console.log(`${paint('|', ANSI_DIM)}${row}${paint('|', ANSI_DIM)}`);
  }

  console.log(paint(top, ANSI_DIM));
}

export function formatMetric(label: string, value: string): string {
  const left = paint(label.toUpperCase(), `${ANSI_DIM}${ANSI_WHITE}`);
  const right = paint(value, `${ANSI_BOLD}${ANSI_CYAN}`);
  return `${left}: ${right}`;
}

export function printThreadPack(posts: string[]): void {
  if (!richUi) {
    return;
  }
  printPanel(
    'Thread Pack',
    posts.map((post, index) => `${index + 1}. (${post.length}) ${post}`)
  );
}

export function printFatal(message: string): void {
  if (!richUi) {
    return;
  }
  console.error(`${paint('[FATAL]', `${ANSI_BOLD}${ANSI_RED}`)} ${message}`);
}

export function printSuccess(message: string): void {
  if (!richUi) {
    return;
  }
  console.log(`${paint('[DONE ]', `${ANSI_BOLD}${ANSI_GREEN}`)} ${message}`);
}
