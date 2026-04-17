/**
 * Event system for monitoring agent runs.
 * Run: npx tsx examples/08-events.ts
 */
import { createAgent, defineTool } from '../src/index';
import { z } from 'zod';

let callNum = 0;

const mockProvider = {
  name: 'mock',
  defaultModel: 'mock-v1',
  async chat(req: { tools?: unknown[] }) {
    callNum++;
    if (callNum === 1 && req.tools) {
      return {
        text: '',
        toolCalls: [{ id: 'c1', name: 'compute', input: { expression: '2 + 2' } }],
        usage: { inputTokens: 20, outputTokens: 15 },
        stopReason: 'tool_use' as const,
      };
    }
    return {
      text: 'The answer is 4.',
      toolCalls: [],
      usage: { inputTokens: 30, outputTokens: 10 },
      stopReason: 'end' as const,
    };
  },
};

async function main() {
  const agent = createAgent({ id: 'event-agent', provider: mockProvider });

  agent.useTool(defineTool({
    name: 'compute',
    description: 'Evaluate a math expression',
    schema: z.object({ expression: z.string() }),
    handler: async (input) => String(eval(input.expression)),
  }));

  // Subscribe to all events
  agent.on('run:start', ({ runId }) => console.log(`[run:start] ${runId}`));
  agent.on('turn:start', ({ turn }) => console.log(`  [turn:start] turn ${turn}`));
  agent.on('tool:call', ({ call }) => console.log(`    [tool:call] ${call.name}(${JSON.stringify(call.input)})`));
  agent.on('tool:result', ({ result }) => console.log(`    [tool:result] ${result.name} -> ${result.output} (${result.durationMs}ms)`));
  agent.on('turn:end', ({ turn }) => console.log(`  [turn:end] turn ${turn}`));
  agent.on('run:end', ({ turns, durationMs }) => console.log(`[run:end] ${turns} turns, ${durationMs}ms`));

  const result = await agent.run('What is 2 + 2?');
  console.log('\nFinal:', result.text);

  await agent.stop();
}

main().catch(console.error);
