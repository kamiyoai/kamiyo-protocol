# @kamiyo-org/agent

Self-improving agent framework. Tool-use native, goal-driven, with Thompson sampling + LLM-as-judge evolution built in.

## Install

```bash
npm install @kamiyo-org/agent zod
```

Optional peer dependencies:

```bash
npm install better-sqlite3          # memory, goals, selfimprove
npm install @kamiyo-org/selfimprove # self-improvement engine
```

## Quickstart

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { createAgent, anthropicProvider } from '@kamiyo-org/agent';

const agent = createAgent({
  id: 'my-agent',
  provider: anthropicProvider(new Anthropic()),
  systemPrompt: 'You are a helpful assistant.',
});

const result = await agent.run('What is 2 + 2?');
console.log(result.text);

await agent.stop();
```

## Providers

Four built-in provider adapters. Each takes your own SDK client instance — no SDK imports in this package.

```typescript
import { anthropicProvider, openaiProvider, geminiProvider, genericProvider } from '@kamiyo-org/agent';

// Anthropic
const provider = anthropicProvider(new Anthropic(), 'claude-sonnet-4-20250514');

// OpenAI
const provider = openaiProvider(new OpenAI(), 'gpt-4o');

// Gemini (@google/genai SDK)
const provider = geminiProvider(googleClient, 'gemini-2.0-flash');

// Any OpenAI-compatible endpoint (Ollama, vLLM, Together, etc.)
const provider = genericProvider({
  baseUrl: 'http://localhost:11434/v1',
  defaultModel: 'llama3',
  apiKey: 'optional',
});
```

Type-check your client against the exported interfaces:

```typescript
import type { AnthropicClient, OpenAIClient, GeminiClient } from '@kamiyo-org/agent';
```

### Provider failover

```typescript
import { failoverProvider } from '@kamiyo-org/agent';

const provider = failoverProvider([
  anthropicProvider(new Anthropic()),
  openaiProvider(new OpenAI()),
]);
```

Tries each provider in order. Falls back on error.

## Tools

Define tools with Zod schemas for validation + JSON Schema generation:

```typescript
import { z } from 'zod';
import { createAgent, defineTool } from '@kamiyo-org/agent';

const weatherTool = defineTool({
  name: 'get_weather',
  description: 'Get current weather for a city',
  schema: z.object({
    city: z.string(),
    units: z.enum(['celsius', 'fahrenheit']).optional(),
  }),
  handler: async (input) => {
    return JSON.stringify({ temp: 22, unit: input.units ?? 'celsius' });
  },
});

const agent = createAgent({ id: 'weather-bot', provider });
agent.useTool(weatherTool);

const result = await agent.run('What is the weather in Tokyo?');
```

### Capabilities

Group related tools as a capability:

```typescript
import type { Capability } from '@kamiyo-org/agent';

const myCapability: Capability = {
  name: 'my-tools',
  tools: [weatherTool, otherTool],
  async setup(agentId) { /* init resources */ },
  async teardown() { /* cleanup */ },
};

agent.use(myCapability);
```

See [`@kamiyo-org/agent-capabilities`](../kamiyo-agent-capabilities) for 8 built-in capabilities.

### Tool options

```typescript
defineTool({
  name: 'dangerous_action',
  description: '...',
  schema: z.object({ ... }),
  handler: async (input, ctx) => { ... },
  category: 'admin',
  requiresApproval: true,   // human-in-the-loop
  timeout: 60_000,          // override default timeout
  retry: { maxRetries: 3, initialDelayMs: 1000, backoffMultiplier: 2 },
});
```

## Memory

Requires `better-sqlite3`:

```typescript
import Database from 'better-sqlite3';

const agent = createAgent({
  id: 'mem-agent',
  provider,
  db: new Database('agent.db'),
});

await agent.run('My name is Alice.');

// Episodic — past interactions, FTS5 search
const episodes = agent.episodic.recall({ query: 'Alice' });

// Semantic — learned facts
agent.semantic.set('user.name', 'Alice');
agent.semantic.getValue('user.name'); // 'Alice'
agent.semantic.toContext(); // formatted string for system prompt
```

### Memory layers

| Layer | Storage | Access |
|-------|---------|--------|
| Working | In-memory | Auto-managed during runs |
| Episodic | SQLite FTS5 | `agent.episodic` |
| Semantic | SQLite KV | `agent.semantic` |
| Procedural | selfimprove variants | Automatic via promoted strategies |

### Compaction

Working memory auto-compacts when approaching token limits:

```typescript
import { WorkingMemory, Compactor } from '@kamiyo-org/agent';

const wm = new WorkingMemory({ maxTokens: 4000, strategy: 'summarize' });
const compactor = new Compactor({ provider }); // LLM-assisted summarization
await compactor.compact(wm);
```

Strategies: `summarize` (LLM), `truncate`, `sliding-window`.

## Goals

Hierarchical goal tracking with LLM-based task decomposition:

```typescript
const goal = agent.goals.createGoal({
  description: 'Send weekly performance report',
  successCriteria: 'Email sent with metrics attached',
  priority: 80,
});

const tasks = agent.goals.addTasks(goal.id, [
  { description: 'Fetch metrics data', tool: 'http_get', ordering: 0 },
  { description: 'Format report', ordering: 1 },
  { description: 'Send email', tool: 'email_send', ordering: 2 },
]);

// Track progress
agent.goals.computeProgress(goal.id); // 0

// Complete tasks
agent.goals.updateTaskState(tasks[0].id, 'completed');
agent.goals.computeProgress(goal.id); // 33.33
```

### Autonomous scheduler

```typescript
import { GoalScheduler } from '@kamiyo-org/agent';

const scheduler = new GoalScheduler(
  agent.goals,
  async (task) => {
    const result = await agent.run(`Execute: ${task.description}`);
    return { result: result.text };
  },
  agent.emitter,
  { intervalMs: 5000 },
);

scheduler.start();
// Scheduler ticks, picks highest-priority pending task, executes through agent
```

### LLM planner

```typescript
import { GoalPlanner } from '@kamiyo-org/agent';

const planner = new GoalPlanner({
  provider,
  model: 'claude-sonnet-4-20250514',
  maxTasks: 20,
});

const plan = await planner.plan(
  'Build a dashboard showing real-time sales data',
  ['http_get', 'file_write', 'code_execute'],
);
// plan.tasks: decomposed task list with dependencies
```

## Self-Improvement

Every interaction feeds Thompson sampling evolution. Requires `@kamiyo-org/selfimprove` + a database:

```typescript
const agent = createAgent({
  id: 'evolving-agent',
  provider,
  db: new Database('agent.db'),
  selfImprove: {
    enabled: true,
    judgeModel: 'claude-sonnet-4-20250514',
  },
});

// After ~50 interactions, better strategies auto-promote
// Agent's system prompt, temperature, model selection evolve
```

The selfimprove bridge:
- Routes interactions through Thompson sampling variants
- LLM-as-judge scores output quality
- Welch's t-test promotes winners at p < 0.05
- Promoted genome overrides apply to future runs

## Streaming

```typescript
for await (const event of agent.stream('Tell me a story')) {
  switch (event.type) {
    case 'text':
      process.stdout.write(event.text);
      break;
    case 'tool_call':
      console.log(`Calling ${event.name}...`);
      break;
    case 'tool_result':
      console.log(`Result: ${event.output}`);
      break;
    case 'done':
      console.log(`\nDone in ${event.result.durationMs}ms`);
      break;
  }
}
```

Falls back to non-streaming `chat()` if the provider doesn't implement `stream()`.

## Events

```typescript
agent.on('run:start', ({ runId, input }) => { ... });
agent.on('run:end', ({ runId, text, turns, durationMs }) => { ... });
agent.on('run:error', ({ runId, error }) => { ... });
agent.on('turn:start', ({ runId, turn }) => { ... });
agent.on('turn:end', ({ runId, turn, response }) => { ... });
agent.on('tool:call', ({ runId, call }) => { ... });
agent.on('tool:result', ({ runId, result }) => { ... });
agent.on('tool:error', ({ runId, toolName, error }) => { ... });
agent.on('improve:score', ({ runId, score, taskType }) => { ... });
agent.on('improve:promote', ({ taskType, variantId }) => { ... });
agent.on('improve:error', ({ taskType, error }) => { ... });
```

## Configuration

```typescript
createAgent({
  id: 'my-agent',           // required
  provider: ...,             // required — LLMProvider
  name: 'My Agent',         // display name (defaults to id)
  model: 'claude-sonnet-4-20250514',  // override provider default
  systemPrompt: '...',      // system message
  temperature: 0.7,         // 0-2 (default: 0.7)
  maxTokens: 4096,          // max output tokens (default: 4096)
  maxTurns: 10,             // max tool-use loops (default: 10)
  toolTimeoutMs: 30_000,    // per-tool timeout (default: 30s)
  onError: 'throw',         // 'throw' | 'return' (default: 'throw')
  db: new Database(...),     // SQLite for memory/goals/selfimprove
  selfImprove: { ... },     // selfimprove config
});
```

## Agent API

| Property / Method | Description |
|---|---|
| `agent.id` | Agent ID |
| `agent.config` | Resolved configuration |
| `agent.tools` | Registered tool names |
| `agent.getTool(name)` | Look up tool definition |
| `agent.registry` | Full ToolRegistry |
| `agent.emitter` | EventEmitter |
| `agent.db` | Database instance (if provided) |
| `agent.episodic` | EpisodicMemory (requires db) |
| `agent.semantic` | SemanticMemory (requires db) |
| `agent.goals` | GoalTracker (requires db) |
| `agent.selfImprove` | SelfImproveBridge |
| `agent.use(capability)` | Register a capability |
| `agent.useTool(tool)` | Register a single tool |
| `agent.on(event, handler)` | Subscribe to events |
| `agent.run(input, context?)` | Run agent (returns result) |
| `agent.stream(input, context?)` | Stream agent (async generator) |
| `agent.start()` | Initialize (auto-called by run/stream) |
| `agent.stop()` | Shutdown and cleanup |

## CLI

```bash
npx kamiyo-agent init          # scaffold agent.ts
npx kamiyo-agent inspect agent.ts  # show config + tools
npx kamiyo-agent run agent.ts "Hello"  # run agent
npx kamiyo-agent demo          # interactive demo with mock provider
npx kamiyo-agent version
```

## License

MIT
