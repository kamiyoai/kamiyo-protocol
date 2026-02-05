import {
  ActionGetResponse,
  ActionPostRequest,
  ActionPostResponse,
} from '@solana/actions';
import { ICON_URL, BASE_URL } from '../constants';
import {
  validatePublicKey,
  shortenAddress,
  createReadOnlyClient,
  getConnection,
  buildAndSerializeTransaction,
} from '../utils';

function assertValidEscrowId(id: string): string {
  const trimmed = id.trim();
  if (!/^[a-z0-9_:\-]{3,128}$/i.test(trimmed)) throw new Error('Invalid Escrow ID');
  return trimmed;
}

export function getReleaseEscrowAction(requestUrl: URL): ActionGetResponse {
  const escrowId = requestUrl.searchParams.get('escrowId');
  const provider = requestUrl.searchParams.get('provider');

  if (escrowId && provider) {
    return {
      type: 'action',
      icon: ICON_URL,
      title: `Release to ${shortenAddress(provider)}`,
      description: `Release escrowed funds for escrow ${escrowId}. This confirms successful delivery.`,
      label: 'Release Funds',
      links: {
        actions: [
          {
            type: 'transaction',
            label: 'Confirm Release',
            href: `${BASE_URL}/api/actions/release-escrow?escrowId=${encodeURIComponent(
              escrowId
            )}&provider=${encodeURIComponent(provider)}`,
          },
          {
            type: 'transaction',
            label: 'Dispute Instead',
            href: `${BASE_URL}/api/actions/dispute?escrowId=${encodeURIComponent(
              escrowId
            )}`,
          },
        ],
      },
    };
  }

  return {
    type: 'action',
    icon: ICON_URL,
    title: 'Release KAMIYO Escrow',
    description:
      'Release escrowed funds to the provider after successful delivery.',
    label: 'Release Funds',
    links: {
      actions: [
        {
          type: 'transaction',
          label: 'Release Funds',
          href: `${BASE_URL}/api/actions/release-escrow?escrowId={escrowId}&provider={provider}`,
          parameters: [
            {
              name: 'escrowId',
              label: 'Escrow ID (e.g., blink_abc123)',
              required: true,
              type: 'text',
              ...(escrowId && { value: escrowId }),
            },
            {
              name: 'provider',
              label: 'Provider wallet address',
              required: true,
              type: 'text',
              ...(provider && { value: provider }),
            },
          ],
        },
      ],
    },
  };
}

export async function postReleaseEscrow(
  request: ActionPostRequest,
  requestUrl: URL
): Promise<ActionPostResponse> {
  const escrowIdParam = requestUrl.searchParams.get('escrowId');
  const providerParam = requestUrl.searchParams.get('provider');

  if (!escrowIdParam) throw new Error('Escrow ID is required');
  if (!providerParam) throw new Error('Provider address is required');

  const escrowId = assertValidEscrowId(escrowIdParam);
  const providerPubkey = validatePublicKey(providerParam, 'provider');
  const payerPubkey = validatePublicKey(request.account, 'payer');

  const connection = getConnection();
  const client = createReadOnlyClient(payerPubkey);

  try {
    const ix = client.buildReleaseFundsInstruction(
      payerPubkey,
      escrowId,
      providerPubkey
    );
    const transaction = await buildAndSerializeTransaction(
      connection,
      payerPubkey,
      ix
    );

    return {
      type: 'transaction',
      transaction,
      message: `Funds released to ${shortenAddress(
        providerParam
      )}. Transaction complete.`,
      links: {
        next: {
          type: 'inline',
          action: {
            type: 'action',
            icon: ICON_URL,
            title: 'Payment Complete',
            description: `You released funds to ${shortenAddress(
              providerParam
            )}. Check their updated reputation.`,
            label: 'Done',
            links: {
              actions: [
                {
                  type: 'external-link',
                  label: 'View Reputation',
                  href: `${BASE_URL}/api/actions/reputation?address=${encodeURIComponent(
                    providerParam
                  )}`,
                },
                {
                  type: 'transaction',
                  label: 'Create New Escrow',
                  href: `${BASE_URL}/api/actions/create-escrow?provider=${encodeURIComponent(
                    providerParam
                  )}`,
                },
              ],
            },
          },
        },
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Transaction build failed';
    throw new Error(`Release failed: ${msg}`);
  }
}
