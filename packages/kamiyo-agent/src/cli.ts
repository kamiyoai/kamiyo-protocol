#!/usr/bin/env node

const args = process.argv.slice(2);
const command = args[0];

const HELP = `
kamiyo-agent — Self-improving agent framework

Commands:
  init              Scaffold a new agent project
  inspect <file>    Show agent config, tools, and selfimprove status
  run <file> [msg]  Run an agent from a file
  demo              Interactive demo with mock provider
  version           Show version

Options:
  --help, -h        Show this help
`;

async function main() {
  switch (command) {
    case 'init':
      await init();
      break;
    case 'inspect':
      await inspect(args[1]);
      break;
    case 'run':
      await run(args[1], args[2]);
      break;
    case 'demo':
      await demo();
      break;
    case 'version':
    case '--version':
    case '-v':
      version();
      break;
    default:
      console.log(HELP.trim());
  }
}

function version() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const pkg = require('../package.json');
    console.log(`@kamiyo-org/agent v${pkg.version}`);
  } catch {
    console.log('@kamiyo-org/agent (version unknown)');
  }
}

async function init() {
  const fs = await import('fs');

  const template = `import Anthropic from '@anthropic-ai/sdk';
import { createAgent, anthropicProvider } from '@kamiyo-org/agent';

const agent = createAgent({
  id: 'my-agent',
  provider: anthropicProvider(new Anthropic()),
  systemPrompt: 'You are a helpful assistant.',
});

async function main() {
  const result = await agent.run('Hello!');
  console.log(result.text);
  await agent.stop();
}

main();
`;

  const filename = 'agent.ts';
  if (fs.existsSync(filename)) {
    console.log(`${filename} already exists, skipping.`);
    return;
  }

  fs.writeFileSync(filename, template);
  console.log(`Created ${filename}`);
  console.log('\nNext steps:');
  console.log('  npm install @kamiyo-org/agent @anthropic-ai/sdk');
  console.log('  export ANTHROPIC_API_KEY=sk-...');
  console.log('  npx tsx agent.ts');
}

async function loadModule(file: string): Promise<Record<string, unknown>> {
  const path = await import('path');
  const resolved = path.resolve(file);

  if (resolved.endsWith('.ts') || resolved.endsWith('.mts') || resolved.endsWith('.cts')) {
    try {
      // tsx or ts-node register hook
      return await import(resolved);
    } catch {
      console.error(
        `Cannot load TypeScript file directly. Run with tsx:\n` +
          `  npx tsx ${process.argv.slice(1).join(' ')}`
      );
      process.exit(1);
    }
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(resolved);
  } catch {
    return await import(resolved);
  }
}

function findAgent(
  mod: Record<string, unknown>
): {
  id?: string;
  tools?: string[];
  config?: Record<string, unknown>;
  run?: (input: string) => Promise<unknown>;
  stop?: () => Promise<void>;
} | null {
  if (mod.default && typeof mod.default === 'object')
    return mod.default as ReturnType<typeof findAgent>;
  if (mod.agent && typeof mod.agent === 'object') return mod.agent as ReturnType<typeof findAgent>;
  return null;
}

async function inspect(file?: string) {
  if (!file) {
    console.error('Usage: kamiyo-agent inspect <file>');
    process.exit(1);
  }

  const mod = await loadModule(file);
  const agent = findAgent(mod);

  if (!agent) {
    console.error('File must export an Agent as default or named "agent"');
    process.exit(1);
  }

  console.log('Agent:');
  if (agent.id) console.log(`  id: ${agent.id}`);
  if (agent.config) {
    const c = agent.config as Record<string, unknown>;
    if (c.model) console.log(`  model: ${c.model}`);
    if (c.maxTurns) console.log(`  maxTurns: ${c.maxTurns}`);
    if (c.systemPrompt) console.log(`  systemPrompt: ${String(c.systemPrompt).slice(0, 80)}...`);
  }
  if (agent.tools && Array.isArray(agent.tools)) {
    console.log(`  tools: ${agent.tools.join(', ') || '(none)'}`);
  }
}

async function run(file?: string, message?: string) {
  if (!file) {
    console.error('Usage: kamiyo-agent run <file> [message]');
    process.exit(1);
  }

  const mod = await loadModule(file);

  // Option 1: module exports main()
  if (typeof mod.main === 'function') {
    await (mod.main as () => Promise<void>)();
    return;
  }

  // Option 2: module exports an Agent
  const agent = findAgent(mod);
  if (agent?.run) {
    const input = message ?? 'Hello!';
    const result = (await agent.run(input)) as { text: string };
    console.log(result.text);
    if (agent.stop) await agent.stop();
    return;
  }

  console.error('File must export main() or an Agent as default/named "agent"');
  process.exit(1);
}

async function demo() {
  const { createAgent, defineTool } = await import('./index');
  const { z } = await import('zod');
  const readline = await import('readline');

  let callCount = 0;

  const mockProvider = {
    name: 'demo',
    defaultModel: 'demo-v1',
    async chat(req: { messages: Array<{ content: unknown }>; tools?: unknown[] }) {
      const lastMsg = req.messages[req.messages.length - 1];
      const input = typeof lastMsg.content === 'string' ? lastMsg.content : '';
      callCount++;

      // Simulate tool use on first call if tools available
      if (req.tools && callCount === 1 && input.toLowerCase().includes('time')) {
        return {
          text: '',
          toolCalls: [{ id: 'demo-1', name: 'get_time', input: {} }],
          usage: { inputTokens: 50, outputTokens: 30 },
          stopReason: 'tool_use' as const,
        };
      }

      return {
        text: `[demo] I received: "${input.slice(0, 100)}"`,
        toolCalls: [],
        usage: { inputTokens: 50, outputTokens: 30 },
        stopReason: 'end' as const,
      };
    },
  };

  const agent = createAgent({
    id: 'demo-agent',
    provider: mockProvider as Parameters<typeof createAgent>[0]['provider'],
    systemPrompt: 'You are a demo agent.',
  });

  agent.useTool(
    defineTool({
      name: 'get_time',
      description: 'Get the current time',
      schema: z.object({}),
      handler: async () => new Date().toISOString(),
    })
  );

  agent.on('tool:call', ({ call }) => console.log(`  [tool] ${call.name}`));
  agent.on('tool:result', ({ result }) =>
    console.log(`  [tool] ${result.name} -> ${result.output}`)
  );

  console.log('@kamiyo-org/agent demo');
  console.log('Agent: demo-agent | Tools: get_time');
  console.log('Type a message (or "quit" to exit). Try "what time is it?"\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const prompt = () => {
    rl.question('> ', async input => {
      if (!input || input === 'quit' || input === 'exit') {
        await agent.stop();
        rl.close();
        return;
      }

      callCount = 0;
      const result = await agent.run(input);
      console.log(result.text);
      console.log(
        `  (${result.turns} turn${result.turns > 1 ? 's' : ''}, ${result.usage.inputTokens + result.usage.outputTokens} tokens)\n`
      );
      prompt();
    });
  };

  prompt();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
