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

export const kamiyoPlugin: Plugin = {
  name: 'kamiyo',
  description: 'Escrow, disputes, and reputation for autonomous agents.',
  actions: [
    createEscrowAction,
    releaseEscrowAction,
    fileDisputeAction,
    consumeApiAction,
    checkReputationAction,
  ],
  providers: [walletProvider, escrowProvider, reputationProvider],
  evaluators: [qualityEvaluator, trustEvaluator],
};

export function createKamiyoPlugin(config?: KamiyoPluginConfig): Plugin {
  return { ...kamiyoPlugin, name: `kamiyo-${config?.network || 'devnet'}` };
}

export * from './types';
export * from './actions';
export * from './providers';
export * from './evaluators';
export * from './utils';

export default kamiyoPlugin;
