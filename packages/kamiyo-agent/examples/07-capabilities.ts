/**
 * Using built-in capabilities.
 * Run: npx tsx examples/07-capabilities.ts
 */
import { createAgent } from '../src/index';
import { httpCapability, filesCapability } from '../../kamiyo-agent-capabilities/src/index';
import { tmpdir } from 'os';

const mockProvider = {
  name: 'mock',
  defaultModel: 'mock-v1',
  async chat() {
    return {
      text: 'I used the available tools.',
      toolCalls: [],
      usage: { inputTokens: 10, outputTokens: 10 },
      stopReason: 'end' as const,
    };
  },
};

async function main() {
  const agent = createAgent({ id: 'cap-agent', provider: mockProvider });

  // Register capabilities
  agent.use(httpCapability({
    allowedHosts: ['api.example.com'],
    timeout: 5_000,
  }));

  agent.use(filesCapability({
    rootDir: tmpdir(),
    allowWrite: false,
    maxFileSize: 1024 * 1024,
  }));

  console.log('Registered tools:', agent.tools);

  // Access a tool directly
  const listTool = agent.getTool('file_list');
  if (listTool) {
    const result = await listTool.handler({ path: '.', recursive: false }, {
      agentId: 'cap-agent',
      runId: 'test',
      signal: new AbortController().signal,
    });
    const files = JSON.parse(result as string);
    console.log(`\nFiles in tmpdir: ${files.length} entries`);
    console.log('First 3:', files.slice(0, 3).map((f: { name: string }) => f.name));
  }

  await agent.stop();
}

main().catch(console.error);
