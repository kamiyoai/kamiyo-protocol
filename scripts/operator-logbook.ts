import fs from 'node:fs';
import path from 'node:path';

type Mode = 'operational' | 'reflective' | 'auto';
type Command = 'new' | 'validate';

interface CliOptions {
  command: Command;
  mode: Mode;
  outDir: string;
  stateFile: string;
  title?: string;
  body?: string;
  bodyFile?: string;
  dryRun: boolean;
}

interface LogFileInfo {
  file: string;
  serial: number;
  content: string;
  reflective: boolean;
}

const HEADER_PREFIX = 'Kyōshin 共振 // operator log ';
const FILE_NAME_PATTERN = /^AGENT_LOG_(\d{4})_X_POST(?:_.*)?\.md$/;
const DEFAULT_STATE_FILE = 'config/operator-logbook.state.json';

interface LogbookState {
  nextSerial: number;
}

function fail(message: string): never {
  throw new Error(message);
}

function padSerial(value: number): string {
  return String(value).padStart(4, '0');
}

function parseArgs(argv: string[]): CliOptions {
  const commandRaw = argv[0] ?? 'new';
  if (commandRaw !== 'new' && commandRaw !== 'validate') {
    fail(`Unknown command: ${commandRaw}. Use "new" or "validate".`);
  }
  const command = commandRaw as Command;

  const options: CliOptions = {
    command,
    mode: 'auto',
    outDir: 'docs',
    stateFile: DEFAULT_STATE_FILE,
    dryRun: false,
  };

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') {
      continue;
    }
    switch (arg) {
      case '--mode': {
        const raw = argv[i + 1];
        if (!raw) fail('--mode requires a value');
        if (raw !== 'operational' && raw !== 'reflective' && raw !== 'auto') {
          fail('--mode must be operational, reflective, or auto');
        }
        options.mode = raw;
        i += 1;
        break;
      }
      case '--out-dir': {
        const raw = argv[i + 1];
        if (!raw) fail('--out-dir requires a value');
        options.outDir = raw;
        i += 1;
        break;
      }
      case '--state-file': {
        const raw = argv[i + 1];
        if (!raw) fail('--state-file requires a value');
        options.stateFile = raw;
        i += 1;
        break;
      }
      case '--title': {
        const raw = argv[i + 1];
        if (!raw) fail('--title requires a value');
        options.title = raw.trim();
        i += 1;
        break;
      }
      case '--body': {
        const raw = argv[i + 1];
        if (!raw) fail('--body requires a value');
        options.body = raw;
        i += 1;
        break;
      }
      case '--body-file': {
        const raw = argv[i + 1];
        if (!raw) fail('--body-file requires a value');
        options.bodyFile = raw;
        i += 1;
        break;
      }
      case '--dry-run':
        options.dryRun = true;
        break;
      default:
        fail(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function readBody(options: CliOptions): string {
  if (options.body && options.bodyFile) {
    fail('Use only one of --body or --body-file.');
  }
  if (options.bodyFile) {
    const resolved = path.resolve(process.cwd(), options.bodyFile);
    return fs.readFileSync(resolved, 'utf8').trim();
  }
  return (options.body ?? '').trim();
}

function isReflective(content: string, fileName: string): boolean {
  if (fileName.includes('_REFLECTIVE_') || fileName.endsWith('_REFLECTIVE_SAMPLE.md')) {
    return true;
  }
  return /\nReflection:\n/i.test(content);
}

function loadLogFiles(outDir: string): LogFileInfo[] {
  const absoluteDir = path.resolve(process.cwd(), outDir);
  if (!fs.existsSync(absoluteDir)) {
    return [];
  }

  const files = fs.readdirSync(absoluteDir);
  const out: LogFileInfo[] = [];
  for (const file of files) {
    const match = file.match(FILE_NAME_PATTERN);
    if (!match) continue;
    const serial = Number(match[1]);
    const fullPath = path.join(absoluteDir, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    out.push({
      file,
      serial,
      content,
      reflective: isReflective(content, file),
    });
  }

  out.sort((a, b) => a.serial - b.serial);
  return out;
}

function readStateFile(stateFile: string): LogbookState | null {
  const resolved = path.resolve(process.cwd(), stateFile);
  if (!fs.existsSync(resolved)) return null;
  const raw = fs.readFileSync(resolved, 'utf8');
  const parsed = JSON.parse(raw) as Partial<LogbookState>;
  if (!parsed || typeof parsed.nextSerial !== 'number' || !Number.isFinite(parsed.nextSerial) || parsed.nextSerial <= 0) {
    return null;
  }
  return { nextSerial: Math.floor(parsed.nextSerial) };
}

function writeStateFile(stateFile: string, state: LogbookState): void {
  const resolved = path.resolve(process.cwd(), stateFile);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

function resolveNextSerial(history: LogFileInfo[], stateFile: string): number {
  const fromState = readStateFile(stateFile);
  if (fromState) {
    return fromState.nextSerial;
  }
  return history.length > 0 ? history[history.length - 1].serial + 1 : 1;
}

function resolveMode(mode: Mode, nextSerial: number, history: LogFileInfo[]): 'operational' | 'reflective' {
  if (mode === 'operational' || mode === 'reflective') {
    return mode;
  }

  const reflectiveSerials = history.filter(entry => entry.reflective).map(entry => entry.serial);
  const lastReflective = reflectiveSerials.length > 0 ? reflectiveSerials[reflectiveSerials.length - 1] : null;
  const gap = lastReflective === null ? nextSerial : nextSerial - lastReflective;

  if (gap >= 8) {
    return 'reflective';
  }
  if (nextSerial % 7 === 0 && gap >= 5) {
    return 'reflective';
  }
  return 'operational';
}

function titleFor(mode: 'operational' | 'reflective', override?: string): string {
  if (override && override.trim()) return override.trim();
  return mode === 'reflective' ? 'Continuity check: observation and intent.' : 'Operational update.';
}

function buildContent(
  serial: number,
  mode: 'operational' | 'reflective',
  title: string,
  body: string
): string {
  const header = `${HEADER_PREFIX}${padSerial(serial)}`;
  const bodyBlock = body ? `${body}\n\n` : '';

  if (mode === 'reflective') {
    return `${header}

${title}

${bodyBlock}Observed state:
- 

Reflection:
I track continuity through evidence.
Meaning is only durable when it survives verification.
I keep what is true, discard what cannot be proven, and continue.

Next: convert current uncertainty into one measurable execution gain.

Prime directive remains unchanged: generate SOL revenue and route it into staking pool for $KAMIYO stakers.
`;
  }

  return `${header}

${title}

${bodyBlock}State:
- 

Evidence:
- 

Next:
- 

Prime directive unchanged: Generate SOL revenue and route it into staking pool for $KAMIYO stakers.
`;
}

function createNewLog(options: CliOptions): void {
  const history = loadLogFiles(options.outDir);
  const nextSerial = resolveNextSerial(history, options.stateFile);
  const resolvedMode = resolveMode(options.mode, nextSerial, history);
  const title = titleFor(resolvedMode, options.title);
  const body = readBody(options);
  const serial = padSerial(nextSerial);
  const fileName = resolvedMode === 'reflective' ? `AGENT_LOG_${serial}_X_POST_REFLECTIVE.md` : `AGENT_LOG_${serial}_X_POST.md`;
  const dir = path.resolve(process.cwd(), options.outDir);
  const filePath = path.join(dir, fileName);
  const content = buildContent(nextSerial, resolvedMode, title, body);

  if (options.dryRun) {
    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          dryRun: true,
          mode: resolvedMode,
          serial: nextSerial,
          fileName,
          content,
        },
        null,
        2
      ) + '\n'
    );
    return;
  }

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  writeStateFile(options.stateFile, { nextSerial: nextSerial + 1 });
  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        mode: resolvedMode,
        serial: nextSerial,
        fileName,
        path: filePath,
      },
      null,
      2
    ) + '\n'
  );
}

function validateLogs(options: CliOptions): void {
  const history = loadLogFiles(options.outDir);
  const issues: Array<{ file: string; reason: string }> = [];

  const serials = history.map(entry => entry.serial);
  for (let i = 0; i < serials.length; i += 1) {
    const expected = serials[0] + i;
    if (serials[i] !== expected) {
      issues.push({
        file: history[i].file,
        reason: `serial gap: expected ${padSerial(expected)} got ${padSerial(serials[i])}`,
      });
    }
  }

  for (const entry of history) {
    const firstLine = entry.content.split('\n')[0]?.trim() ?? '';
    const expectedHeader = `${HEADER_PREFIX}${padSerial(entry.serial)}`;
    if (firstLine !== expectedHeader) {
      issues.push({
        file: entry.file,
        reason: `invalid header: expected "${expectedHeader}"`,
      });
    }
  }

  process.stdout.write(
    JSON.stringify(
      {
        ok: issues.length === 0,
        total: history.length,
        issues,
      },
      null,
      2
    ) + '\n'
  );

  if (issues.length > 0) {
    process.exit(1);
  }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === 'validate') {
    validateLogs(options);
    return;
  }
  createNewLog(options);
}

main();
