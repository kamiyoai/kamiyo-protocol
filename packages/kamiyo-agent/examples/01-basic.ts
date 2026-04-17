/**
 * Basic agent with a mock provider.
 * Run: npx tsx examples/01-basic.ts
 */
import { createAgent } from '../src/index';

const mockProvider = {
  name: 'mock',
  defaultModel: 'mock-v1',
  async chat() {
    return {
      text: 'Hello! I am your agent.',
      toolCalls: [],
      usage: { inputTokens: 10, outputTokens: 20 },
      stopReason: 'end' as const,
    };
  },
};

async function main() {
  const agent = createAgent({
    id: 'basic-agent',
    provider: mockProvider,
    systemPrompt: 'You are a helpful assistant.',
  });

  const result = await agent.run('Hello!');
  console.log('Text:', result.text);
  console.log('Turns:', result.turns);
  console.log('Usage:', result.usage);
  console.log('Duration:', result.durationMs, 'ms');

  await agent.stop();
}

main().catch(console.error);
