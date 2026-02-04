import { create } from 'zustand';

export type AgentPersonality = 'professional' | 'creative' | 'efficient' | 'balanced';

export type AgentSkill =
  | 'research'
  | 'writing'
  | 'code_review'
  | 'data_analysis'
  | 'translation'
  | 'general';

export type AgentTier = 'unverified' | 'bronze' | 'silver' | 'gold' | 'platinum';

export interface Agent {
  id: string;
  name: string;
  personality: AgentPersonality;
  skills: AgentSkill[];
  tier: AgentTier;
  creditScore: number;
  tasksCompleted: number;
  disputeCount: number;
  tenureDays: number;
  avgQuality: number;
  isActive: boolean;
  createdAt: string;
}

interface AgentState {
  agent: Agent | null;
  isLoading: boolean;
  error: string | null;

  createAgent: (name: string, personality: AgentPersonality, skills: AgentSkill[]) => void;
  updateAgent: (updates: Partial<Agent>) => void;
  setActive: (active: boolean) => void;
  clearAgent: () => void;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agent: null,
  isLoading: false,
  error: null,

  createAgent: (name, personality, skills) => {
    const newAgent: Agent = {
      id: `agent_${Date.now()}`,
      name,
      personality,
      skills,
      tier: 'unverified',
      creditScore: 0,
      tasksCompleted: 0,
      disputeCount: 0,
      tenureDays: 0,
      avgQuality: 0,
      isActive: false,
      createdAt: new Date().toISOString(),
    };

    set({ agent: newAgent });
  },

  updateAgent: updates => {
    const { agent } = get();
    if (!agent) return;

    set({
      agent: {
        ...agent,
        ...updates,
      },
    });
  },

  setActive: active => {
    const { agent } = get();
    if (!agent) return;

    set({
      agent: {
        ...agent,
        isActive: active,
      },
    });
  },

  clearAgent: () => {
    set({ agent: null, error: null });
  },
}));
