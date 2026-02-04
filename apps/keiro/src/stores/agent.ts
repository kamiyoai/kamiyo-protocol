import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, ApiAgent } from '../lib/api';

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
  globalId?: string;
}

interface AgentState {
  agent: Agent | null;
  walletAddress: string | null;
  isLoading: boolean;
  isSyncing: boolean;
  error: string | null;

  // Local actions
  setWalletAddress: (address: string | null) => void;
  clearAgent: () => void;

  // API-synced actions
  createAgent: (
    walletAddress: string,
    name: string,
    personality: AgentPersonality,
    skills: AgentSkill[]
  ) => Promise<void>;
  fetchAgent: (walletAddress: string) => Promise<void>;
  updateAgent: (updates: Partial<Pick<Agent, 'name' | 'personality' | 'skills'>>) => Promise<void>;
  toggleActive: () => Promise<void>;
  syncFromServer: () => Promise<void>;
}

function apiAgentToLocal(apiAgent: ApiAgent): Agent {
  return {
    id: apiAgent.id,
    name: apiAgent.name,
    personality: apiAgent.personality,
    skills: apiAgent.skills,
    tier: apiAgent.tier,
    creditScore: apiAgent.creditScore,
    tasksCompleted: apiAgent.tasksCompleted,
    disputeCount: apiAgent.disputeCount,
    tenureDays: apiAgent.tenureDays,
    avgQuality: apiAgent.avgQuality,
    isActive: apiAgent.isActive,
    createdAt: apiAgent.createdAt,
    globalId: apiAgent.globalId,
  };
}

export const useAgentStore = create<AgentState>()(
  persist(
    (set, get) => ({
      agent: null,
      walletAddress: null,
      isLoading: false,
      isSyncing: false,
      error: null,

      setWalletAddress: (address) => {
        set({ walletAddress: address });
      },

      clearAgent: () => {
        set({ agent: null, walletAddress: null, error: null });
      },

      createAgent: async (walletAddress, name, personality, skills) => {
        set({ isLoading: true, error: null });
        try {
          const apiAgent = await api.createAgent({
            walletAddress,
            name,
            personality,
            skills,
          });
          set({
            agent: apiAgentToLocal(apiAgent),
            walletAddress,
            isLoading: false,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to create agent';
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      fetchAgent: async (walletAddress) => {
        set({ isLoading: true, error: null });
        try {
          const apiAgent = await api.getAgentByWallet(walletAddress);
          if (apiAgent) {
            set({
              agent: apiAgentToLocal(apiAgent),
              walletAddress,
              isLoading: false,
            });
          } else {
            set({ agent: null, walletAddress, isLoading: false });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to fetch agent';
          set({ error: message, isLoading: false });
        }
      },

      updateAgent: async (updates) => {
        const { agent } = get();
        if (!agent) return;

        set({ isSyncing: true, error: null });
        try {
          const apiAgent = await api.updateAgent(agent.id, updates);
          set({
            agent: apiAgentToLocal(apiAgent),
            isSyncing: false,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to update agent';
          set({ error: message, isSyncing: false });
          throw error;
        }
      },

      toggleActive: async () => {
        const { agent } = get();
        if (!agent) return;

        set({ isSyncing: true, error: null });
        try {
          const apiAgent = await api.toggleAgentActive(agent.id);
          set({
            agent: apiAgentToLocal(apiAgent),
            isSyncing: false,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to toggle active status';
          set({ error: message, isSyncing: false });
          throw error;
        }
      },

      syncFromServer: async () => {
        const { agent } = get();
        if (!agent) return;

        set({ isSyncing: true });
        try {
          const apiAgent = await api.getAgent(agent.id);
          set({
            agent: apiAgentToLocal(apiAgent),
            isSyncing: false,
          });
        } catch (error) {
          set({ isSyncing: false });
        }
      },
    }),
    {
      name: 'keiro-agent-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        agent: state.agent,
        walletAddress: state.walletAddress,
      }),
    }
  )
);
