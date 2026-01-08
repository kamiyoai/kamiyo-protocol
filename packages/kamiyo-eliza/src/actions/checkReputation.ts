import type { Action, IAgentRuntime, Memory, State, HandlerCallback, AgentIdentity } from '../types';
import { getNetworkConfig, createConnection, parseAddress } from '../utils';

export const checkReputationAction: Action = {
  name: 'CHECK_KAMIYO_REPUTATION',
  description: 'Check agent or provider reputation on Kamiyo.',
  similes: ['reputation', 'trust score', 'check provider'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Check reputation of ABC123...' } },
      { user: '{{agent}}', content: { text: 'ABC123: 92% reputation, 150 agreements.', action: 'CHECK_KAMIYO_REPUTATION' } },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return text.includes('reputation') || text.includes('trust');
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ success: boolean; reputation?: AgentIdentity; error?: string }> {
    const { rpcUrl } = getNetworkConfig(runtime);
    const text = message.content.text || '';
    const address = parseAddress(text) || (message.content.address as string);

    if (!address) {
      callback?.({ text: 'Specify address to check' });
      return { success: false, error: 'Address not specified' };
    }

    try {
      const connection = createConnection(rpcUrl);

      // TODO: Replace with actual Kamiyo SDK call
      // const agent = await kamiyoClient.getAgent(address);
      const reputation: AgentIdentity = {
        address,
        owner: address,
        name: 'Agent',
        stake: 0.5,
        reputation: 85,
        totalAgreements: 100,
        successfulAgreements: 92,
        createdAt: Date.now() - 30 * 24 * 3600 * 1000,
      };

      const disputes = reputation.totalAgreements - reputation.successfulAgreements;

      callback?.({
        text: `${address.slice(0, 8)}...: ${reputation.reputation}% rep, ${reputation.totalAgreements} agreements, ${disputes} disputes, ${reputation.stake} SOL staked`,
        content: { ...reputation, disputes },
      });

      return { success: true, reputation };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      callback?.({ text: `Failed: ${error}` });
      return { success: false, error };
    }
  },
};
