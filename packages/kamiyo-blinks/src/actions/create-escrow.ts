import {
  ActionGetResponse,
  ActionPostRequest,
  ActionPostResponse,
} from '@solana/actions';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { KamiyoClient } from '@kamiyo/sdk';
import { KAMIYO_PROGRAM_ID, RPC_URL, ICON_URL, CORS_HEADERS, BASE_URL } from '../constants';

export function getCreateEscrowAction(requestUrl: URL): ActionGetResponse {
  const provider = requestUrl.searchParams.get('provider');

  return {
    type: 'action',
    icon: ICON_URL,
    title: 'Create Kamiyo Escrow',
    description: 'Lock SOL in escrow for a provider. Funds released on delivery or refunded via dispute.',
    label: 'Create Escrow',
    links: {
      actions: [
        {
          type: 'transaction',
          label: 'Create Escrow',
          href: `${BASE_URL}/api/actions/create-escrow?provider={provider}&amount={amount}`,
          parameters: [
            {
              name: 'provider',
              label: 'Provider address',
              required: true,
              type: 'text',
              ...(provider && { value: provider }),
            },
            {
              name: 'amount',
              label: 'Amount (SOL)',
              required: true,
              type: 'number',
              min: 0.001,
            },
          ],
        },
      ],
    },
  };
}

export async function postCreateEscrow(
  request: ActionPostRequest,
  requestUrl: URL
): Promise<ActionPostResponse> {
  const provider = requestUrl.searchParams.get('provider');
  const amountStr = requestUrl.searchParams.get('amount');

  if (!provider || !amountStr) {
    throw new Error('Missing provider or amount');
  }

  const providerPubkey = new PublicKey(provider);
  const payerPubkey = new PublicKey(request.account);
  const amount = parseFloat(amountStr);
  const lamports = Math.floor(amount * 1e9);

  const connection = new Connection(RPC_URL, 'confirmed');

  const client = new KamiyoClient({
    connection,
    wallet: {
      publicKey: payerPubkey,
      signTransaction: async (tx: Transaction) => tx,
      signAllTransactions: async (txs: Transaction[]) => txs,
    } as any,
    programId: KAMIYO_PROGRAM_ID,
  });

  const transactionId = `blink_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const timeLockSeconds = 86400; // 24 hours

  const ix = client.buildCreateAgreementInstruction(payerPubkey, {
    provider: providerPubkey,
    amount: new BN(lamports),
    timeLockSeconds: new BN(timeLockSeconds),
    transactionId,
  });

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

  const transaction = new Transaction({
    feePayer: payerPubkey,
    blockhash,
    lastValidBlockHeight,
  }).add(ix);

  const serialized = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });

  return {
    type: 'transaction',
    transaction: Buffer.from(serialized).toString('base64'),
    message: `Escrow created: ${amount} SOL for ${provider.slice(0, 8)}... (24h timelock)`,
  };
}

export { CORS_HEADERS };
