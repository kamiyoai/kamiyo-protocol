/**
 * Streaming responses.
 * Run: npx tsx examples/05-streaming.ts
 */
import { createAgent } from '../src/index';

const mockProvider = {
  name: 'mock',
  defaultModel: 'mock-v1',
  async chat() {
    return {
      text: 'This is a streamed response from the mock provider.',
      toolCalls: [],
      usage: { inputTokens: 10, outputTokens: 15 },
      stopReason: 'end' as const,
    };
  },
};

async function main() {
  const agent = createAgent({ id: 'stream-agent', provider: mockProvider });

  console.log('Streaming:');
  for await (const event of agent.stream('Tell me something')) {
    switch (event.type) {
      case 'text':
        process.stdout.write(event.text);
        break;
      case 'tool_call':
        console.log(`\n  [tool] ${event.name}`);
        break;
      case 'tool_result':
        console.log(`  [result] ${event.output}`);
        break;
      case 'done':
        console.log(`\n\nDone: ${event.result.turns} turn(s), ${event.result.durationMs}ms`);
        break;
    }
  }

  await agent.stop();
}

main().catch(console.error);
