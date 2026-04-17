/**
 * Agent with custom tools and simulated tool use.
 * Run: npx tsx examples/02-tools.ts
 */
import { createAgent, defineTool } from '../src/index';
import { z } from 'zod';

let callCount = 0;

const mockProvider = {
  name: 'mock',
  defaultModel: 'mock-v1',
  async chat(req: { tools?: unknown[] }) {
    callCount++;

    // First call: use the tool
    if (callCount === 1 && req.tools) {
      return {
        text: '',
        toolCalls: [{ id: 'call-1', name: 'get_weather', input: { city: 'Tokyo', units: 'celsius' } }],
        usage: { inputTokens: 30, outputTokens: 20 },
        stopReason: 'tool_use' as const,
      };
    }

    // Second call: respond with tool result
    return {
      text: 'The weather in Tokyo is 22C and sunny!',
      toolCalls: [],
      usage: { inputTokens: 50, outputTokens: 20 },
      stopReason: 'end' as const,
    };
  },
};

const weatherTool = defineTool({
  name: 'get_weather',
  description: 'Get current weather for a city',
  schema: z.object({
    city: z.string(),
    units: z.enum(['celsius', 'fahrenheit']).optional(),
  }),
  handler: async (input) => {
    console.log(`  [tool] get_weather called for ${input.city}`);
    return JSON.stringify({ temp: 22, condition: 'sunny', unit: input.units ?? 'celsius' });
  },
});

async function main() {
  const agent = createAgent({
    id: 'tool-agent',
    provider: mockProvider,
  });

  agent.useTool(weatherTool);
  console.log('Tools:', agent.tools);

  const result = await agent.run('What is the weather in Tokyo?');
  console.log('Result:', result.text);
  console.log('Tools used:', result.toolsUsed);
  console.log('Turns:', result.turns);

  await agent.stop();
}

main().catch(console.error);
