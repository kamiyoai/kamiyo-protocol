import type { EventEmitter } from '../events';

// selfimprove types — optional peer dep, all access through try/require
interface SelfImproveAPI {
  initSelfImprove(opts: {
    db: unknown;
    judgeLLM: unknown | null;
    logger?: unknown;
    metrics?: unknown;
  }): void;
  applySchema(db: unknown): void;
  createVariant(input: {
    agentId: string;
    taskType: string;
    genome: AgentGenome;
    notes?: string | null;
  }): { variant: { id: string }; created: boolean };
  maybeRouteVariant(taskType: string): RouteDecision | null;
  applyGenomeOverrides(decision: RouteDecision | null, defaults: GenomeOverrides): GenomeOverrides;
  recordVariantEntry(
    decision: RouteDecision | null,
    params: { input: string; output: string; latencyMs: number; costUsd?: number }
  ): void;
  upsertRubric(input: {
    taskType: string;
    rubric: string;
    modelId?: string;
    dailyBudgetUsd?: number;
  }): void;
  getOrCreateStandingTournament(taskType: string): { id: string };
  recordTournamentEntry(params: {
    tournamentId: string;
    variantId: string;
    performanceEventId?: string | null;
    qualityScore?: number | null;
    cost?: number | null;
    latencyMs?: number | null;
    outcome?: string | null;
  }): { ok: true; totalCost: number } | { ok: false; error: string };
  scoreOutput(params: {
    taskType: string;
    input: string;
    output: string;
    variantId?: string | null;
  }): Promise<JudgeResult>;
  sweepPromotions(opts?: { minSamples?: number; pThreshold?: number }): Promise<SweepResult[]>;
}

interface AgentGenome {
  promptTemplate: string;
  modelId: string;
  toolAllowlist: string[];
  temperature: number;
  maxTokens: number;
  systemGuardrails: string;
}

interface RouteDecision {
  variant: { id: string; genome: AgentGenome; status: string };
  tournamentId: string;
  decisionId: string;
  strategy: 'thompson' | 'promoted' | 'fallback';
}

interface GenomeOverrides {
  model: string;
  system: string;
  temperature: number;
  maxTokens: number;
}

interface JudgeResult {
  ok: boolean;
  score?: number;
  rationale?: string;
  error?: string;
}

interface SweepResult {
  taskType: string;
  promoted: boolean;
  reason?: string;
  variantId?: string;
}

export interface SelfImproveConfig {
  enabled?: boolean;
  taskType?: string;
  autoScore?: boolean;
  autoMutate?: boolean;
  rubric?: string;
  rubricModel?: string;
  rubricBudgetUsd?: number;
  minSamples?: number;
  pThreshold?: number;
  sweepIntervalMs?: number;
}

export interface SelfImproveInitOptions {
  judgeLLM?: unknown | null;
  logger?: unknown;
  metrics?: unknown;
}

export interface BridgeOverrides {
  model: string;
  system: string;
  temperature: number;
  maxTokens: number;
}

export class SelfImproveBridge {
  private api: SelfImproveAPI | null = null;
  private decision: RouteDecision | null = null;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  constructor(
    private agentId: string,
    private config: SelfImproveConfig,
    private events: EventEmitter
  ) {}

  get enabled(): boolean {
    return this.config.enabled !== false && this.api !== null;
  }

  get taskType(): string {
    return this.config.taskType ?? this.agentId;
  }

  get currentVariantId(): string | null {
    return this.decision?.variant.id ?? null;
  }

  get currentStrategy(): RouteDecision['strategy'] | null {
    return this.decision?.strategy ?? null;
  }

  async init(db: unknown, init?: SelfImproveInitOptions): Promise<void> {
    if (this.initialized) return;

    this.api = loadSelfImprove();
    if (!this.api) return;

    this.api.initSelfImprove({
      db,
      judgeLLM: init?.judgeLLM ?? null,
      logger: init?.logger,
      metrics: init?.metrics,
    });
    this.api.applySchema(db);

    if (this.config.rubric) {
      this.api.upsertRubric({
        taskType: this.taskType,
        rubric: this.config.rubric,
        modelId: this.config.rubricModel,
        dailyBudgetUsd: this.config.rubricBudgetUsd ?? 5,
      });
    }

    const interval = this.config.sweepIntervalMs ?? 86_400_000;
    this.sweepTimer = setInterval(() => this.sweep(), interval);
    this.sweepTimer.unref();

    this.initialized = true;
  }

  routeVariant(): RouteDecision | null {
    if (!this.api || !this.enabled) return null;
    this.decision = this.api.maybeRouteVariant(this.taskType);
    return this.decision;
  }

  getOverrides(defaults: BridgeOverrides): BridgeOverrides {
    if (!this.api || !this.decision) return defaults;
    const overrides = this.api.applyGenomeOverrides(this.decision, defaults);
    return {
      model: overrides.model || defaults.model,
      system: overrides.system || defaults.system,
      temperature: clamp(overrides.temperature, 0, 2, defaults.temperature),
      maxTokens: overrides.maxTokens >= 1 ? Math.floor(overrides.maxTokens) : defaults.maxTokens,
    };
  }

  recordInteraction(params: {
    input: string;
    output: string;
    latencyMs: number;
    costUsd?: number;
  }): void {
    if (!this.api || !this.enabled) return;
    this.api.recordVariantEntry(this.decision, {
      input: params.input,
      output: params.output,
      latencyMs: params.latencyMs,
      costUsd: params.costUsd,
    });
  }

  recordOutcomeScore(params: {
    qualityScore: number;
    latencyMs?: number;
    costUsd?: number;
    outcome?: string | null;
    variantId?: string | null;
  }): boolean {
    if (!this.api || !this.enabled) return false;
    const variantId = params.variantId ?? this.decision?.variant.id ?? null;
    if (!variantId) return false;

    try {
      const tournament = this.api.getOrCreateStandingTournament(this.taskType);
      const result = this.api.recordTournamentEntry({
        tournamentId: tournament.id,
        variantId,
        qualityScore: params.qualityScore,
        cost: params.costUsd ?? null,
        latencyMs: params.latencyMs ?? null,
        outcome: params.outcome ?? null,
      });
      if (!result.ok) {
        this.events.emit('improve:error', {
          taskType: this.taskType,
          error: result.error,
        });
      }
      return result.ok;
    } catch (error) {
      this.events.emit('improve:error', {
        taskType: this.taskType,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async scoreInteraction(params: {
    input: string;
    output: string;
    runId?: string;
    variantId?: string;
  }): Promise<number | null> {
    if (!this.api || !this.enabled || this.config.autoScore === false) return null;
    const result = await this.api.scoreOutput({
      taskType: this.taskType,
      input: params.input,
      output: params.output,
      variantId: params.variantId ?? this.decision?.variant.id ?? null,
    });
    if (result.ok && result.score !== undefined) {
      this.events.emit('improve:score', {
        runId: params.runId ?? '',
        score: result.score,
        taskType: this.taskType,
      });
      return result.score;
    }
    if (result.error) {
      this.events.emit('improve:error', {
        taskType: this.taskType,
        error: result.error,
      });
    }
    return null;
  }

  async sweep(): Promise<SweepResult[]> {
    if (!this.api) return [];
    const results = await this.api.sweepPromotions({
      minSamples: this.config.minSamples ?? 50,
      pThreshold: this.config.pThreshold ?? 0.05,
    });
    for (const r of results) {
      if (r.promoted && r.variantId) {
        this.events.emit('improve:promote', {
          taskType: r.taskType,
          variantId: r.variantId,
        });
      }
    }
    return results;
  }

  shutdown(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  seedVariant(
    systemPrompt: string,
    model: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      toolAllowlist?: string[];
      systemGuardrails?: string;
    }
  ): void {
    if (!this.api || !systemPrompt) return;
    this.api.createVariant({
      agentId: this.agentId,
      taskType: this.taskType,
      genome: this.buildGenome(systemPrompt, model, options),
    });
  }

  private buildGenome(
    promptTemplate: string,
    modelId: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      toolAllowlist?: string[];
      systemGuardrails?: string;
    }
  ): AgentGenome {
    return {
      promptTemplate,
      modelId,
      toolAllowlist: Array.isArray(options?.toolAllowlist)
        ? [...new Set(options.toolAllowlist.filter(tool => typeof tool === 'string' && tool.trim()))]
        : [],
      temperature:
        typeof options?.temperature === 'number' && Number.isFinite(options.temperature)
          ? options.temperature
          : 0.7,
      maxTokens:
        typeof options?.maxTokens === 'number' && Number.isFinite(options.maxTokens)
          ? Math.max(1, Math.floor(options.maxTokens))
          : 4096,
      systemGuardrails: options?.systemGuardrails ?? '',
    };
  }
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || isNaN(value)) return fallback;
  if (value < min || value > max) return fallback;
  return value;
}

function loadSelfImprove(): SelfImproveAPI | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    return require('@kamiyo-org/selfimprove') as SelfImproveAPI;
  } catch {
    return null;
  }
}
