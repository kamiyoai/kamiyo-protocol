import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import Database from 'better-sqlite3';
import { createAgent } from '../agent';
import { applyAgentSchema } from '../schema';
import { EpisodicMemory } from '../memory/episodic';
import { SemanticMemory } from '../memory/semantic';
import { GoalTracker } from '../goal/tracker';
import type { LLMProvider, ChatRequest, ChatResponse } from '../provider';
import type { ToolDefinition } from '../tool';

// Stateful mock provider that can inspect messages and respond dynamically
function smartProvider(): { provider: LLMProvider; calls: ChatRequest[] } {
  const calls: ChatRequest[] = [];
  let callIdx = 0;

  const responses: ChatResponse[] = [
    // turn 1: agent decides to use calculator
    {
      text: '',
      toolCalls: [{ id: 'tc_1', name: 'calculator', input: { expression: '42 * 7' } }],
      usage: { inputTokens: 50, outputTokens: 30 },
      stopReason: 'tool_use',
    },
    // turn 2: agent decides to store result as fact
    {
      text: '',
      toolCalls: [{ id: 'tc_2', name: 'remember', input: { key: 'last_calc', value: '294' } }],
      usage: { inputTokens: 80, outputTokens: 25 },
      stopReason: 'tool_use',
    },
    // turn 3: agent gives final answer
    {
      text: 'The answer is 294. I calculated 42 × 7 and saved the result.',
      toolCalls: [],
      usage: { inputTokens: 100, outputTokens: 40 },
      stopReason: 'end',
    },
  ];

  const provider: LLMProvider = {
    name: 'smart-mock',
    defaultModel: 'smart-mock-v1',
    async chat(req: ChatRequest): Promise<ChatResponse> {
      calls.push({ ...req, messages: [...req.messages] });
      const resp = responses[callIdx];
      if (!resp) throw new Error(`No response for call ${callIdx}`);
      callIdx++;
      return resp;
    },
  };

  return { provider, calls };
}

// Real tools that do actual work
const calculatorTool: ToolDefinition<{ expression: string }, string> = {
  name: 'calculator',
  description: 'Evaluate a math expression',
  schema: z.object({ expression: z.string() }),
  handler: async input => {
    const result = Function(`"use strict"; return (${input.expression})`)();
    return String(result);
  },
};

function rememberTool(
  db: InstanceType<typeof Database>
): ToolDefinition<{ key: string; value: string }, string> {
  return {
    name: 'remember',
    description: 'Store a fact for later recall',
    schema: z.object({ key: z.string(), value: z.string() }),
    handler: async (input, ctx) => {
      const mem = new SemanticMemory(db, ctx.agentId);
      mem.set(input.key, input.value, { source: 'agent' });
      return `Stored: ${input.key} = ${input.value}`;
    },
  };
}

describe('E2E: Full agent lifecycle', () => {
  it('multi-turn conversation with tools, memory, events, and result tracking', async () => {
    const db = new Database(':memory:');
    applyAgentSchema(db);

    const { provider, calls } = smartProvider();
    const eventLog: string[] = [];

    const agent = createAgent({
      id: 'e2e-agent',
      name: 'E2E Test Agent',
      provider,
      systemPrompt: 'You are a helpful calculator assistant.',
      temperature: 0.3,
      maxTurns: 10,
      maxTokens: 2048,
      db,
    });

    agent.useTool(calculatorTool);
    agent.useTool(rememberTool(db));

    // register event handlers
    agent.on('run:start', e => eventLog.push(`start:${e.runId.slice(0, 8)}`));
    agent.on('turn:start', e => eventLog.push(`turn:${e.turn}`));
    agent.on('tool:call', e => eventLog.push(`tool:${e.call.name}`));
    agent.on('tool:result', e => eventLog.push(`result:${e.result.name}`));
    agent.on('run:end', e => eventLog.push(`end:turns=${e.turns}`));

    // run the conversation
    const result = await agent.run('What is 42 times 7? Save the result.');

    // --- Verify result ---
    expect(result.text).toBe('The answer is 294. I calculated 42 × 7 and saved the result.');
    expect(result.turns).toBe(3);
    expect(result.toolsUsed).toContain('calculator');
    expect(result.toolsUsed).toContain('remember');
    expect(result.usage.inputTokens).toBe(230); // 50 + 80 + 100
    expect(result.usage.outputTokens).toBe(95); // 30 + 25 + 40
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.runId).toBeTruthy();

    // --- Verify events fired in correct order ---
    expect(eventLog[0]).toMatch(/^start:/);
    expect(eventLog).toContain('turn:1');
    expect(eventLog).toContain('tool:calculator');
    expect(eventLog).toContain('result:calculator');
    expect(eventLog).toContain('turn:2');
    expect(eventLog).toContain('tool:remember');
    expect(eventLog).toContain('result:remember');
    expect(eventLog).toContain('turn:3');
    expect(eventLog).toContain('end:turns=3');

    // --- Verify provider received correct messages ---
    // call 1: just user message
    expect(calls[0].messages).toHaveLength(1);
    expect(calls[0].system).toBe('You are a helpful calculator assistant.');
    expect(calls[0].temperature).toBe(0.3);

    // call 2: user + assistant (tool_use) + user (tool_result)
    expect(calls[1].messages).toHaveLength(3);
    const assistMsg = calls[1].messages[1];
    expect(assistMsg.role).toBe('assistant');
    expect(Array.isArray(assistMsg.content)).toBe(true);

    const toolResultMsg = calls[1].messages[2];
    expect(toolResultMsg.role).toBe('user');
    expect(Array.isArray(toolResultMsg.content)).toBe(true);
    // verify calculator result is in the tool_result
    const toolResult = (toolResultMsg.content as any[]).find((c: any) => c.type === 'tool_result');
    expect(toolResult.content).toBe('294');

    // call 3: full history with both tool call/result pairs
    expect(calls[2].messages).toHaveLength(5);

    // --- Verify semantic memory was actually written ---
    const semanticMem = new SemanticMemory(db, 'e2e-agent');
    expect(semanticMem.getValue('last_calc')).toBe('294');

    // --- Verify tools are listed ---
    expect(agent.tools).toContain('calculator');
    expect(agent.tools).toContain('remember');

    // --- Clean shutdown ---
    await agent.stop();
  });

  it('streaming e2e with events', async () => {
    const db = new Database(':memory:');
    applyAgentSchema(db);

    const provider: LLMProvider = {
      name: 'stream-mock',
      defaultModel: 'model',
      async chat(): Promise<ChatResponse> {
        return {
          text: 'Streamed response here.',
          toolCalls: [],
          usage: { inputTokens: 15, outputTokens: 25 },
          stopReason: 'end',
        };
      },
    };

    const agent = createAgent({
      id: 'stream-e2e',
      provider,
      db,
    });

    const collected: string[] = [];
    let doneResult: any = null;

    for await (const event of agent.stream('Hello stream')) {
      collected.push(event.type);
      if (event.type === 'done') doneResult = event.result;
    }

    expect(collected).toContain('text');
    expect(collected).toContain('done');
    expect(doneResult).not.toBeNull();
    expect(doneResult.text).toBe('Streamed response here.');
    expect(doneResult.turns).toBe(1);

    await agent.stop();
  });

  it('goal tracker + task execution integration', async () => {
    const db = new Database(':memory:');
    applyAgentSchema(db);

    const tracker = new GoalTracker(db, 'planner-agent');

    // create a goal
    const goal = tracker.createGoal({
      description: 'Analyze competitor pricing',
      successCriteria: 'Report with 5+ competitor prices',
      priority: 80,
    });

    // decompose into tasks
    const tasks = tracker.addTasks(goal.id, [
      { description: 'Fetch competitor A pricing page', tool: 'http_get', ordering: 0 },
      { description: 'Fetch competitor B pricing page', tool: 'http_get', ordering: 1 },
      { description: 'Extract prices from HTML', tool: 'code_execute', ordering: 2 },
      { description: 'Generate comparison report', ordering: 3 },
    ]);

    expect(tasks).toHaveLength(4);
    expect(tracker.computeProgress(goal.id)).toBe(0);

    // simulate task execution
    tracker.updateTaskState(tasks[0].id, 'completed', '{"prices": [29, 49]}');
    tracker.updateTaskState(tasks[1].id, 'completed', '{"prices": [19, 39]}');
    expect(tracker.computeProgress(goal.id)).toBe(0.5);

    tracker.updateTaskState(tasks[2].id, 'completed', '{"extracted": true}');
    tracker.updateTaskState(tasks[3].id, 'completed', 'Report generated');
    expect(tracker.computeProgress(goal.id)).toBe(1);

    // goal should still be active until explicitly completed
    expect(tracker.getGoal(goal.id)!.state).toBe('active');
    tracker.updateGoalState(goal.id, 'completed');
    expect(tracker.getGoal(goal.id)!.state).toBe('completed');
    expect(tracker.getGoal(goal.id)!.completedAt).not.toBeNull();
  });

  it('episodic memory recall with FTS5', async () => {
    const db = new Database(':memory:');
    applyAgentSchema(db);

    const mem = new EpisodicMemory(db, 'recall-agent');

    // store several episodes
    mem.store({
      input: 'What is the weather in Tokyo?',
      output: 'Tokyo is currently 22°C and sunny.',
      tags: ['weather', 'tokyo'],
      qualityScore: 0.9,
    });
    mem.store({
      input: 'Calculate revenue for Q4',
      output: 'Q4 revenue was $2.3M, up 15% YoY.',
      tags: ['finance', 'revenue'],
      qualityScore: 0.95,
    });
    mem.store({
      input: 'What is the weather in London?',
      output: 'London is 14°C and rainy.',
      tags: ['weather', 'london'],
      qualityScore: 0.85,
    });

    // FTS5 search for weather
    const weatherResults = mem.recall({ query: 'weather' });
    expect(weatherResults.length).toBeGreaterThanOrEqual(2);
    expect(
      weatherResults.every(r => r.input.includes('weather') || r.output.includes('weather'))
    ).toBe(true);

    // FTS5 search for revenue
    const financeResults = mem.recall({ query: 'revenue' });
    expect(financeResults.length).toBeGreaterThanOrEqual(1);
    expect(financeResults[0].output).toContain('$2.3M');

    // recent recall
    const recent = mem.recent(2);
    expect(recent).toHaveLength(2);

    // count
    expect(mem.count()).toBe(3);
  });

  it('full restart cycle preserves nothing in-memory', async () => {
    const { provider } = smartProvider();

    const agent = createAgent({
      id: 'restart-test',
      provider,
      maxTurns: 10,
    });
    agent.useTool(calculatorTool);

    // first run
    const r1 = await agent.run('calc');
    expect(r1.turns).toBe(3);

    // stop and restart with fresh provider
    await agent.stop();

    // new provider for second run
    const provider2: LLMProvider = {
      name: 'fresh',
      defaultModel: 'model',
      async chat(): Promise<ChatResponse> {
        return {
          text: 'Fresh response',
          toolCalls: [],
          usage: { inputTokens: 5, outputTokens: 10 },
          stopReason: 'end',
        };
      },
    };

    const agent2 = createAgent({ id: 'restart-test', provider: provider2 });
    const r2 = await agent2.run('hi');
    expect(r2.text).toBe('Fresh response');
    expect(r2.turns).toBe(1);

    await agent2.stop();
  });
});
