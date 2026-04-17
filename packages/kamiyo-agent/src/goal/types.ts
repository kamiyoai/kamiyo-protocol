export type GoalState = 'active' | 'completed' | 'failed' | 'paused';
export type TaskState = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';

export interface GoalInput {
  description: string;
  successCriteria?: string;
  priority?: number;
  parentId?: string;
}

export interface Goal {
  id: string;
  agentId: string;
  description: string;
  successCriteria: string | null;
  state: GoalState;
  priority: number;
  parentId: string | null;
  progress: number;
  planJson: string | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  failedReason: string | null;
}

export interface TaskInput {
  description: string;
  tool?: string;
  params?: Record<string, unknown>;
  dependsOn?: string;
  ordering?: number;
}

export interface Task {
  id: string;
  goalId: string;
  description: string;
  state: TaskState;
  tool: string | null;
  paramsJson: string | null;
  resultJson: string | null;
  errorText: string | null;
  dependsOn: string | null;
  ordering: number;
  createdAt: number;
  completedAt: number | null;
}
