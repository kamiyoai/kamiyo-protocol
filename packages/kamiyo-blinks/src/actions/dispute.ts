import {
  ActionGetResponse,
  ActionPostRequest,
  ActionPostResponse,
} from '@solana/actions';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { KamiyoClient } from '@kamiyo/sdk';
import { KAMIYO_PROGRAM_ID, RPC_URL, ICON_URL, CORS_HEADERS, BASE_URL } from '../constants';

export function getDisputeAction(requestUrl: URL): ActionGetResponse {
  const escrowId = requestUrl.searchParams.get('escrowId');

  return {
    type: 'action',
    icon: ICON_URL,
    title: 'File Kamiyo Dispute',
    description: 'File a dispute for oracle arbitration. Refund determined by quality score.',
    label: 'File Dispute',
    links: {
      actions: [
        {
          type: 'transaction',
          label: 'File Dispute',
          href: `${BASE_URL}/api/actions/dispute?escrowId={escrowId}`,
          parameters: [
            {
              name: 'escrowId',
              label: 'Escrow ID',
              required: true,
              type: 'text',
              ...(escrowId && { value: escrowId }),
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

  if (!escrowId) {
    throw new Error('Missing escrowId');
  }

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

  const ix = client.buildMarkDisputedInstruction(payerPubkey, escrowId);

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
    message: `Dispute filed for escrow ${escrowId}. Oracles will arbitrate.`,
  };
}

export { CORS_HEADERS };
