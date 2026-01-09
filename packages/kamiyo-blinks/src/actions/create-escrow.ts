import {
  ActionGetResponse,
  ActionPostRequest,
  ActionPostResponse,
  LinkedAction,
} from '@solana/actions';
import { BN } from '@coral-xyz/anchor';
import {
  ICON_URL,
  BASE_URL,
  ESCROW_CONFIG,
  TIMELOCK_OPTIONS,
} from '../constants';
import {
  validatePublicKey,
  validateAmount,
  solToLamports,
  shortenAddress,
  generateEscrowId,
  createReadOnlyClient,
  getConnection,
  buildAndSerializeTransaction,
  formatTimeLock,
} from '../utils';

export function getCreateEscrowAction(requestUrl: URL): ActionGetResponse {
  const provider = requestUrl.searchParams.get('provider');
  const presetAmount = requestUrl.searchParams.get('amount');

  const actions: LinkedAction[] = [];

  if (provider) {
    for (const amount of ESCROW_CONFIG.QUICK_AMOUNTS) {
      actions.push({
        type: 'transaction',
        label: `${amount} SOL`,
        href: `${BASE_URL}/api/actions/create-escrow?provider=${provider}&amount=${amount}&timelock=24h`,
      });
    }

    actions.push({
      type: 'transaction',
      label: 'Custom Amount',
      href: `${BASE_URL}/api/actions/create-escrow?provider=${provider}&amount={amount}&timelock={timelock}`,
      parameters: [
        {
          name: 'amount',
          label: 'Amount (SOL)',
          required: true,
          type: 'number',
          min: ESCROW_CONFIG.MIN_AMOUNT_SOL,
          max: ESCROW_CONFIG.MAX_AMOUNT_SOL,
          ...(presetAmount && { value: presetAmount }),
        },
        {
          name: 'timelock',
          label: 'Timelock',
          required: true,
          type: 'select',
          options: [
            { label: '1 hour', value: '1h' },
            { label: '24 hours', value: '24h', selected: true },
            { label: '7 days', value: '7d' },
            { label: '30 days', value: '30d' },
          ],
        },
      ],
    });
  } else {
    actions.push({
      type: 'transaction',
      label: 'Create Escrow',
      href: `${BASE_URL}/api/actions/create-escrow?provider={provider}&amount={amount}&timelock={timelock}`,
      parameters: [
        {
          name: 'provider',
          label: 'Provider wallet address',
          required: true,
          type: 'text',
        },
        {
          name: 'amount',
          label: 'Amount (SOL)',
          required: true,
          type: 'number',
          min: ESCROW_CONFIG.MIN_AMOUNT_SOL,
          max: ESCROW_CONFIG.MAX_AMOUNT_SOL,
        },
        {
          name: 'timelock',
          label: 'Timelock period',
          required: true,
          type: 'select',
          options: [
            { label: '1 hour', value: '1h' },
            { label: '24 hours', value: '24h', selected: true },
            { label: '7 days', value: '7d' },
            { label: '30 days', value: '30d' },
          ],
        },
      ],
    });
  }

  const shortProvider = provider ? shortenAddress(provider) : 'provider';

  return {
    type: 'action',
    icon: ICON_URL,
    title: provider ? `Pay ${shortProvider}` : 'Create Kamiyo Escrow',
    description: provider
      ? `Lock SOL in escrow for ${shortProvider}. Release after delivery or dispute for refund.`
      : 'Lock SOL in escrow. Funds are released on delivery or refunded via oracle arbitration.',
    label: 'Create Escrow',
    links: { actions },
  };
}

export async function postCreateEscrow(
  request: ActionPostRequest,
  requestUrl: URL
): Promise<ActionPostResponse> {
  const providerParam = requestUrl.searchParams.get('provider');
  const amountParam = requestUrl.searchParams.get('amount');
  const timelockParam = requestUrl.searchParams.get('timelock') || '24h';

  if (!providerParam) {
    throw new Error('Provider address is required');
  }

  if (!amountParam) {
    throw new Error('Amount is required');
  }

  const providerPubkey = validatePublicKey(providerParam, 'provider');
  const payerPubkey = validatePublicKey(request.account, 'payer');
  const amount = validateAmount(amountParam);
  const lamports = solToLamports(amount);

  const timelockSeconds = TIMELOCK_OPTIONS[timelockParam as keyof typeof TIMELOCK_OPTIONS]
    ?? TIMELOCK_OPTIONS['24h'];

  const connection = getConnection();
  const client = createReadOnlyClient(payerPubkey);

  const escrowId = generateEscrowId();

  const ix = client.buildCreateAgreementInstruction(payerPubkey, {
    provider: providerPubkey,
    amount: new BN(lamports),
    timeLockSeconds: new BN(timelockSeconds),
    transactionId: escrowId,
  });

  const transaction = await buildAndSerializeTransaction(connection, payerPubkey, ix);

  return {
    type: 'transaction',
    transaction,
    message: `Escrow created: ${amount} SOL for ${shortenAddress(providerParam)} (${formatTimeLock(timelockSeconds)} timelock). ID: ${escrowId}`,
    links: {
      next: {
        type: 'inline',
        action: {
          type: 'action',
          icon: ICON_URL,
          title: 'Escrow Created',
          description: `Your escrow is active. Use the ID below to release or dispute.`,
          label: 'Next Steps',
          links: {
            actions: [
              {
                type: 'transaction',
                label: 'Release Funds',
                href: `${BASE_URL}/api/actions/release-escrow?escrowId=${escrowId}&provider=${providerParam}`,
              },
              {
                type: 'transaction',
                label: 'File Dispute',
                href: `${BASE_URL}/api/actions/dispute?escrowId=${escrowId}`,
              },
            ],
          },
        },
      },
    },
  };
}
