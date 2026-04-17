/**
 * Goal tracking and task management.
 * Run: npx tsx examples/04-goals.ts
 */
import { createAgent, applyAgentSchema } from '../src/index';
import Database from 'better-sqlite3';

const mockProvider = {
  name: 'mock',
  defaultModel: 'mock-v1',
  async chat() {
    return {
      text: 'Done.',
      toolCalls: [],
      usage: { inputTokens: 10, outputTokens: 5 },
      stopReason: 'end' as const,
    };
  },
};

async function main() {
  const db = new Database(':memory:');
  const agent = createAgent({ id: 'goal-agent', provider: mockProvider, db });
  await agent.run('init'); // trigger schema

  // Create a goal
  const goal = agent.goals.createGoal({
    description: 'Send weekly performance report',
    successCriteria: 'Email sent with metrics',
    priority: 80,
  });
  console.log('Goal:', goal.id, '| State:', goal.state);

  // Add tasks
  const tasks = agent.goals.addTasks(goal.id, [
    { description: 'Fetch metrics from API', tool: 'http_get', ordering: 0 },
    { description: 'Format report as HTML', ordering: 1 },
    { description: 'Send email to team', tool: 'email_send', ordering: 2 },
  ]);
  console.log('Tasks:', tasks.length);

  // Track progress
  console.log('Progress:', Math.round(agent.goals.computeProgress(goal.id) * 100), '%');

  // Complete tasks one by one
  agent.goals.updateTaskState(tasks[0].id, 'completed', '{"rows": 42}');
  console.log('After task 1:', Math.round(agent.goals.computeProgress(goal.id) * 100), '%');

  agent.goals.updateTaskState(tasks[1].id, 'completed');
  console.log('After task 2:', Math.round(agent.goals.computeProgress(goal.id) * 100), '%');

  // Check next pending task
  const next = agent.goals.nextPendingTask(goal.id);
  console.log('Next task:', next?.description);

  agent.goals.updateTaskState(tasks[2].id, 'completed');
  console.log('After task 3:', Math.round(agent.goals.computeProgress(goal.id) * 100), '%');

  // Goal auto-completes when all tasks done
  const updated = agent.goals.getGoal(goal.id);
  console.log('Goal state:', updated?.state);

  await agent.stop();
}

main().catch(console.error);
