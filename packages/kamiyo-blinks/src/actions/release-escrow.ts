import {
  ActionGetResponse,
  ActionPostRequest,
  ActionPostResponse,
} from '@solana/actions';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { KamiyoClient } from '@kamiyo/sdk';
import { KAMIYO_PROGRAM_ID, RPC_URL, ICON_URL, CORS_HEADERS, BASE_URL } from '../constants';

export function getReleaseEscrowAction(requestUrl: URL): ActionGetResponse {
  const escrowId = requestUrl.searchParams.get('escrowId');
  const provider = requestUrl.searchParams.get('provider');

  return {
    type: 'action',
    icon: ICON_URL,
    title: 'Release Kamiyo Escrow',
    description: 'Release escrowed funds to the provider after successful delivery.',
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
              label: 'Escrow ID',
              required: true,
              type: 'text',
              ...(escrowId && { value: escrowId }),
            },
            {
              name: 'provider',
              label: 'Provider address',
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
  const escrowId = requestUrl.searchParams.get('escrowId');
  const provider = requestUrl.searchParams.get('provider');

  if (!escrowId || !provider) {
    throw new Error('Missing escrowId or provider');
  }

  const providerPubkey = new PublicKey(provider);
  const payerPubkey = new PublicKey(request.account);

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

  const ix = client.buildReleaseFundsInstruction(payerPubkey, escrowId, providerPubkey);

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
    message: `Funds released to ${provider.slice(0, 8)}...`,
  };
}

export { CORS_HEADERS };
