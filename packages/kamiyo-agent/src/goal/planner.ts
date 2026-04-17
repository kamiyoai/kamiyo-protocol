import type { LLMProvider } from '../provider';
import type { TaskInput } from './types';

export interface PlannerConfig {
  provider: LLMProvider;
  model?: string;
  maxTasks?: number;
}

export interface Plan {
  tasks: TaskInput[];
  reasoning: string;
}

export class GoalPlanner {
  private provider: LLMProvider;
  private model: string;
  private maxTasks: number;

  constructor(config: PlannerConfig) {
    this.provider = config.provider;
    this.model = config.model ?? config.provider.defaultModel;
    this.maxTasks = config.maxTasks ?? 20;
  }

  async decompose(
    goalDescription: string,
    successCriteria: string | null,
    availableTools: string[]
  ): Promise<Plan> {
    const toolList =
      availableTools.length > 0
        ? `Available tools: ${availableTools.join(', ')}`
        : 'No tools available — tasks should be conversational/analytical.';

    const response = await this.provider.chat({
      model: this.model,
      system: `You decompose goals into concrete, executable tasks. Each task should be a single atomic action.
Return valid JSON with this schema:
{
  "reasoning": "brief explanation of approach",
  "tasks": [
    {
      "description": "what to do",
      "tool": "tool_name or null",
      "params": { "key": "value" },
      "dependsOn": "task index (0-based) or null",
      "ordering": 0
    }
  ]
}
Keep tasks under ${this.maxTasks}. Order by dependency. Use tools when available and appropriate.`,
      messages: [
        {
          role: 'user',
          content: `Goal: ${goalDescription}${successCriteria ? `\nSuccess criteria: ${successCriteria}` : ''}\n\n${toolList}`,
        },
      ],
      maxTokens: 2048,
      temperature: 0.3,
    });

    return this.parsePlan(response.text);
  }

  private parsePlan(text: string): Plan {
    // extract JSON from response (may be wrapped in markdown)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        tasks: [{ description: text, ordering: 0 }],
        reasoning: 'Could not parse structured plan',
      };
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const rawTasks = (parsed.tasks ?? []).slice(0, this.maxTasks);
      const tasks: TaskInput[] = rawTasks.map((t: Record<string, unknown>, i: number) => {
        const depIdx = t.dependsOn != null ? Number(t.dependsOn) : NaN;
        const validDep = !isNaN(depIdx) && depIdx >= 0 && depIdx < rawTasks.length && depIdx !== i;
        return {
          description: String(t.description ?? '').slice(0, 2000),
          tool: t.tool ? String(t.tool) : undefined,
          params: t.params as Record<string, unknown> | undefined,
          dependsOn: validDep ? String(t.dependsOn) : undefined,
          ordering: typeof t.ordering === 'number' ? t.ordering : i,
        };
      });
      return { tasks, reasoning: String(parsed.reasoning ?? '') };
    } catch {
      return {
        tasks: [{ description: text, ordering: 0 }],
        reasoning: 'JSON parse failed, treating as single task',
      };
    }
  }
}
