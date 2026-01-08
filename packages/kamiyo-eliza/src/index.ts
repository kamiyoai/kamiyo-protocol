import type { Plugin, KamiyoPluginConfig } from './types';
import {
  createEscrowAction,
  releaseEscrowAction,
  fileDisputeAction,
  consumeApiAction,
  checkReputationAction,
} from './actions';
import { walletProvider, escrowProvider, reputationProvider } from './providers';
import { qualityEvaluator, trustEvaluator } from './evaluators';
import { escrowMonitorService } from './services';

export const kamiyoPlugin: Plugin = {
  name: 'kamiyo',
  description: 'Escrow payments, dispute resolution, and reputation for autonomous agents on Solana.',
  actions: [
    createEscrowAction,
    releaseEscrowAction,
    fileDisputeAction,
    consumeApiAction,
    checkReputationAction,
  ],
  providers: [walletProvider, escrowProvider, reputationProvider],
  evaluators: [qualityEvaluator, trustEvaluator],
  services: [escrowMonitorService],
};

export function createKamiyoPlugin(config?: KamiyoPluginConfig): Plugin {
  return {
    ...kamiyoPlugin,
    name: `kamiyo-${config?.network || 'mainnet'}`,
  };
}

export * from './types';
export * from './actions';
export * from './providers';
export * from './evaluators';
export * from './services';
export * from './utils';

export default kamiyoPlugin;
