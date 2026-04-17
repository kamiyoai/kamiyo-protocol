# @kamiyo-org/agent-multi

Multi-agent orchestration for [`@kamiyo-org/agent`](../kamiyo-agent). Channels, delegation, shared memory, and orchestrator.

## Install

```bash
npm install @kamiyo-org/agent-multi @kamiyo-org/agent
```

## Quickstart

```typescript
import { createAgent } from '@kamiyo-org/agent';
import { Channel, DelegationManager, Orchestrator } from '@kamiyo-org/agent-multi';

const channel = new Channel();
const delegation = new DelegationManager();

// Create worker agents
const researcher = createAgent({ id: 'researcher', provider });
const writer = createAgent({ id: 'writer', provider });

// Register workers with delegation handlers
delegation.registerWorker('researcher', async (d) => {
  const result = await researcher.run(d.task);
  return { result: result.text };
});

delegation.registerWorker('writer', async (d) => {
  const result = await writer.run(d.task);
  return { result: result.text };
});

// Create orchestrator
const orchestrator = new Orchestrator(
  { id: 'boss', workers: ['researcher', 'writer'] },
  channel,
  delegation,
);

// Assign work
const { result } = await orchestrator.assignTask('Research quantum computing');
console.log(result);
```

## Channel

Typed pub/sub messaging between agents.

```typescript
import { Channel } from '@kamiyo-org/agent-multi';

const channel = new Channel<string>();

// Subscribe to messages for a specific agent
const unsub = channel.subscribe('agent-a', (msg) => {
  console.log(`${msg.from} -> ${msg.to}: ${msg.payload}`);
});

// Send directed message
await channel.send('agent-b', 'agent-a', 'greeting', 'Hello!');

// Broadcast to all subscribers
await channel.broadcast('agent-b', 'announcement', 'System update');

// Message history
const history = channel.history('agent-a', 10);

unsub(); // unsubscribe
```

### Channel message shape

```typescript
interface ChannelMessage<T = unknown> {
  id: string;
  from: string;
  to: string;
  topic: string;
  payload: T;
  timestamp: number;
}
```

## Delegation

Assign tasks to worker agents and track results.

```typescript
import { DelegationManager } from '@kamiyo-org/agent-multi';

const delegation = new DelegationManager();

// Register a worker with a handler
delegation.registerWorker('worker-1', async (delegation) => {
  // delegation.task contains the task string
  // delegation.context contains optional metadata
  return { result: 'task completed' };
  // or: return { error: 'something went wrong' };
});

// Delegate a task
const result = await delegation.delegate(
  'orchestrator',    // from
  'worker-1',        // to
  'Analyze the data', // task
  { priority: 'high' }, // optional context
);

console.log(result.state);  // 'completed' or 'failed'
console.log(result.result); // 'task completed'

// List and filter delegations
delegation.listDelegations({ to: 'worker-1', state: 'completed' });

// Cleanup old delegations
delegation.prune(3_600_000); // remove completed delegations > 1 hour old
```

## Orchestrator

Routes tasks to workers using configurable strategies.

```typescript
import { Orchestrator } from '@kamiyo-org/agent-multi';

const orchestrator = new Orchestrator(
  {
    id: 'orchestrator',
    workers: ['agent-a', 'agent-b', 'agent-c'],
    routingStrategy: 'round-robin', // 'round-robin' | 'random' | 'custom'
  },
  channel,
  delegation,
);

// Assign to one worker (selected by strategy)
const { worker, result } = await orchestrator.assignTask('Do the thing');

// Fan out to all workers in parallel
const results = await orchestrator.fanOut('Analyze from your perspective');
// results: [{ worker: 'agent-a', result: '...' }, { worker: 'agent-b', result: '...' }, ...]

// Broadcast a message to all subscribers
await orchestrator.broadcast('status', { phase: 'complete' });
```

### Custom routing

```typescript
const orchestrator = new Orchestrator(
  {
    id: 'orchestrator',
    workers: ['researcher', 'writer', 'reviewer'],
    routingStrategy: 'custom',
    customRouter: (task, workers) => {
      if (task.includes('research')) return 'researcher';
      if (task.includes('write')) return 'writer';
      return 'reviewer';
    },
  },
  channel,
  delegation,
);
```

Workers must be registered in **both** the orchestrator config and the delegation manager. The orchestrator intersects the two lists to find available workers.

## Shared Memory

Cross-agent memory access. Agents write to their own memory via `@kamiyo-org/agent`; SharedMemory reads (and writes) across agent boundaries.

```typescript
import Database from 'better-sqlite3';
import { createAgent, applyAgentSchema } from '@kamiyo-org/agent';
import { SharedMemory } from '@kamiyo-org/agent-multi';

const db = new Database('shared.db');
applyAgentSchema(db);

// Agents share the same database
const agent1 = createAgent({ id: 'agent-1', provider, db });
const agent2 = createAgent({ id: 'agent-2', provider, db });

const shared = new SharedMemory(db);

// Write facts for any agent
shared.writeFact('agent-1', 'user.preference', 'dark mode', { confidence: 0.9 });

// Read another agent's facts
const fact = shared.readFact('agent-1', 'user.preference');
const allFacts = shared.readAllFacts('agent-1');

// Search across all agents
const results = shared.searchFacts({ key: 'user', minConfidence: 0.7 });

// Read episodes and goals
const episodes = shared.readEpisodes('agent-1', 10);
const goals = shared.readGoals('agent-1', 'active');

// Delete facts
shared.deleteFact('agent-1', 'user.preference');
```

## Patterns

### Supervisor pattern

```typescript
const supervisor = createAgent({ id: 'supervisor', provider, db });
const workers = ['analyst', 'coder', 'tester'].map(id =>
  createAgent({ id, provider, db })
);

const delegation = new DelegationManager();
workers.forEach(w => {
  delegation.registerWorker(w.id, async (d) => {
    const result = await w.run(d.task);
    return { result: result.text };
  });
});

const orchestrator = new Orchestrator(
  { id: 'supervisor', workers: workers.map(w => w.id) },
  new Channel(),
  delegation,
);

// Supervisor decides routing
const analysis = await orchestrator.assignTask('Analyze user retention data');
const code = await orchestrator.assignTask('Write a Python script to visualize it');
```

### Pipeline pattern

```typescript
delegation.registerWorker('step-1', async (d) => {
  const result = await agents[0].run(d.task);
  // Pass result to next step
  const next = await delegation.delegate('step-1', 'step-2', result.text);
  return { result: next.result };
});
```

## License

MIT
