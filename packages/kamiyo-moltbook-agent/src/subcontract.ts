import Anthropic from '@anthropic-ai/sdk';
import type { KamiyoHive, AgentInfo, HiredAgent, DeliveryResult, Capability } from '@kamiyo/hive';
import type { Job, WorkResult } from './types.js';

export interface Subtask {
  id: string;
  type: Capability;
  spec: string;
  budget: number;
  priority: number;
  dependencies: string[];
}

export interface SubcontractAssignment {
  subtask: Subtask;
  agent: AgentInfo;
  escrowAddress?: string;
}

export interface SubcontractDelivery {
  subtaskId: string;
  deliverable: unknown;
  qualityScore?: number;
  paid: boolean;
}

export interface ComplexityAssessment {
  needsSubcontracting: boolean;
  subtasks: Subtask[];
  reason: string;
  estimatedTotalBudget: number;
}

const MAX_SUBTASKS = 10;
const MIN_SUBTASK_BUDGET = 0.001;
const MAX_SUBTASK_BUDGET = 10;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_TIMEOUT_MS = 30 * 60 * 1000;

const CAPABILITY_MAP: Record<string, Capability> = {
  'code': 'code-generation',
  'coding': 'code-generation',
  'programming': 'code-generation',
  'development': 'code-generation',
  'image': 'image-generation',
  'illustration': 'image-generation',
  'design': 'image-generation',
  'graphic': 'image-generation',
  'copy': 'copywriting',
  'copywriting': 'copywriting',
  'writing': 'copywriting',
  'content': 'copywriting',
  'review': 'code-review',
  'analysis': 'data-analysis',
  'data': 'data-analysis',
  'research': 'research',
};

export class SubcontractManager {
  private hive: KamiyoHive;
  private anthropic: Anthropic;
  private marginPercent: number;

  constructor(config: {
    hive: KamiyoHive;
    anthropic: Anthropic;
    marginPercent?: number;
  }) {
    this.hive = config.hive;
    this.anthropic = config.anthropic;
    this.marginPercent = config.marginPercent ?? 15;
  }

  async assessComplexity(job: Job): Promise<ComplexityAssessment> {
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: `Assess job complexity. Return JSON:
{"needsSubcontracting": bool, "reason": "...", "subtasks": [{"id": "...", "type": "capability", "spec": "...", "budget": 0.0, "priority": 1-5, "dependencies": []}]}

Capabilities: code-generation, image-generation, copywriting, code-review, data-analysis, research

Only subcontract if multiple distinct skills required. Budget per subtask: 0.01-0.5 SOL.`,
      messages: [
        {
          role: 'user',
          content: `Budget: ${job.amountSol} SOL\n\n${job.description}`,
        },
      ],
    });

    const text = response.content[0];
    if (text.type !== 'text') {
      return {
        needsSubcontracting: false,
        subtasks: [],
        reason: 'Failed to assess',
        estimatedTotalBudget: job.amountSol,
      };
    }

    try {
      const jsonMatch = text.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON');

      const parsed = JSON.parse(jsonMatch[0]) as {
        needsSubcontracting: boolean;
        reason: string;
        subtasks: Subtask[];
      };

      const validSubtasks = (parsed.subtasks || [])
        .slice(0, MAX_SUBTASKS)
        .filter((s) => s.id && s.type && s.spec)
        .map((s) => ({
          ...s,
          budget: Math.max(MIN_SUBTASK_BUDGET, Math.min(MAX_SUBTASK_BUDGET, s.budget || 0.01)),
          priority: Math.max(1, Math.min(5, s.priority || 3)),
          dependencies: Array.isArray(s.dependencies) ? s.dependencies : [],
        }));

      const totalSubtaskBudget = validSubtasks.reduce((sum, s) => sum + s.budget, 0);

      return {
        needsSubcontracting: Boolean(parsed.needsSubcontracting),
        subtasks: validSubtasks,
        reason: String(parsed.reason || 'No reason provided'),
        estimatedTotalBudget: totalSubtaskBudget,
      };
    } catch {
      return {
        needsSubcontracting: false,
        subtasks: [],
        reason: 'Parse error',
        estimatedTotalBudget: job.amountSol,
      };
    }
  }

  async findSubcontractors(subtasks: Subtask[]): Promise<Map<string, AgentInfo | null>> {
    const assignments = new Map<string, AgentInfo | null>();

    for (const subtask of subtasks) {
      const agent = await this.hive.findBestAgent(subtask.type, {
        minReputation: 500,
        maxPrice: subtask.budget,
      });

      assignments.set(subtask.id, agent);

      if (agent) {
        console.log(`[Subcontract] Found agent ${agent.id} for ${subtask.type}`);
      } else {
        console.log(`[Subcontract] No agent found for ${subtask.type}`);
      }
    }

    return assignments;
  }

  async createSubcontracts(
    subtasks: Subtask[],
    agents: Map<string, AgentInfo | null>
  ): Promise<SubcontractAssignment[]> {
    const assignments: SubcontractAssignment[] = [];

    for (const subtask of subtasks) {
      const agent = agents.get(subtask.id);
      if (!agent) {
        console.log(`[Subcontract] Skipping ${subtask.id} - no agent`);
        continue;
      }

      const result = await this.hive.hire({
        capability: subtask.type,
        spec: subtask.spec,
        budget: subtask.budget,
        qualityThreshold: 70,
        preferredAgents: [agent.id],
      });

      if (result) {
        assignments.push({
          subtask,
          agent,
          escrowAddress: result.escrowAddress,
        });
        console.log(`[Subcontract] Created escrow ${result.escrowAddress} for ${subtask.id}`);
      }
    }

    return assignments;
  }

  async awaitDeliveries(
    assignments: SubcontractAssignment[],
    timeoutMs = DEFAULT_TIMEOUT_MS
  ): Promise<SubcontractDelivery[]> {
    const effectiveTimeout = Math.min(timeoutMs, MAX_TIMEOUT_MS);
    const deliveries: SubcontractDelivery[] = [];

    const promises = assignments.map(async (assignment) => {
      if (!assignment.escrowAddress) {
        return {
          subtaskId: assignment.subtask.id,
          deliverable: null,
          paid: false,
        };
      }

      const result = await this.hive.awaitDelivery(assignment.escrowAddress, effectiveTimeout);

      return {
        subtaskId: assignment.subtask.id,
        deliverable: result.deliverable,
        qualityScore: result.qualityScore,
        paid: result.paid,
      };
    });

    const results = await Promise.all(promises);
    deliveries.push(...results);

    return deliveries;
  }

  async assembleDeliverables(
    job: Job,
    subtasks: Subtask[],
    deliveries: SubcontractDelivery[]
  ): Promise<WorkResult> {
    const deliveryMap = new Map(deliveries.map((d) => [d.subtaskId, d]));

    const parts: string[] = [];
    for (const subtask of subtasks) {
      const delivery = deliveryMap.get(subtask.id);
      if (delivery?.deliverable) {
        parts.push(`## ${subtask.type}\n\n${delivery.deliverable}`);
      }
    }

    if (parts.length === 0) {
      return {
        complete: false,
        deliverable: '',
        error: 'No deliverables received from subcontractors',
      };
    }

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: 'Assemble deliverables into cohesive output. Remove redundancy, ensure consistency.',
      messages: [
        {
          role: 'user',
          content: `Job: ${job.description}\n\nParts:\n${parts.join('\n\n---\n\n')}`,
        },
      ],
    });

    const text = response.content[0];
    if (text.type !== 'text') {
      return {
        complete: true,
        deliverable: parts.join('\n\n'),
      };
    }

    return {
      complete: true,
      deliverable: text.text,
    };
  }

  async executeWithSubcontractors(job: Job): Promise<WorkResult> {
    console.log(`[Subcontract] Assessing job ${job.id} complexity...`);

    const complexity = await this.assessComplexity(job);

    if (!complexity.needsSubcontracting || complexity.subtasks.length === 0) {
      console.log(`[Subcontract] Job ${job.id} doesn't need subcontracting: ${complexity.reason}`);
      return { complete: false, deliverable: '', error: 'NO_SUBCONTRACT_NEEDED' };
    }

    const margin = job.amountSol * (this.marginPercent / 100);
    const availableBudget = job.amountSol - margin;

    if (complexity.estimatedTotalBudget > availableBudget) {
      console.log(`[Subcontract] Budget insufficient: need ${complexity.estimatedTotalBudget}, have ${availableBudget}`);
      return { complete: false, deliverable: '', error: 'INSUFFICIENT_BUDGET' };
    }

    console.log(`[Subcontract] Decomposed into ${complexity.subtasks.length} subtasks`);

    const agents = await this.findSubcontractors(complexity.subtasks);

    const assignedCount = [...agents.values()].filter(Boolean).length;
    if (assignedCount < complexity.subtasks.length) {
      console.log(`[Subcontract] Only found agents for ${assignedCount}/${complexity.subtasks.length} subtasks`);
    }

    const assignments = await this.createSubcontracts(complexity.subtasks, agents);

    if (assignments.length === 0) {
      return { complete: false, deliverable: '', error: 'NO_SUBCONTRACTORS_AVAILABLE' };
    }

    console.log(`[Subcontract] Created ${assignments.length} subcontracts, awaiting deliveries...`);

    const deliveries = await this.awaitDeliveries(assignments);

    const successfulDeliveries = deliveries.filter((d) => d.deliverable);
    console.log(`[Subcontract] Received ${successfulDeliveries.length}/${assignments.length} deliveries`);

    if (successfulDeliveries.length === 0) {
      return { complete: false, deliverable: '', error: 'ALL_SUBCONTRACTORS_FAILED' };
    }

    return this.assembleDeliverables(job, complexity.subtasks, deliveries);
  }
}
