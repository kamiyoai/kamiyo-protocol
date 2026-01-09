/**
 * Kamiyo Blinks - Solana Actions for escrow protocol
 *
 * Deploy these handlers to any serverless platform (Vercel, Cloudflare, etc.)
 * or use with Next.js API routes.
 */

import { ActionPostRequest } from '@solana/actions';
import { CORS_HEADERS } from './constants';
import {
  getCreateEscrowAction,
  postCreateEscrow,
  getReleaseEscrowAction,
  postReleaseEscrow,
  getDisputeAction,
  postDispute,
  getReputationAction,
} from './actions';

export * from './constants';
export * from './actions';

export type ActionType = 'create-escrow' | 'release-escrow' | 'dispute' | 'reputation';

/**
 * Handle GET requests - return action metadata
 */
export async function handleGet(
  action: ActionType,
  requestUrl: URL
): Promise<Response> {
  let payload;

  switch (action) {
    case 'create-escrow':
      payload = getCreateEscrowAction(requestUrl);
      break;
    case 'release-escrow':
      payload = getReleaseEscrowAction(requestUrl);
      break;
    case 'dispute':
      payload = getDisputeAction(requestUrl);
      break;
    case 'reputation':
      payload = await getReputationAction(requestUrl);
      break;
    default:
      return new Response(JSON.stringify({ error: 'Unknown action' }), {
        status: 404,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
  }

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/**
 * Handle POST requests - return transaction to sign
 */
export async function handlePost(
  action: ActionType,
  request: ActionPostRequest,
  requestUrl: URL
): Promise<Response> {
  try {
    let payload;

    switch (action) {
      case 'create-escrow':
        payload = await postCreateEscrow(request, requestUrl);
        break;
      case 'release-escrow':
        payload = await postReleaseEscrow(request, requestUrl);
        break;
      case 'dispute':
        payload = await postDispute(request, requestUrl);
        break;
      case 'reputation':
        return new Response(JSON.stringify({ error: 'Reputation is read-only' }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), {
          status: 404,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Handle OPTIONS requests - CORS preflight
 */
export function handleOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

/**
 * actions.json content for the root endpoint
 */
export const actionsJson = {
  rules: [
    {
      pathPattern: '/api/actions/create-escrow',
      apiPath: '/api/actions/create-escrow',
    },
    {
      pathPattern: '/api/actions/release-escrow',
      apiPath: '/api/actions/release-escrow',
    },
    {
      pathPattern: '/api/actions/dispute',
      apiPath: '/api/actions/dispute',
    },
    {
      pathPattern: '/api/actions/reputation',
      apiPath: '/api/actions/reputation',
    },
  ],
};
