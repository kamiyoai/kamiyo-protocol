/**
 * Copyright (c) 2025 KAMIYO
 * SPDX-License-Identifier: MIT
 */

import { PublicKey } from '@solana/web3.js';

export enum AgentType {
  Trading = 'Trading',
  Service = 'Service',
  Oracle = 'Oracle',
  Custom = 'Custom'
}

export interface AgentIdentity {
  pda: PublicKey;
  owner: PublicKey;
  name: string;
  type: AgentType;
  reputation: bigint;
  stakeAmount: bigint;
  isActive: boolean;
}

export interface CreateAgentParams {
  owner: PublicKey;
  name: string;
  type: AgentType;
  initialStake: number;
}

export interface AgentProvider {
  createAgent(params: CreateAgentParams): Promise<AgentIdentity>;
  getAgent(pda: PublicKey): Promise<AgentIdentity>;
  updateReputation(pda: PublicKey, delta: number): Promise<void>;
  listAgents(skip?: number, limit?: number): Promise<AgentIdentity[]>;
}

export interface Strategy {
  name: string;
  execute: (connection: any, pda: PublicKey) => Promise<ExecutionResult>;
}

export interface ExecutionResult {
  success: boolean;
  logs?: string[];
  unitsConsumed?: number;
  error?: string;
}

export interface TestResult {
  profitable: boolean;
  pnl: number;
  gasUsed: number;
  transactions: string[];
  executionResult: ExecutionResult;
}

export interface TestEnvironment {
  bootstrap(agent: AgentIdentity, amount: number): Promise<void>;
  execute(strategy: Strategy): Promise<TestResult>;
  timeTravel(slot: number): Promise<void>;
}
