/**
 * Multi-agent orchestration with delegation and channels.
 * Run: npx tsx examples/06-multi-agent.ts
 */
import { createAgent } from '../src/index';
import { Channel, DelegationManager, Orchestrator } from '../../kamiyo-agent-multi/src/index';

function makeMockProvider(name: string) {
  return {
    name,
    defaultModel: 'mock-v1',
    async chat(req: { messages: Array<{ content: unknown }> }) {
      const last = req.messages[req.messages.length - 1];
      const input = typeof last.content === 'string' ? last.content : '';
      return {
        text: `[${name}] processed: ${input.slice(0, 80)}`,
        toolCalls: [],
        usage: { inputTokens: 20, outputTokens: 20 },
        stopReason: 'end' as const,
      };
    },
  };
}

async function main() {
  // Create specialist agents
  const researcher = createAgent({ id: 'researcher', provider: makeMockProvider('researcher') });
  const writer = createAgent({ id: 'writer', provider: makeMockProvider('writer') });

  // Set up delegation
  const delegation = new DelegationManager();
  const channel = new Channel();

  delegation.registerWorker('researcher', async (d) => {
    const result = await researcher.run(d.task);
    return { result: result.text };
  });

  delegation.registerWorker('writer', async (d) => {
    const result = await writer.run(d.task);
    return { result: result.text };
  });

  // Subscribe to channel messages
  channel.subscribe('researcher', (msg) => {
    console.log(`  [channel] ${msg.from} -> researcher: ${msg.topic}`);
  });

  // Create orchestrator
  const orchestrator = new Orchestrator(
    {
      id: 'boss',
      workers: ['researcher', 'writer'],
      routingStrategy: 'round-robin',
    },
    channel,
    delegation,
  );

  // Assign tasks (round-robin)
  console.log('Assigning tasks...\n');

  const r1 = await orchestrator.assignTask('Research quantum computing advances in 2025');
  console.log(`Task 1 -> ${r1.worker}: ${r1.result}\n`);

  const r2 = await orchestrator.assignTask('Write a summary of the findings');
  console.log(`Task 2 -> ${r2.worker}: ${r2.result}\n`);

  // Fan out to all workers
  console.log('Fan-out task...');
  const results = await orchestrator.fanOut('Analyze this dataset from your perspective');
  for (const r of results) {
    console.log(`  ${r.worker}: ${r.result}`);
  }

  // Broadcast
  await orchestrator.broadcast('status', { phase: 'complete' });

  await researcher.stop();
  await writer.stop();
}

main().catch(console.error);
