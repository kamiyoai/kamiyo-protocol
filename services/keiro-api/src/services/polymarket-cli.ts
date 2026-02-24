import { spawn } from 'node:child_process';

const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_BUFFER_BYTES = 2_000_000;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

const DEFAULT_CACHE_TTL_MS = 45_000;
const DEFAULT_STALE_TTL_MS = 5 * 60_000;
const DEFAULT_BREAKER_THRESHOLD = 3;
const DEFAULT_BREAKER_COOLDOWN_MS = 30_000;

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type PolymarketCommandResult = JsonValue;

export interface PolymarketMarketSnapshot {
  id: string;
  question: string;
  slug: string | null;
  category: string | null;
  active: boolean | null;
  closed: boolean | null;
  volumeUsd: number | null;
  liquidityUsd: number | null;
  raw: JsonValue;
}

export interface AgentOpportunity {
  market: PolymarketMarketSnapshot;
  score: number;
  matchedSkills: string[];
}

type Runner = (args: string[]) => Promise<PolymarketCommandResult>;

interface PolymarketPolicy {
  cacheTtlMs: number;
  staleTtlMs: number;
  breakerFailureThreshold: number;
  breakerCooldownMs: number;
}

interface CachedResponse {
  value: PolymarketCommandResult;
  expiresAtMs: number;
  staleUntilMs: number;
}

interface CircuitBreakerState {
  consecutiveFailures: number;
  openedAtMs: number | null;
}

const polymarketBin = process.env.POLYMARKET_CLI_BIN || 'polymarket';
let runnerOverride: Runner | null = null;
let nowProvider: () => number = () => Date.now();

const responseCache = new Map<string, CachedResponse>();
const circuitBreakerState: CircuitBreakerState = {
  consecutiveFailures: 0,
  openedAtMs: null,
};

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
}

const defaultPolicy: PolymarketPolicy = {
  cacheTtlMs: parsePositiveIntEnv('POLYMARKET_CACHE_TTL_MS', DEFAULT_CACHE_TTL_MS),
  staleTtlMs: parsePositiveIntEnv('POLYMARKET_STALE_TTL_MS', DEFAULT_STALE_TTL_MS),
  breakerFailureThreshold: parsePositiveIntEnv(
    'POLYMARKET_BREAKER_FAILURE_THRESHOLD',
    DEFAULT_BREAKER_THRESHOLD
  ),
  breakerCooldownMs: parsePositiveIntEnv(
    'POLYMARKET_BREAKER_COOLDOWN_MS',
    DEFAULT_BREAKER_COOLDOWN_MS
  ),
};

let policy: PolymarketPolicy = { ...defaultPolicy };

function parseNumberish(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeTextToken(skill: string): string[] {
  return skill
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3);
}

function hasAnyToken(text: string, tokens: string[]): boolean {
  for (const token of tokens) {
    if (text.includes(token)) return true;
  }
  return false;
}

function cacheKey(args: string[]): string {
  return args.join('\u001f');
}

function pruneCache(nowMs: number): void {
  for (const [key, entry] of responseCache) {
    if (entry.staleUntilMs <= nowMs) {
      responseCache.delete(key);
    }
  }
}

function getCached(key: string, nowMs: number, allowStale: boolean): CachedResponse | null {
  const entry = responseCache.get(key);
  if (!entry) return null;

  if (entry.expiresAtMs > nowMs) return entry;
  if (allowStale && entry.staleUntilMs > nowMs) return entry;

  return null;
}

function setCached(key: string, value: PolymarketCommandResult, nowMs: number): void {
  responseCache.set(key, {
    value,
    expiresAtMs: nowMs + policy.cacheTtlMs,
    staleUntilMs: nowMs + policy.staleTtlMs,
  });
}

function circuitIsOpen(nowMs: number): boolean {
  if (circuitBreakerState.openedAtMs === null) return false;

  if (nowMs - circuitBreakerState.openedAtMs >= policy.breakerCooldownMs) {
    circuitBreakerState.openedAtMs = null;
    circuitBreakerState.consecutiveFailures = 0;
    return false;
  }

  return true;
}

function recordSuccess(): void {
  circuitBreakerState.consecutiveFailures = 0;
  circuitBreakerState.openedAtMs = null;
}

function recordFailure(nowMs: number): void {
  circuitBreakerState.consecutiveFailures += 1;
  if (circuitBreakerState.consecutiveFailures >= policy.breakerFailureThreshold) {
    circuitBreakerState.openedAtMs = nowMs;
  }
}

async function runPolymarketCommand(args: string[]): Promise<PolymarketCommandResult> {
  const commandArgs = ['-o', 'json', ...args];
  return new Promise<PolymarketCommandResult>((resolve, reject) => {
    const proc = spawn(polymarketBin, commandArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGKILL');
    }, DEFAULT_TIMEOUT_MS);

    proc.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= MAX_BUFFER_BYTES) {
        stdoutChunks.push(chunk);
      }
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes <= MAX_BUFFER_BYTES) {
        stderrChunks.push(chunk);
      }
    });

    proc.once('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`polymarket-cli unavailable: ${error.message}`));
    });

    proc.once('close', (code) => {
      clearTimeout(timer);

      if (timedOut) {
        reject(new Error('polymarket-cli command timed out'));
        return;
      }

      const stdout = Buffer.concat(stdoutChunks).toString('utf8').trim();
      const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();

      if (code !== 0) {
        reject(
          new Error(
            `polymarket-cli command failed (code=${code}): ${stderr || stdout || 'no output'}`
          )
        );
        return;
      }

      if (!stdout) {
        resolve(null);
        return;
      }

      try {
        const parsed = JSON.parse(stdout) as JsonValue;
        resolve(parsed);
      } catch (error) {
        reject(
          new Error(
            `polymarket-cli returned invalid json: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        );
      }
    });
  });
}

function activeClosedArgs(active?: boolean, closed?: boolean): string[] {
  const args: string[] = [];
  if (active !== undefined) args.push('--active', String(active));
  if (closed !== undefined) args.push('--closed', String(closed));
  return args;
}

function normalizeLimit(rawLimit?: number): number {
  const value = rawLimit ?? DEFAULT_LIMIT;
  if (!Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.round(value)));
}

function extractMarketSnapshot(raw: JsonValue): PolymarketMarketSnapshot | null {
  const item = toRecord(raw);
  if (!item) return null;

  const id = typeof item.id === 'string' ? item.id : typeof item.slug === 'string' ? item.slug : '';
  const question = typeof item.question === 'string' ? item.question : '';

  if (!id || !question) return null;

  const slug = typeof item.slug === 'string' ? item.slug : null;
  const category = typeof item.category === 'string' ? item.category : null;
  const active = typeof item.active === 'boolean' ? item.active : null;
  const closed = typeof item.closed === 'boolean' ? item.closed : null;
  const volumeUsd = parseNumberish(item.volume_num ?? item.volumeNum ?? item.volume);
  const liquidityUsd = parseNumberish(item.liquidity_num ?? item.liquidityNum ?? item.liquidity);

  return {
    id,
    question,
    slug,
    category,
    active,
    closed,
    volumeUsd,
    liquidityUsd,
    raw,
  };
}

function extractMarketList(payload: PolymarketCommandResult): PolymarketMarketSnapshot[] {
  if (!Array.isArray(payload)) return [];
  const markets: PolymarketMarketSnapshot[] = [];
  for (const item of payload) {
    const snapshot = extractMarketSnapshot(item as JsonValue);
    if (snapshot) markets.push(snapshot);
  }
  return markets;
}

function scoreOpportunity(market: PolymarketMarketSnapshot, agentSkills: string[]): AgentOpportunity {
  const text = `${market.question} ${market.category ?? ''} ${market.slug ?? ''}`.toLowerCase();
  const matchedSkills = agentSkills.filter((skill) => hasAnyToken(text, normalizeTextToken(skill)));

  let score = matchedSkills.length * 8;
  if (market.active) score += 2;
  if (market.volumeUsd !== null) score += Math.min(5, market.volumeUsd / 5_000_000);
  if (market.liquidityUsd !== null) score += Math.min(5, market.liquidityUsd / 1_000_000);

  return {
    market,
    score: Number(score.toFixed(4)),
    matchedSkills,
  };
}

function currentRunner(): Runner {
  return runnerOverride ?? runPolymarketCommand;
}

async function runWithPolicy(
  args: string[],
  options?: {
    cacheable?: boolean;
  }
): Promise<PolymarketCommandResult> {
  const cacheable = options?.cacheable ?? true;
  const nowMs = nowProvider();
  const key = cacheKey(args);

  pruneCache(nowMs);

  if (cacheable) {
    const warm = getCached(key, nowMs, false);
    if (warm) return warm.value;
  }

  if (circuitIsOpen(nowMs)) {
    if (cacheable) {
      const stale = getCached(key, nowMs, true);
      if (stale) return stale.value;
    }
    throw new Error('polymarket-cli circuit breaker is open');
  }

  try {
    const payload = await currentRunner()(args);
    recordSuccess();
    if (cacheable) {
      setCached(key, payload, nowMs);
    }
    return payload;
  } catch (error) {
    recordFailure(nowMs);
    if (cacheable) {
      const stale = getCached(key, nowMs, true);
      if (stale) return stale.value;
    }
    throw error;
  }
}

export function setPolymarketRunnerForTests(runner: Runner | null): void {
  runnerOverride = runner;
}

export function setPolymarketNowForTests(provider: (() => number) | null): void {
  nowProvider = provider ?? (() => Date.now());
}

export function setPolymarketPolicyForTests(overrides: Partial<PolymarketPolicy> | null): void {
  if (!overrides) {
    policy = { ...defaultPolicy };
    return;
  }

  policy = {
    cacheTtlMs: Math.max(1, Math.round(overrides.cacheTtlMs ?? policy.cacheTtlMs)),
    staleTtlMs: Math.max(1, Math.round(overrides.staleTtlMs ?? policy.staleTtlMs)),
    breakerFailureThreshold: Math.max(
      1,
      Math.round(overrides.breakerFailureThreshold ?? policy.breakerFailureThreshold)
    ),
    breakerCooldownMs: Math.max(
      1,
      Math.round(overrides.breakerCooldownMs ?? policy.breakerCooldownMs)
    ),
  };
}

export function resetPolymarketStateForTests(): void {
  responseCache.clear();
  circuitBreakerState.consecutiveFailures = 0;
  circuitBreakerState.openedAtMs = null;
  policy = { ...defaultPolicy };
  nowProvider = () => Date.now();
  runnerOverride = null;
}

export const polymarketIntelService = {
  async status(): Promise<PolymarketCommandResult> {
    return runWithPolicy(['status']);
  },

  async listMarkets(params?: {
    limit?: number;
    active?: boolean;
    closed?: boolean;
  }): Promise<PolymarketMarketSnapshot[]> {
    const limit = normalizeLimit(params?.limit);
    const args = [
      'markets',
      'list',
      '--limit',
      String(limit),
      ...activeClosedArgs(params?.active, params?.closed),
    ];
    const payload = await runWithPolicy(args);
    return extractMarketList(payload);
  },

  async searchMarkets(query: string, limit?: number): Promise<PolymarketMarketSnapshot[]> {
    const safeQuery = query.trim();
    if (!safeQuery) return [];
    const args = ['markets', 'search', safeQuery, '--limit', String(normalizeLimit(limit))];
    const payload = await runWithPolicy(args);
    return extractMarketList(payload);
  },

  async orderBook(tokenId: string): Promise<PolymarketCommandResult> {
    const clean = tokenId.trim();
    if (!/^\d+$/.test(clean)) {
      throw new Error('tokenId must be a numeric string');
    }
    return runWithPolicy(['clob', 'book', clean]);
  },

  rankAgentOpportunities(
    markets: PolymarketMarketSnapshot[],
    agentSkills: string[],
    limit?: number
  ): AgentOpportunity[] {
    const cappedLimit = normalizeLimit(limit);
    return markets
      .map((market) => scoreOpportunity(market, agentSkills))
      .filter((item) => item.matchedSkills.length > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, cappedLimit);
  },
};
