/**
 * Agent with episodic and semantic memory.
 * Run: npx tsx examples/03-memory.ts
 */
import { createAgent, applyAgentSchema } from '../src/index';
import Database from 'better-sqlite3';

const mockProvider = {
  name: 'mock',
  defaultModel: 'mock-v1',
  async chat() {
    return {
      text: 'Noted.',
      toolCalls: [],
      usage: { inputTokens: 10, outputTokens: 5 },
      stopReason: 'end' as const,
    };
  },
};

async function main() {
  const db = new Database(':memory:');

  const agent = createAgent({
    id: 'mem-agent',
    provider: mockProvider,
    db,
  });

  // Run once to trigger schema creation
  await agent.run('Hello');

  // Episodic memory — store and recall interactions
  const epId = agent.episodic.store({ input: 'What is Kamiyo?', output: 'An agent framework.' });
  console.log('Stored episode:', epId);

  agent.episodic.store({ input: 'How does memory work?', output: 'SQLite FTS5 for recall.' });

  const recalled = agent.episodic.recall({ query: 'Kamiyo' });
  console.log('Recalled:', recalled.length, 'episodes');
  console.log('First match:', recalled[0]?.input);

  // Semantic memory — facts and preferences
  agent.semantic.set('user.name', 'Alice');
  agent.semantic.set('user.preference', 'dark mode', { confidence: 0.9 });

  console.log('\nFacts:');
  console.log('  user.name:', agent.semantic.getValue('user.name'));
  console.log('  user.preference:', agent.semantic.getValue('user.preference'));

  // Context string for system prompts
  console.log('\nSemantic context:');
  console.log(agent.semantic.toContext());

  await agent.stop();
}

main().catch(console.error);
