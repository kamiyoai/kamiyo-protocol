/**
 * ElizaOS Plugin for Radr ShadowPay
 *
 * Enables ElizaOS agents to:
 * - Send/receive private payments via ShadowWire
 * - Create escrows with hidden amounts
 * - Access reputation-gated pools
 * - File and resolve disputes privately
 *
 * @example
 * ```typescript
 * import { radrPlugin } from '@kamiyo/radr/eliza';
 *
 * const agent = new AgentRuntime({
 *   plugins: [radrPlugin],
 *   // ...
 * });
 * ```
 */

import type { Plugin, RadrPluginConfig } from './types';
import {
  radrActions,
  privateTransferAction,
  checkShieldedBalanceAction,
  createPrivateEscrowAction,
  checkReputationGateAction,
  filePrivateDisputeAction,
  depositToPoolAction,
} from './actions';
import {
  radrProviders,
  shieldedBalanceProvider,
  reputationTierProvider,
  shadowPayStatusProvider,
  privateEscrowProvider,
} from './providers';

/**
 * Radr ShadowPay Plugin for ElizaOS
 *
 * Pre-configured plugin with all actions and providers.
 */
export const radrPlugin: Plugin = {
  name: 'radr-shadowpay',
  description: 'Private payments via Radr ShadowWire with Kamiyo escrow and dispute resolution.',
  actions: radrActions,
  providers: radrProviders,
};

/**
 * Create customized Radr plugin
 *
 * @param config - Plugin configuration
 * @returns Configured plugin instance
 *
 * @example
 * ```typescript
 * const plugin = createRadrPlugin({
 *   network: 'mainnet',
 *   qualityThreshold: 80,
 *   autoDispute: true,
 * });
 * ```
 */
export function createRadrPlugin(config?: RadrPluginConfig): Plugin {
  return {
    ...radrPlugin,
    name: `radr-shadowpay-${config?.network || 'mainnet'}`,
  };
}

// Re-export types
export type { Plugin, RadrPluginConfig, IAgentRuntime, Memory, State, Action, Provider } from './types';

// Re-export individual actions for selective use
export {
  privateTransferAction,
  checkShieldedBalanceAction,
  createPrivateEscrowAction,
  checkReputationGateAction,
  filePrivateDisputeAction,
  depositToPoolAction,
  radrActions,
};

// Re-export providers
export {
  shieldedBalanceProvider,
  reputationTierProvider,
  shadowPayStatusProvider,
  privateEscrowProvider,
  radrProviders,
};

export default radrPlugin;
