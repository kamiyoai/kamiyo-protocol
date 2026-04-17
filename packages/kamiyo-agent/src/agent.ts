import type { AgentConfig } from './config';
import { resolveConfig, type ResolvedConfig } from './config';
import type { RunContext, AgentRunResult, AgentStreamEvent } from './runtime';
import { executeTurn, executeStream } from './runtime';
import type { ToolDefinition, Capability } from './tool';
import { ToolRegistry } from './tool';
import { ToolExecutor } from './tool-executor';
import { EventEmitter, type AgentEventMap } from './events';
import { SelfImproveBridge } from './improve';
import { applyAgentSchema } from './schema';
import { EpisodicMemory } from './memory/episodic';
import { SemanticMemory } from './memory/semantic';
import { GoalTracker } from './goal/tracker';
import type { DB } from './db-types';

export class Agent {
  readonly config: ResolvedConfig;
  private rawConfig: AgentConfig;
  private toolRegistry = new ToolRegistry();
  private toolExecutor: ToolExecutor;
  private events = new EventEmitter();
  private capabilities: Capability[] = [];
  private bridge: SelfImproveBridge;
  private started = false;
  private _episodic?: EpisodicMemory;
  private _semantic?: SemanticMemory;
  private _goals?: GoalTracker;

  constructor(config: AgentConfig) {
    this.rawConfig = config;
    this.config = resolveConfig(config);
    this.toolExecutor = new ToolExecutor(this.toolRegistry, this.events, {
      defaultTimeout: this.config.toolTimeoutMs,
    });
    this.bridge = new SelfImproveBridge(this.config.id, config.selfImprove ?? {}, this.events);
  }

  use(capability: Capability): this {
    this.capabilities.push(capability);
    this.toolRegistry.registerCapability(capability);
    return this;
  }

  useTool(tool: ToolDefinition): this {
    this.toolRegistry.register(tool);
    return this;
  }

  on<K extends keyof AgentEventMap>(
    event: K,
    handler: (data: AgentEventMap[K]) => void
  ): () => void {
    return this.events.on(event, handler);
  }

  async start(): Promise<void> {
    if (this.started) return;

    if (this.rawConfig.db) {
      applyAgentSchema(this.rawConfig.db);
      await this.bridge.init(this.rawConfig.db);
      this.bridge.seedVariant(this.config.systemPrompt, this.config.model);
    }

    for (const cap of this.capabilities) {
      if (cap.setup) await cap.setup(this.config.id);
    }
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.bridge.shutdown();
    for (const cap of this.capabilities) {
      if (cap.teardown) await cap.teardown();
    }
    this.started = false;
  }

  async run(input: string, context?: RunContext): Promise<AgentRunResult> {
    if (!this.started) await this.start();
    return executeTurn(
      this.config,
      this.toolRegistry,
      this.toolExecutor,
      this.events,
      this.bridge,
      input,
      context
    );
  }

  async *stream(input: string, context?: RunContext): AsyncGenerator<AgentStreamEvent> {
    if (!this.started) await this.start();
    yield* executeStream(
      this.config,
      this.toolRegistry,
      this.toolExecutor,
      this.events,
      this.bridge,
      input,
      context
    );
  }

  get id(): string {
    return this.config.id;
  }

  get tools(): string[] {
    return this.toolRegistry.names();
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.toolRegistry.get(name);
  }

  get registry(): ToolRegistry {
    return this.toolRegistry;
  }

  get emitter(): EventEmitter {
    return this.events;
  }

  get db(): DB | undefined {
    return this.rawConfig.db;
  }

  get episodic(): EpisodicMemory {
    if (!this._episodic) {
      if (!this.rawConfig.db)
        throw new Error('EpisodicMemory requires a database. Pass { db } to createAgent().');
      this._episodic = new EpisodicMemory(this.rawConfig.db, this.config.id);
    }
    return this._episodic;
  }

  get semantic(): SemanticMemory {
    if (!this._semantic) {
      if (!this.rawConfig.db)
        throw new Error('SemanticMemory requires a database. Pass { db } to createAgent().');
      this._semantic = new SemanticMemory(this.rawConfig.db, this.config.id);
    }
    return this._semantic;
  }

  get goals(): GoalTracker {
    if (!this._goals) {
      if (!this.rawConfig.db)
        throw new Error('GoalTracker requires a database. Pass { db } to createAgent().');
      this._goals = new GoalTracker(this.rawConfig.db, this.config.id);
    }
    return this._goals;
  }

  get selfImprove(): SelfImproveBridge {
    return this.bridge;
  }
}

export function createAgent(config: AgentConfig): Agent {
  return new Agent(config);
}
