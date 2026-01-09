import {
  ActionGetResponse,
  ActionPostRequest,
  ActionPostResponse,
} from '@solana/actions';
import { ICON_URL, BASE_URL } from '../constants';
import {
  validatePublicKey,
  createReadOnlyClient,
  getConnection,
  buildAndSerializeTransaction,
} from '../utils';

const DISPUTE_REASONS = [
  { label: 'Did not deliver', value: 'no_delivery' },
  { label: 'Poor quality', value: 'poor_quality' },
  { label: 'Incomplete work', value: 'incomplete' },
  { label: 'Not as described', value: 'misrepresented' },
  { label: 'Other', value: 'other' },
] as const;

export function getDisputeAction(requestUrl: URL): ActionGetResponse {
  const escrowId = requestUrl.searchParams.get('escrowId');

  if (escrowId) {
    return {
      type: 'action',
      icon: ICON_URL,
      title: `Dispute Escrow ${escrowId.slice(0, 12)}...`,
      description: 'File a dispute for oracle arbitration. Oracles will vote on refund percentage based on evidence.',
      label: 'File Dispute',
      links: {
        actions: [
          {
            type: 'transaction',
            label: 'File Dispute',
            href: `${BASE_URL}/api/actions/dispute?escrowId=${escrowId}&reason={reason}`,
            parameters: [
              {
                name: 'reason',
                label: 'Reason for dispute',
                required: true,
                type: 'select',
                options: DISPUTE_REASONS.map(r => ({ label: r.label, value: r.value })),
              },
            ],
          },
          {
            type: 'transaction',
            label: 'Release Instead',
            href: `${BASE_URL}/api/actions/release-escrow?escrowId=${escrowId}&provider={provider}`,
            parameters: [
              {
                name: 'provider',
                label: 'Provider address',
                required: true,
                type: 'text',
              },
            ],
          },
        ],
      },
    };
  }

  return {
    type: 'action',
    icon: ICON_URL,
    title: 'File KAMIYO Dispute',
    description: 'File a dispute for oracle arbitration. Refund determined by quality assessment.',
    label: 'File Dispute',
    links: {
      actions: [
        {
          type: 'transaction',
          label: 'File Dispute',
          href: `${BASE_URL}/api/actions/dispute?escrowId={escrowId}&reason={reason}`,
          parameters: [
            {
              name: 'escrowId',
              label: 'Escrow ID',
              required: true,
              type: 'text',
            },
            {
              name: 'reason',
              label: 'Reason for dispute',
              required: true,
              type: 'select',
              options: DISPUTE_REASONS.map(r => ({ label: r.label, value: r.value })),
            },
          ],
        },
      ],
    },
  };
}

export async function postDispute(
  request: ActionPostRequest,
  requestUrl: URL
): Promise<ActionPostResponse> {
  const escrowId = requestUrl.searchParams.get('escrowId');
  const reason = requestUrl.searchParams.get('reason') || 'other';

  if (!escrowId) {
    throw new Error('Escrow ID is required');
  }

  const payerPubkey = validatePublicKey(request.account, 'payer');

  const connection = getConnection();
  const client = createReadOnlyClient(payerPubkey);

  const ix = client.buildMarkDisputedInstruction(payerPubkey, escrowId);
  const transaction = await buildAndSerializeTransaction(connection, payerPubkey, ix);

  const reasonLabel = DISPUTE_REASONS.find(r => r.value === reason)?.label || reason;

  return {
    type: 'transaction',
    transaction,
    message: `Dispute filed: ${reasonLabel}. Oracles will arbitrate within 24-48 hours.`,
    links: {
      next: {
        type: 'inline',
        action: {
          type: 'action',
          icon: ICON_URL,
          title: 'Dispute Filed',
          description: 'Your dispute has been submitted. Switchboard oracles will vote on the outcome.',
          label: 'Pending',
          disabled: true,
        },
      },
    },
  };
}
