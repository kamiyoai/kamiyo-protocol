import Database from 'better-sqlite3';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { GoalTracker } from '../goal/tracker';
import { GoalScheduler, type TaskExecutor } from '../goal/scheduler';
import { GoalPlanner } from '../goal/planner';
import { EventEmitter } from '../events';
import { applyAgentSchema } from '../schema';
import type { LLMProvider } from '../provider';

function freshDb() {
  const db = new Database(':memory:');
  applyAgentSchema(db);
  return db;
}

describe('GoalTracker', () => {
  let db: InstanceType<typeof Database>;
  let tracker: GoalTracker;

  beforeEach(() => {
    db = freshDb();
    tracker = new GoalTracker(db, 'agent-1');
  });

  it('creates and retrieves goals', () => {
    const goal = tracker.createGoal({ description: 'Send weekly report' });
    expect(goal.id).toBeTruthy();
    expect(goal.description).toBe('Send weekly report');
    expect(goal.state).toBe('active');
    expect(goal.priority).toBe(50);

    const retrieved = tracker.getGoal(goal.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.description).toBe('Send weekly report');
  });

  it('lists goals by state', () => {
    tracker.createGoal({ description: 'goal 1' });
    const g2 = tracker.createGoal({ description: 'goal 2' });
    tracker.updateGoalState(g2.id, 'completed');

    expect(tracker.listGoals('active')).toHaveLength(1);
    expect(tracker.listGoals('completed')).toHaveLength(1);
    expect(tracker.listGoals()).toHaveLength(2);
  });

  it('respects priority ordering', () => {
    tracker.createGoal({ description: 'low', priority: 10 });
    tracker.createGoal({ description: 'high', priority: 90 });

    const goals = tracker.listGoals();
    expect(goals[0].description).toBe('high');
    expect(goals[1].description).toBe('low');
  });

  it('updates progress', () => {
    const goal = tracker.createGoal({ description: 'test' });
    tracker.updateProgress(goal.id, 0.5);

    const updated = tracker.getGoal(goal.id);
    expect(updated!.progress).toBe(0.5);
  });

  it('clamps progress to [0,1]', () => {
    const goal = tracker.createGoal({ description: 'test' });
    tracker.updateProgress(goal.id, 1.5);
    expect(tracker.getGoal(goal.id)!.progress).toBe(1);
    tracker.updateProgress(goal.id, -0.5);
    expect(tracker.getGoal(goal.id)!.progress).toBe(0);
  });

  it('saves plan JSON', () => {
    const goal = tracker.createGoal({ description: 'test' });
    tracker.savePlan(goal.id, JSON.stringify({ tasks: ['a', 'b'] }));
    expect(tracker.getGoal(goal.id)!.planJson).toContain('tasks');
  });

  it('marks failed with reason', () => {
    const goal = tracker.createGoal({ description: 'test' });
    tracker.updateGoalState(goal.id, 'failed', 'timeout');
    const g = tracker.getGoal(goal.id)!;
    expect(g.state).toBe('failed');
    expect(g.failedReason).toBe('timeout');
  });

  it('throws on empty description', () => {
    expect(() => tracker.createGoal({ description: '' })).toThrow('description required');
    expect(() => tracker.createGoal({ description: '  ' })).toThrow('description required');
  });

  it('clamps priority to 0-100', () => {
    const g1 = tracker.createGoal({ description: 'high', priority: 999 });
    const g2 = tracker.createGoal({ description: 'low', priority: -50 });
    expect(g1.priority).toBe(100);
    expect(g2.priority).toBe(0);
  });
});

describe('GoalTracker tasks', () => {
  let db: InstanceType<typeof Database>;
  let tracker: GoalTracker;

  beforeEach(() => {
    db = freshDb();
    tracker = new GoalTracker(db, 'agent-1');
  });

  it('adds and lists tasks', () => {
    const goal = tracker.createGoal({ description: 'parent' });
    tracker.addTask(goal.id, { description: 'step 1', ordering: 0 });
    tracker.addTask(goal.id, { description: 'step 2', ordering: 1 });

    const tasks = tracker.listTasks(goal.id);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].description).toBe('step 1');
    expect(tasks[1].description).toBe('step 2');
  });

  it('addTasks bulk insert', () => {
    const goal = tracker.createGoal({ description: 'parent' });
    const tasks = tracker.addTasks(goal.id, [
      { description: 'a', ordering: 0 },
      { description: 'b', ordering: 1 },
      { description: 'c', ordering: 2 },
    ]);
    expect(tasks).toHaveLength(3);
  });

  it('nextPendingTask respects ordering', () => {
    const goal = tracker.createGoal({ description: 'parent' });
    tracker.addTask(goal.id, { description: 'first', ordering: 0 });
    tracker.addTask(goal.id, { description: 'second', ordering: 1 });

    const next = tracker.nextPendingTask(goal.id);
    expect(next!.description).toBe('first');
  });

  it('nextPendingTask respects dependencies', () => {
    const goal = tracker.createGoal({ description: 'parent' });
    const t1 = tracker.addTask(goal.id, { description: 'dep', ordering: 0 });
    tracker.addTask(goal.id, { description: 'blocked', ordering: 1, dependsOn: t1.id });

    // first pending is t1
    expect(tracker.nextPendingTask(goal.id)!.description).toBe('dep');

    // mark t1 done, now blocked is available
    tracker.updateTaskState(t1.id, 'completed');
    expect(tracker.nextPendingTask(goal.id)!.description).toBe('blocked');
  });

  it('computeProgress tracks completion', () => {
    const goal = tracker.createGoal({ description: 'parent' });
    const t1 = tracker.addTask(goal.id, { description: 'a', ordering: 0 });
    tracker.addTask(goal.id, { description: 'b', ordering: 1 });

    expect(tracker.computeProgress(goal.id)).toBe(0);
    tracker.updateTaskState(t1.id, 'completed');
    expect(tracker.computeProgress(goal.id)).toBe(0.5);
  });

  it('task state transitions', () => {
    const goal = tracker.createGoal({ description: 'parent' });
    const task = tracker.addTask(goal.id, {
      description: 'work',
      tool: 'http_get',
      params: { url: 'https://example.com' },
    });

    expect(task.state).toBe('pending');
    expect(task.tool).toBe('http_get');
    expect(task.paramsJson).toContain('example.com');

    tracker.updateTaskState(task.id, 'in_progress');
    expect(tracker.getTask(task.id)!.state).toBe('in_progress');

    tracker.updateTaskState(task.id, 'completed', '{"status": 200}');
    const done = tracker.getTask(task.id)!;
    expect(done.state).toBe('completed');
    expect(done.resultJson).toContain('200');
  });

  it('failed task records error', () => {
    const goal = tracker.createGoal({ description: 'parent' });
    const task = tracker.addTask(goal.id, { description: 'fail' });
    tracker.updateTaskState(task.id, 'failed', undefined, 'connection refused');
    expect(tracker.getTask(task.id)!.errorText).toBe('connection refused');
  });
});

describe('GoalScheduler', () => {
  it('executes pending tasks in order', async () => {
    const db = freshDb();
    const tracker = new GoalTracker(db, 'agent-1');
    const events = new EventEmitter();
    const executed: string[] = [];

    const executor: TaskExecutor = async task => {
      executed.push(task.description);
      return { result: 'done' };
    };

    const goal = tracker.createGoal({ description: 'test goal' });
    tracker.addTasks(goal.id, [
      { description: 'task-a', ordering: 0 },
      { description: 'task-b', ordering: 1 },
    ]);

    const scheduler = new GoalScheduler(tracker, executor, events, { tickIntervalMs: 100_000 });

    // manual ticks
    await scheduler.tick();
    await scheduler.tick();

    expect(executed).toContain('task-a');
    expect(executed).toContain('task-b');

    // progress should be 1.0 after both complete
    expect(tracker.computeProgress(goal.id)).toBe(1);
  });

  it('handles task failures gracefully', async () => {
    const db = freshDb();
    const tracker = new GoalTracker(db, 'agent-1');
    const events = new EventEmitter();

    const executor: TaskExecutor = async () => {
      throw new Error('boom');
    };

    const goal = tracker.createGoal({ description: 'test' });
    tracker.addTask(goal.id, { description: 'will-fail', ordering: 0 });

    const scheduler = new GoalScheduler(tracker, executor, events, { tickIntervalMs: 100_000 });
    await scheduler.tick();

    const tasks = tracker.listTasks(goal.id);
    expect(tasks[0].state).toBe('failed');
    expect(tasks[0].errorText).toBe('boom');
  });

  it('start and stop lifecycle', () => {
    const db = freshDb();
    const tracker = new GoalTracker(db, 'agent-1');
    const events = new EventEmitter();
    const scheduler = new GoalScheduler(tracker, async () => ({}), events);

    scheduler.start();
    scheduler.stop();
    // no error = success
  });
});

describe('GoalPlanner', () => {
  it('decomposes goal via LLM', async () => {
    const mockProvider: LLMProvider = {
      name: 'mock',
      defaultModel: 'mock-model',
      chat: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          reasoning: 'simple decomposition',
          tasks: [
            { description: 'fetch data', tool: 'http_get', ordering: 0 },
            { description: 'process data', ordering: 1, dependsOn: '0' },
          ],
        }),
        toolCalls: [],
        usage: { inputTokens: 100, outputTokens: 200 },
        stopReason: 'end',
      }),
    };

    const planner = new GoalPlanner({ provider: mockProvider });
    const plan = await planner.decompose('analyze website', 'get key metrics', [
      'http_get',
      'web_scrape',
    ]);

    expect(plan.reasoning).toBe('simple decomposition');
    expect(plan.tasks).toHaveLength(2);
    expect(plan.tasks[0].tool).toBe('http_get');
    expect(plan.tasks[1].dependsOn).toBe('0');
  });

  it('handles malformed LLM response', async () => {
    const mockProvider: LLMProvider = {
      name: 'mock',
      defaultModel: 'mock-model',
      chat: vi.fn().mockResolvedValue({
        text: 'Just do the thing, no JSON here',
        toolCalls: [],
        usage: { inputTokens: 50, outputTokens: 30 },
        stopReason: 'end',
      }),
    };

    const planner = new GoalPlanner({ provider: mockProvider });
    const plan = await planner.decompose('test', null, []);

    expect(plan.tasks).toHaveLength(1);
    expect(plan.tasks[0].description).toBeTruthy();
  });

  it('caps task count to maxTasks', async () => {
    const tasks = Array.from({ length: 50 }, (_, i) => ({ description: `task ${i}`, ordering: i }));
    const mockProvider: LLMProvider = {
      name: 'mock',
      defaultModel: 'mock-model',
      chat: vi.fn().mockResolvedValue({
        text: JSON.stringify({ reasoning: 'many tasks', tasks }),
        toolCalls: [],
        usage: { inputTokens: 50, outputTokens: 200 },
        stopReason: 'end',
      }),
    };

    const planner = new GoalPlanner({ provider: mockProvider, maxTasks: 5 });
    const plan = await planner.decompose('test', null, []);
    expect(plan.tasks).toHaveLength(5);
  });

  it('strips self-referencing dependencies', async () => {
    const mockProvider: LLMProvider = {
      name: 'mock',
      defaultModel: 'mock-model',
      chat: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          reasoning: 'self-dep',
          tasks: [
            { description: 'a', ordering: 0, dependsOn: '0' },
            { description: 'b', ordering: 1, dependsOn: '99' },
          ],
        }),
        toolCalls: [],
        usage: { inputTokens: 50, outputTokens: 100 },
        stopReason: 'end',
      }),
    };

    const planner = new GoalPlanner({ provider: mockProvider });
    const plan = await planner.decompose('test', null, []);
    expect(plan.tasks[0].dependsOn).toBeUndefined(); // self-ref stripped
    expect(plan.tasks[1].dependsOn).toBeUndefined(); // out-of-bounds stripped
  });
});
