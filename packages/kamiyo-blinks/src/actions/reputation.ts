import { ActionGetResponse } from '@solana/actions';
import { Connection, PublicKey } from '@solana/web3.js';
import { KamiyoClient } from '@kamiyo/sdk';
import { KAMIYO_PROGRAM_ID, RPC_URL, ICON_URL, CORS_HEADERS, BASE_URL } from '../constants';

export async function getReputationAction(requestUrl: URL): Promise<ActionGetResponse> {
  const address = requestUrl.searchParams.get('address');

  if (!address) {
    return {
      type: 'action',
      icon: ICON_URL,
      title: 'Check Kamiyo Reputation',
      description: 'Look up on-chain reputation score for any address.',
      label: 'Check Reputation',
      links: {
        actions: [
          {
            type: 'external-link',
            label: 'Check Reputation',
            href: `${BASE_URL}/reputation?address={address}`,
            parameters: [
              {
                name: 'address',
                label: 'Wallet address',
                required: true,
                type: 'text',
              },
            ],
          },
        ],
      },
    };
  }

  // Fetch reputation data
  const connection = new Connection(RPC_URL, 'confirmed');
  const client = new KamiyoClient({
    connection,
    wallet: {
      publicKey: new PublicKey(address),
      signTransaction: async (tx) => tx,
      signAllTransactions: async (txs) => txs,
    } as any,
    programId: KAMIYO_PROGRAM_ID,
  });

  try {
    const pubkey = new PublicKey(address);
    const reputation = await client.getReputation(pubkey);
    const agent = await client.getAgentByOwner(pubkey);

    if (!reputation && !agent) {
      return {
        type: 'action',
        icon: ICON_URL,
        title: `${address.slice(0, 8)}... - No History`,
        description: 'This address has no on-chain reputation history with Kamiyo.',
        label: 'No Data',
        disabled: true,
      };
    }

    const score = agent?.reputation?.toNumber() ?? reputation?.reputationScore ?? 0;
    const totalTx = agent?.totalEscrows?.toNumber() ?? reputation?.totalTransactions?.toNumber() ?? 0;
    const disputes = agent?.disputedEscrows?.toNumber() ?? reputation?.disputesFiled?.toNumber() ?? 0;
    const disputeRate = totalTx > 0 ? Math.round((disputes / totalTx) * 100) : 0;

    let riskLevel = 'Low';
    if (score < 60 || disputeRate > 20) riskLevel = 'High';
    else if (score < 75 || disputeRate > 10) riskLevel = 'Medium';

    return {
      type: 'action',
      icon: ICON_URL,
      title: `${address.slice(0, 8)}... - ${score}% Reputation`,
      description: `${totalTx} agreements | ${disputeRate}% dispute rate | ${riskLevel} risk`,
      label: `${score}% Trust Score`,
      disabled: true,
    };
  } catch (error) {
    return {
      type: 'action',
      icon: ICON_URL,
      title: `${address.slice(0, 8)}... - Lookup Failed`,
      description: 'Could not fetch reputation data. Address may be invalid.',
      label: 'Error',
      disabled: true,
    };
  }
}

export { CORS_HEADERS };
