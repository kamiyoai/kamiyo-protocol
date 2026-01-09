import { ActionGetResponse } from '@solana/actions';
import { PublicKey } from '@solana/web3.js';
import { ICON_URL, BASE_URL } from '../constants';
import { shortenAddress, createReadOnlyClient, lamportsToSol } from '../utils';

function getRiskEmoji(risk: string): string {
  switch (risk) {
    case 'low': return '';
    case 'medium': return '';
    case 'high': return '';
    default: return '';
  }
}

function getRiskDescription(risk: string, score: number): string {
  switch (risk) {
    case 'low':
      return `Strong track record with ${score}% trust score.`;
    case 'medium':
      return `Some concerns. Review history before transacting.`;
    case 'high':
      return `High risk. Exercise caution.`;
    default:
      return `Unable to assess risk.`;
  }
}

export async function getReputationAction(requestUrl: URL): Promise<ActionGetResponse> {
  const address = requestUrl.searchParams.get('address');

  if (!address) {
    return {
      type: 'action',
      icon: ICON_URL,
      title: 'Check Kamiyo Reputation',
      description: 'Look up on-chain trust score, transaction history, and dispute rate for any Solana address.',
      label: 'Check',
      links: {
        actions: [
          {
            type: 'post',
            label: 'Check Reputation',
            href: `${BASE_URL}/api/actions/reputation?address={address}`,
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

  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(address);
  } catch {
    return {
      type: 'action',
      icon: ICON_URL,
      title: 'Invalid Address',
      description: 'The provided address is not a valid Solana wallet address.',
      label: 'Error',
      disabled: true,
    };
  }

  const shortAddr = shortenAddress(address);
  const client = createReadOnlyClient(pubkey);

  try {
    const [reputation, agent] = await Promise.all([
      client.getReputation(pubkey),
      client.getAgentByOwner(pubkey),
    ]);

    if (!reputation && !agent) {
      return {
        type: 'action',
        icon: ICON_URL,
        title: `${shortAddr} - New User`,
        description: 'No transaction history with Kamiyo protocol. This address has not participated in any escrows.',
        label: 'No History',
        links: {
          actions: [
            {
              type: 'transaction',
              label: 'Create Escrow with This Address',
              href: `${BASE_URL}/api/actions/create-escrow?provider=${address}`,
            },
          ],
        },
      };
    }

    const score = agent?.reputation?.toNumber() ?? reputation?.reputationScore ?? 0;
    const totalTx = agent?.totalEscrows?.toNumber() ?? reputation?.totalTransactions?.toNumber() ?? 0;
    const successful = agent?.successfulEscrows?.toNumber() ?? 0;
    const disputes = agent?.disputedEscrows?.toNumber() ?? reputation?.disputesFiled?.toNumber() ?? 0;
    const stake = agent?.stakeAmount ? lamportsToSol(agent.stakeAmount.toNumber()) : 0;
    const disputeRate = totalTx > 0 ? Math.round((disputes / totalTx) * 100) : 0;
    const successRate = totalTx > 0 ? Math.round((successful / totalTx) * 100) : 0;

    let riskLevel = 'low';
    if (score < 60 || disputeRate > 20) riskLevel = 'high';
    else if (score < 75 || disputeRate > 10) riskLevel = 'medium';

    const statsLine = [
      `${totalTx} escrows`,
      `${successRate}% success`,
      `${disputeRate}% disputed`,
      stake > 0 ? `${stake.toFixed(2)} SOL staked` : null,
    ].filter(Boolean).join(' | ');

    return {
      type: 'action',
      icon: ICON_URL,
      title: `${shortAddr} - ${score}% Trust ${getRiskEmoji(riskLevel)}`,
      description: `${getRiskDescription(riskLevel, score)}\n\n${statsLine}`,
      label: `${riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)} Risk`,
      links: {
        actions: [
          {
            type: 'transaction',
            label: 'Create Escrow',
            href: `${BASE_URL}/api/actions/create-escrow?provider=${address}`,
          },
          {
            type: 'external-link',
            label: 'View on Solscan',
            href: `https://solscan.io/account/${address}`,
          },
        ],
      },
    };
  } catch (error) {
    return {
      type: 'action',
      icon: ICON_URL,
      title: `${shortAddr} - Lookup Failed`,
      description: 'Could not fetch reputation data. The address may not have interacted with Kamiyo.',
      label: 'Error',
      links: {
        actions: [
          {
            type: 'transaction',
            label: 'Try Creating Escrow',
            href: `${BASE_URL}/api/actions/create-escrow?provider=${address}`,
          },
        ],
      },
    };
  }
}
